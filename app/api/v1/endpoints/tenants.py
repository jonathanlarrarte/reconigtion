import uuid
import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from passlib.context import CryptContext

from app.db.base import get_db
from app.models.tenant import Tenant

router = APIRouter(prefix="/admin/tenants", tags=["Admin"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class TenantCreate(BaseModel):
    name: str
    slug: str
    plan: str = "starter"
    monthly_auth_limit: int = 1000
    monthly_enroll_limit: int = 200
    monthly_liveness_limit: int = 500
    webhook_url: Optional[str] = None
    portal_username: Optional[str] = None
    portal_password: Optional[str] = None


class TenantOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    api_key: str
    plan: str
    monthly_auth_limit: int
    monthly_enroll_limit: int
    monthly_liveness_limit: int
    current_month_auths: int
    current_month_enrollments: int
    current_month_liveness_checks: int
    portal_username: Optional[str] = None
    anti_spoofing_enabled: bool = True
    liveness_required: bool = False
    webhook_url: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TenantUpdate(BaseModel):
    monthly_auth_limit: Optional[int] = None
    monthly_enroll_limit: Optional[int] = None
    monthly_liveness_limit: Optional[int] = None
    anti_spoofing_enabled: Optional[bool] = None
    liveness_required: Optional[bool] = None
    webhook_url: Optional[str] = None
    plan: Optional[str] = None


class PortalPasswordReset(BaseModel):
    new_password: str


@router.post("/", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
async def create_tenant(payload: TenantCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(Tenant).where(Tenant.slug == payload.slug))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Slug '{payload.slug}' already taken")

    if payload.portal_username:
        username_taken = (await db.execute(select(Tenant).where(Tenant.portal_username == payload.portal_username))).scalar_one_or_none()
        if username_taken:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Username '{payload.portal_username}' already taken")

    api_key = f"fid_{secrets.token_urlsafe(32)}"
    tenant = Tenant(
        name=payload.name,
        slug=payload.slug,
        api_key=api_key,
        plan=payload.plan,
        monthly_auth_limit=payload.monthly_auth_limit,
        monthly_enroll_limit=payload.monthly_enroll_limit,
        monthly_liveness_limit=payload.monthly_liveness_limit,
        webhook_url=payload.webhook_url,
        portal_username=payload.portal_username or None,
        portal_password_hash=pwd_context.hash(payload.portal_password) if payload.portal_password else None,
    )
    db.add(tenant)
    await db.flush()
    return tenant


@router.get("/", response_model=list[TenantOut])
async def list_tenants(db: AsyncSession = Depends(get_db), skip: int = 0, limit: int = 50):
    result = await db.execute(select(Tenant).offset(skip).limit(limit).order_by(Tenant.created_at.desc()))
    return result.scalars().all()


@router.get("/{tenant_id}", response_model=TenantOut)
async def get_tenant(tenant_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return tenant


@router.patch("/{tenant_id}", response_model=TenantOut)
async def update_tenant(tenant_id: uuid.UUID, payload: TenantUpdate, db: AsyncSession = Depends(get_db)):
    """Actualiza límites y configuración de seguridad de un tenant."""
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    if payload.monthly_auth_limit is not None:
        tenant.monthly_auth_limit = payload.monthly_auth_limit
    if payload.monthly_enroll_limit is not None:
        tenant.monthly_enroll_limit = payload.monthly_enroll_limit
    if payload.monthly_liveness_limit is not None:
        tenant.monthly_liveness_limit = payload.monthly_liveness_limit
    if payload.anti_spoofing_enabled is not None:
        tenant.anti_spoofing_enabled = payload.anti_spoofing_enabled
    if payload.liveness_required is not None:
        tenant.liveness_required = payload.liveness_required
    if payload.webhook_url is not None:
        tenant.webhook_url = payload.webhook_url
    if payload.plan is not None:
        tenant.plan = payload.plan
    await db.flush()
    return tenant


@router.patch("/{tenant_id}/deactivate", response_model=TenantOut)
async def deactivate_tenant(tenant_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    tenant.is_active = False
    return tenant


@router.patch("/{tenant_id}/reset-password", response_model=TenantOut)
async def reset_portal_password(
    tenant_id: uuid.UUID,
    payload: PortalPasswordReset,
    db: AsyncSession = Depends(get_db),
):
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La contraseña debe tener al menos 8 caracteres")
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    tenant.portal_password_hash = pwd_context.hash(payload.new_password)
    await db.flush()
    return tenant


@router.post("/billing/reset-month", status_code=status.HTTP_200_OK)
async def trigger_monthly_reset():
    from app.services.scheduler import reset_monthly_counters
    await reset_monthly_counters()
    return {"message": "Monthly billing counters reset successfully"}
