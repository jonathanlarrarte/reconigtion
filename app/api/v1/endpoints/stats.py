from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.base import get_db
from app.models.tenant import Tenant
from app.models.face_subject import FaceSubject
from app.models.audit import AuthAttempt
from app.schemas.stats import StatsResponse
from app.core.security import get_current_tenant

router = APIRouter(prefix="/stats", tags=["Stats"])


def _billing_period_start(tenant: Tenant) -> datetime:
    if tenant.billing_period_start:
        return tenant.billing_period_start
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


@router.get("", response_model=StatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    tenant: Tenant = Depends(get_current_tenant),
):
    """
    Estadísticas de uso del tenant para el período de facturación actual.
    """
    period_start = _billing_period_start(tenant)

    # Sujetos activos
    active_subjects = await db.scalar(
        select(func.count()).where(
            FaceSubject.tenant_id == tenant.id,
            FaceSubject.is_active == True,
            FaceSubject.is_enrolled == True,
        )
    ) or 0

    # Intentos de auth en el período
    total_auths = await db.scalar(
        select(func.count()).where(
            AuthAttempt.tenant_id == tenant.id,
            AuthAttempt.created_at >= period_start,
        )
    ) or 0

    successful_auths = await db.scalar(
        select(func.count()).where(
            AuthAttempt.tenant_id == tenant.id,
            AuthAttempt.created_at >= period_start,
            AuthAttempt.success == True,
        )
    ) or 0

    fraud_attempts = await db.scalar(
        select(func.count()).where(
            AuthAttempt.tenant_id == tenant.id,
            AuthAttempt.created_at >= period_start,
            AuthAttempt.deepfake_detected == True,
        )
    ) or 0

    total_cost = await db.scalar(
        select(func.coalesce(func.sum(AuthAttempt.amount_charged), 0.0)).where(
            AuthAttempt.tenant_id == tenant.id,
            AuthAttempt.created_at >= period_start,
            AuthAttempt.billed == True,
        )
    ) or 0.0

    success_rate = round(successful_auths / total_auths, 4) if total_auths > 0 else 0.0

    return StatsResponse(
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        plan=tenant.plan,
        billing_period_start=tenant.billing_period_start,
        enrollments_this_month=tenant.current_month_enrollments or 0,
        enrollment_limit=tenant.monthly_enroll_limit,
        active_subjects=active_subjects,
        auths_this_month=tenant.current_month_auths or 0,
        auth_limit=tenant.monthly_auth_limit,
        auth_success_rate=success_rate,
        fraud_attempts_this_month=fraud_attempts,
        estimated_cost_usd=round(total_cost, 4),
    )
