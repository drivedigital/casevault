import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import SharingPolicy


class WorkspaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    jurisdiction_default: str
    ai_sharing_default: SharingPolicy
    created_by_user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    jurisdiction_default: str = "NY"


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    jurisdiction_default: str | None = None
    ai_sharing_default: SharingPolicy | None = None
