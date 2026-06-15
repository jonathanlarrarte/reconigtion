import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class EnrollResponse(BaseModel):
    subject_id: uuid.UUID
    external_id: str
    enrolled: bool
    quality_score: float
    is_real_face: bool
    message: str
    amount_charged: float
    request_id: str


class AuthResponse(BaseModel):
    request_id: str
    verified: bool
    subject_id: uuid.UUID
    external_id: str
    confidence: float
    distance: float
    is_real_face: bool
    spoofing_score: float
    fraud_detected: bool
    amount_charged: float
    timestamp: datetime


class SubjectOut(BaseModel):
    id: uuid.UUID
    external_id: str
    display_name: Optional[str] = None
    is_enrolled: bool
    enrollment_quality_score: Optional[float] = None
    enrollment_images_count: int
    enrolled_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}
