import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Date, case
from pydantic import BaseModel
from jose import jwt, JWTError
from passlib.context import CryptContext

from app.db.base import get_db
from app.models.tenant import Tenant
from app.models.face_subject import FaceSubject
from app.models.audit import AuthAttempt
from app.core.config import settings

router = APIRouter(prefix="/portal", tags=["Tenant Portal"])
bearer = HTTPBearer()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Schemas ───────────────────────────────────────────────────────────────────

class PortalLoginRequest(BaseModel):
    username: str
    password: str


class PortalTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tenant_name: str
    tenant_slug: str
    tenant_id: str


class DailyStat(BaseModel):
    date: str
    total: int
    successful: int
    failed: int
    fraud: int


class DetailedStatsResponse(BaseModel):
    tenant_id: uuid.UUID
    tenant_name: str
    plan: str
    billing_period_start: Optional[datetime] = None

    # Operaciones del mes
    auths_this_month: int
    auth_limit: int
    successful_auths: int
    failed_auths: int
    auth_success_rate: float

    enrollments_this_month: int
    enrollment_limit: int
    active_subjects: int

    liveness_checks_this_month: int
    liveness_limit: int

    # Seguridad
    fraud_attempts: int
    spoof_attempts: int

    # Costos
    estimated_cost_usd: float
    cost_breakdown: dict

    # Tendencia 7 días
    daily_stats: list[DailyStat]

    # API
    api_online: bool
    api_key_masked: str


# ── Auth dependency ───────────────────────────────────────────────────────────

