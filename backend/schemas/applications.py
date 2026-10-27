from pydantic import BaseModel, field_validator
from typing import Optional, List, Any
from datetime import datetime


class ApplicationCreate(BaseModel):
    application_type: str
    template_code: str
    institution_id: Optional[str] = None  # Pulled from actor's profile if not provided


class ApplicationAdvance(BaseModel):
    remarks: Optional[str] = None


class ApplicationReturn(BaseModel):
    reason: str

    @field_validator("reason")
    @classmethod
    def reason_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("reason must not be empty")
        return v.strip()


class ApplicationRevert(BaseModel):
    target_stage: str
    reason: str

    @field_validator("reason")
    @classmethod
    def reason_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("reason must not be empty")
        return v.strip()


class ApplicationReassign(BaseModel):
    new_assignee_id: str
    reason: str

    @field_validator("reason")
    @classmethod
    def reason_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("reason must not be empty")
        return v.strip()


class ApplicationResponse(BaseModel):
    id: str
    application_no: str
    institution_id: str
    application_type: str
    template_id: str
    current_stage: str
    status: str
    assigned_to: Optional[str]
    region_id: Optional[str]
    submitted_at: Any
    stage_entered_at: Any
    due_at: Optional[Any]
    risk_score: Optional[int]
    risk_label: Optional[str]
    created_at: Optional[Any]
    # Detail view only: who may act on the current stage, and where Advance leads
    stage_owner_role: Optional[str] = None
    next_stage: Optional[str] = None
    can_return: Optional[bool] = None
