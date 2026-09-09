import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import MatterStatus, MatterType, SharingPolicy


class MatterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=64)
    matter_type: MatterType = MatterType.merits
    status: MatterStatus = MatterStatus.active
    theory_summary: str | None = None
    controlling_memo_ref: str | None = None
    next_work: str | None = None
    jurisdiction: str = "NY"


class MatterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, max_length=64)
    matter_type: MatterType | None = None
    status: MatterStatus | None = None
    theory_summary: str | None = None
    controlling_memo_ref: str | None = None
    next_work: str | None = None
    jurisdiction: str | None = None
    ai_sharing_policy: SharingPolicy | None = None


class MatterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    slug: str
    name: str
    matter_type: MatterType
    status: MatterStatus
    theory_summary: str | None
    controlling_memo_ref: str | None
    next_work: str | None
    jurisdiction: str
    ai_sharing_policy: SharingPolicy
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class MatterLinkCreate(BaseModel):
    to_matter_id: uuid.UUID
    link_type: str = Field(min_length=1, max_length=64)
    notes: str | None = None


class MatterLinkOut(BaseModel):
    id: uuid.UUID
    from_matter_id: uuid.UUID
    from_matter_name: str
    to_matter_id: uuid.UUID
    to_matter_name: str
    link_type: str
    direction: str  # "outgoing" | "incoming" relative to the matter being viewed
    notes: str | None
    created_at: datetime


class MatterRoleAssign(BaseModel):
    actor_id: uuid.UUID
    role_label: str = Field(min_length=1, max_length=64)
    notes: str | None = None


class MatterActorOut(BaseModel):
    role_id: uuid.UUID
    actor_id: uuid.UUID
    actor_name: str
    actor_type: str
    role_label: str
    notes: str | None
    created_at: datetime
