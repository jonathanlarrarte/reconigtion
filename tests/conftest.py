import pytest
from unittest.mock import MagicMock, AsyncMock
from httpx import AsyncClient, ASGITransport

from main import app
from app.db.base import get_db
from app.core.security import get_current_tenant


@pytest.fixture
def mock_tenant():
    """Tenant de prueba sin tocar la base de datos."""
    t = MagicMock()
    t.id = "11111111-1111-1111-1111-111111111111"
    t.slug = "test-tenant"
    t.name = "Test Tenant"
    t.plan = "business"
    t.api_key = "fid_test_key"
    t.monthly_auth_limit = 10000
    t.monthly_enroll_limit = 2000
    t.current_month_auths = 0
    t.current_month_enrollments = 0
    t.custom_price_enrollment = None
    t.custom_price_auth = None
    t.anti_spoofing_enabled = True
    t.webhook_url = None
    t.billing_period_start = None
    t.is_active = True
    return t


@pytest.fixture
def mock_db():
    """Sesión de BD mockeada."""
    session = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.flush = AsyncMock()
    session.add = MagicMock()
    return session


@pytest.fixture
async def api_client(mock_tenant, mock_db):
    """
    Cliente HTTP contra la app FastAPI con BD y auth mockeados.
    Los tests que necesitan BD real deben usar su propio fixture.
    """
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_current_tenant] = lambda: mock_tenant

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()