async def get_portal_tenant(
    credentials: HTTPAuthorizationCredentials = Security(bearer),
    db: AsyncSession = Depends(get_db),
) -> Tenant:
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        tenant_id: str = payload.get("sub")
        if not tenant_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    tenant = (await db.execute(select(Tenant).where(Tenant.id == uuid.UUID(tenant_id)))).scalar_one_or_none()
    if not tenant or not tenant.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tenant not found or inactive")
    return tenant


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=PortalTokenResponse)
async def portal_login(payload: PortalLoginRequest, db: AsyncSession = Depends(get_db)):
    tenant = (await db.execute(
        select(Tenant).where(Tenant.portal_username == payload.username, Tenant.is_active == True)
    )).scalar_one_or_none()

    if not tenant or not tenant.portal_password_hash or not pwd_context.verify(payload.password, tenant.portal_password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario o contraseña incorrectos")

    expire = datetime.now(timezone.utc) + timedelta(hours=settings.PORTAL_TOKEN_EXPIRE_HOURS)
    token = jwt.encode(
        {"sub": str(tenant.id), "slug": tenant.slug, "name": tenant.name, "exp": expire},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    return PortalTokenResponse(
        access_token=token,
        tenant_name=tenant.name,
        tenant_slug=tenant.slug,
        tenant_id=str(tenant.id),
    )


@router.get("/stats", response_model=DetailedStatsResponse)
async def portal_stats(
    tenant: Tenant = Depends(get_portal_tenant),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()
    period_start = (tenant.billing_period_start or now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)).replace(tzinfo=None)

    # Subjects
    active_subjects = await db.scalar(
        select(func.count()).where(FaceSubject.tenant_id == tenant.id, FaceSubject.is_active == True, FaceSubject.is_enrolled == True)
    ) or 0

    # Auth counts
    total_auths = await db.scalar(
        select(func.count()).where(AuthAttempt.tenant_id == tenant.id, AuthAttempt.created_at >= period_start)
    ) or 0

    successful_auths = await db.scalar(
        select(func.count()).where(AuthAttempt.tenant_id == tenant.id, AuthAttempt.created_at >= period_start, AuthAttempt.success == True)
    ) or 0

    fraud_attempts = await db.scalar(
        select(func.count()).where(AuthAttempt.tenant_id == tenant.id, AuthAttempt.created_at >= period_start, AuthAttempt.deepfake_detected == True)
    ) or 0

    spoof_attempts = await db.scalar(
        select(func.count()).where(AuthAttempt.tenant_id == tenant.id, AuthAttempt.created_at >= period_start, AuthAttempt.is_real_face == False)
    ) or 0

    # Cost
    total_cost = await db.scalar(
        select(func.coalesce(func.sum(AuthAttempt.amount_charged), 0.0)).where(
            AuthAttempt.tenant_id == tenant.id, AuthAttempt.created_at >= period_start, AuthAttempt.billed == True
        )
    ) or 0.0

    # Daily stats last 7 days
    seven_days_ago = now - timedelta(days=7)
    rows = (await db.execute(
        select(
            cast(AuthAttempt.created_at, Date).label("day"),
            func.count().label("total"),
            func.sum(case((AuthAttempt.success == True, 1), else_=0)).label("successful"),
            func.sum(case((AuthAttempt.deepfake_detected == True, 1), else_=0)).label("fraud"),
        ).where(
            AuthAttempt.tenant_id == tenant.id,
            AuthAttempt.created_at >= seven_days_ago,
        ).group_by(cast(AuthAttempt.created_at, Date)).order_by("day")
    )).all()

    daily_stats = [
        DailyStat(
            date=str(r.day),
            total=r.total,
            successful=r.successful,
            failed=r.total - r.successful,
            fraud=r.fraud,
        )
        for r in rows
    ]

    failed_auths = total_auths - successful_auths
    success_rate = round(successful_auths / total_auths, 4) if total_auths > 0 else 0.0

    # Cost breakdown
    from app.core.config import settings as cfg
    enroll_cost = (tenant.current_month_enrollments or 0) * (tenant.custom_price_enrollment or cfg.PRICE_ENROLLMENT)
    auth_cost = (tenant.current_month_auths or 0) * (tenant.custom_price_auth or cfg.PRICE_AUTH)
    liveness_cost = (tenant.current_month_liveness_checks or 0) * (tenant.custom_price_liveness or cfg.PRICE_LIVENESS_CHECK)

    key = tenant.api_key
    masked = f"{key[:8]}{'*' * (len(key) - 12)}{key[-4:]}"

    return DetailedStatsResponse(
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        plan=tenant.plan,
        billing_period_start=tenant.billing_period_start,
        auths_this_month=tenant.current_month_auths or 0,
        auth_limit=tenant.monthly_auth_limit,
        successful_auths=successful_auths,
        failed_auths=failed_auths,
        auth_success_rate=success_rate,
        enrollments_this_month=tenant.current_month_enrollments or 0,
        enrollment_limit=tenant.monthly_enroll_limit,
        active_subjects=active_subjects,
        liveness_checks_this_month=tenant.current_month_liveness_checks or 0,
        liveness_limit=tenant.monthly_liveness_limit or 500,
        fraud_attempts=fraud_attempts,
        spoof_attempts=spoof_attempts,
        estimated_cost_usd=round(total_cost, 4),
        cost_breakdown={
            "enrollments": round(enroll_cost, 4),
            "authentications": round(auth_cost, 4),
            "liveness": round(liveness_cost, 4),
            "total": round(enroll_cost + auth_cost + liveness_cost, 4),
        },
        daily_stats=daily_stats,
        api_online=True,
        api_key_masked=masked,
    )


@router.get("/health")
async def portal_health(tenant: Tenant = Depends(get_portal_tenant), db: AsyncSession = Depends(get_db)):
    try:
        await db.scalar(select(func.count()).where(Tenant.id == tenant.id))
        db_ok = True
    except Exception:
        db_ok = False

    return {
        "api": "online",
        "database": "ok" if db_ok else "error",
        "tenant": tenant.name,
        "api_key_prefix": tenant.api_key[:8] + "...",
        "is_active": tenant.is_active,
        "plan": tenant.plan,
    }
