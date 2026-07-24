from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.tenant import Tenant


class BillingService:
    async def check_limits(self, tenant: Tenant, operation: str) -> tuple[bool, str]:
        if operation == "enrollment":
            if (tenant.current_month_enrollments or 0) >= tenant.monthly_enroll_limit:
                return False, f"Límite mensual de enrolamientos alcanzado ({tenant.monthly_enroll_limit}). Contacta al administrador para ampliar tu plan."
        elif operation == "auth":
            if (tenant.current_month_auths or 0) >= tenant.monthly_auth_limit:
                return False, f"Límite mensual de autenticaciones alcanzado ({tenant.monthly_auth_limit}). Contacta al administrador para ampliar tu plan."
        elif operation == "liveness":
            limit = tenant.monthly_liveness_limit or 500
            if (tenant.current_month_liveness_checks or 0) >= limit:
                return False, f"Límite mensual de verificaciones de vida alcanzado ({limit}). Contacta al administrador para ampliar tu plan."
        return True, ""

    async def record_enrollment(self, tenant: Tenant, db: AsyncSession) -> float:
        price = tenant.custom_price_enrollment or settings.PRICE_ENROLLMENT
        tenant.current_month_enrollments = (tenant.current_month_enrollments or 0) + 1
        return round(price, 4)

    async def record_auth(self, tenant: Tenant, db: AsyncSession, with_antifraud: bool = False) -> float:
        price = tenant.custom_price_auth or settings.PRICE_AUTH
        if with_antifraud:
            price += settings.PRICE_ANTIFAUD_ADDON
        tenant.current_month_auths = (tenant.current_month_auths or 0) + 1
        return round(price, 4)

    async def record_liveness(self, tenant: Tenant, db: AsyncSession) -> float:
        price = tenant.custom_price_liveness or settings.PRICE_LIVENESS_CHECK
        tenant.current_month_liveness_checks = (tenant.current_month_liveness_checks or 0) + 1
        return round(price, 4)


billing_service = BillingService()
