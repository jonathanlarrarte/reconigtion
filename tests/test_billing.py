"""
Unit tests para BillingService — lógica pura sin BD.
"""
import pytest
from unittest.mock import MagicMock, AsyncMock
from app.services.billing import BillingService


def _make_tenant(auths=0, enrollments=0, auth_limit=100, enroll_limit=50):
    t = MagicMock()
    t.current_month_auths = auths
    t.current_month_enrollments = enrollments
    t.monthly_auth_limit = auth_limit
    t.monthly_enroll_limit = enroll_limit
    t.custom_price_enrollment = None
    t.custom_price_auth = None
    return t


svc = BillingService()
_db = AsyncMock()


# ── check_limits ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_enrollment_allowed_under_limit():
    tenant = _make_tenant(enrollments=49, enroll_limit=50)
    ok, msg = await svc.check_limits(tenant, "enrollment")
    assert ok is True
    assert msg == ""


@pytest.mark.asyncio
async def test_enrollment_blocked_at_limit():
    tenant = _make_tenant(enrollments=50, enroll_limit=50)
    ok, msg = await svc.check_limits(tenant, "enrollment")
    assert ok is False
    assert "50" in msg


@pytest.mark.asyncio
async def test_auth_allowed_under_limit():
    tenant = _make_tenant(auths=0, auth_limit=1000)
    ok, _ = await svc.check_limits(tenant, "auth")
    assert ok is True


@pytest.mark.asyncio
async def test_auth_blocked_at_limit():
    tenant = _make_tenant(auths=1000, auth_limit=1000)
    ok, msg = await svc.check_limits(tenant, "auth")
    assert ok is False
    assert "1000" in msg


# ── record_enrollment ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_record_enrollment_increments_counter():
    tenant = _make_tenant(enrollments=5)
    await svc.record_enrollment(tenant, _db)
    assert tenant.current_month_enrollments == 6


@pytest.mark.asyncio
async def test_record_enrollment_uses_default_price():
    from app.core.config import settings
    tenant = _make_tenant()
    amount = await svc.record_enrollment(tenant, _db)
    assert amount == round(settings.PRICE_ENROLLMENT, 4)


@pytest.mark.asyncio
async def test_record_enrollment_uses_custom_price():
    tenant = _make_tenant()
    tenant.custom_price_enrollment = 0.05
    amount = await svc.record_enrollment(tenant, _db)
    assert amount == 0.05


# ── record_auth ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_record_auth_increments_counter():
    tenant = _make_tenant(auths=10)
    await svc.record_auth(tenant, _db)
    assert tenant.current_month_auths == 11


@pytest.mark.asyncio
async def test_record_auth_with_antifraud_adds_addon():
    from app.core.config import settings
    tenant = _make_tenant()
    amount = await svc.record_auth(tenant, _db, with_antifraud=True)
    expected = round(settings.PRICE_AUTH + settings.PRICE_ANTIFAUD_ADDON, 4)
    assert amount == expected


@pytest.mark.asyncio
async def test_record_auth_without_antifraud_no_addon():
    from app.core.config import settings
    tenant = _make_tenant()
    amount = await svc.record_auth(tenant, _db, with_antifraud=False)
    assert amount == round(settings.PRICE_AUTH, 4)
