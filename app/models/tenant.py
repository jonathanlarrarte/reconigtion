import uuid
from sqlalchemy import Boolean, Column, Float, Integer, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db.base import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    api_key = Column(String(64), unique=True, nullable=False)

    plan = Column(String(50), default="starter")
    stripe_customer_id = Column(String(255))
    stripe_subscription_id = Column(String(255))

    monthly_auth_limit = Column(Integer, default=1000)
    monthly_enroll_limit = Column(Integer, default=200)
    monthly_liveness_limit = Column(Integer, default=500)

    current_month_auths = Column(Integer, default=0)
    current_month_enrollments = Column(Integer, default=0)
    current_month_liveness_checks = Column(Integer, default=0)
    billing_period_start = Column(DateTime)

    custom_price_enrollment = Column(Float)
    custom_price_auth = Column(Float)
    custom_price_liveness = Column(Float)

    anti_spoofing_enabled = Column(Boolean, default=True)
    liveness_required = Column(Boolean, default=False)
    webhook_url = Column(String(512))
    is_active = Column(Boolean, default=True)

    portal_username = Column(String(100), unique=True)
    portal_password_hash = Column(String(255))

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
