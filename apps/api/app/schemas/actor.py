import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ActorType


class ActorCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=255)
    actor_type: ActorType = ActorType.person
    description: str | None = None
    aliases: list[str] = []


class ActorUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=255)
    actor_type: ActorType | None = None
    description: str | None = None


class AliasCreate(BaseModel):
    alias_text: str = Field(min_length=1, max_length=255)
    alias_type: str | None = Field(default=None, max_length=64)


class AliasOut(BaseModel):
    id: uuid.UUID
    alias_text: str
    alias_type: str | None


class ActorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    actor_type: ActorType
    display_name: str
    normalized_name: str | None
    description: str | None
    created_at: datetime
    updated_at: datetime
    aliases: list[AliasOut] = []


class ActorRoleOut(BaseModel):
    role_id: uuid.UUID
    matter_id: uuid.UUID
    matter_name: str
    matter_slug: str
    role_label: str
    notes: str | None


class ActorDossierOut(BaseModel):
    actor: ActorOut
    roles: list[ActorRoleOut]
