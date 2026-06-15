import uuid
from sqlalchemy import Boolean, Column, Float, Integer, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector

from app.db.base import Base


class FaceSubject(Base):
    __tablename__ = "face_subjects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    external_id = Column(String(255), nullable=False)
    display_name = Column(String(255))
    metadata_ = Column("metadata", JSONB)

    face_embedding = Column(Vector(512))

    enrollment_quality_score = Column(Float)
    enrollment_images_count = Column(Integer, default=0)
    embedding_detector = Column(String(64))    # detector usado al enrolar (yunet, retinaface, etc.)
    is_enrolled = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)

    enrolled_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
