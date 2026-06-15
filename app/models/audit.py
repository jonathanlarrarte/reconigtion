import uuid
from sqlalchemy import Boolean, Column, Float, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func

from app.db.base import Base


class AuthAttempt(Base):
    __tablename__ = "auth_attempts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("face_subjects.id", ondelete="SET NULL"))

    success = Column(Boolean, nullable=False)
    confidence_score = Column(Float)
    distance = Column(Float)

    is_real_face = Column(Boolean)
    spoofing_score = Column(Float)
    deepfake_detected = Column(Boolean)
    fraud_signals = Column(JSONB)

    billed = Column(Boolean, default=False)
    amount_charged = Column(Float)

    ip_address = Column(String(45))
    user_agent = Column(Text)
    request_id = Column(String(64))

    created_at = Column(DateTime, server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"))
    event_type = Column(String(100), nullable=False)
    actor_id = Column(String(255))
    actor_type = Column(String(50))
    payload = Column(JSONB)
    ip_address = Column(String(45))
    created_at = Column(DateTime, server_default=func.now())


class AdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255))
    role = Column(String(50), default="tenant_admin")
    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
