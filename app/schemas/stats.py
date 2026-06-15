import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class StatsResponse(BaseModel):
    tenant_id: uuid.UUID
    tenant_name: str
    plan: str
    billing_period_start: Optional[datetime] = None

    enrollments_this_month: int
    enrollment_limit: int
    active_subjects: int

    auths_this_month: int
    auth_limit: int
    auth_success_rate: float       # 0.0 – 1.0

    fraud_attempts_this_month: int

    estimated_cost_usd: float
