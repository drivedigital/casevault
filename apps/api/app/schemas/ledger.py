"""Pydantic contracts for the source ledger API (Wave 2 contract v1.0)."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import SourceStatus, StrengthLabel

MAX_TAG_LENGTH = 128


def _clean_tags(value: list[str] | None) -> list[str] | None:
    if value is None:
        return None
    result: list[str] = []
    for tag in value:
        if not isinstance(tag, str):
            raise TypeError("tags must contain strings")
        cleaned = tag.strip()
        if not cleaned:
            continue
        if len(cleaned) > MAX_TAG_LENGTH:
            raise ValueError(f"tags must be at most {MAX_TAG_LENGTH} characters")
        if cleaned not in result:
            result.append(cleaned)
    return result


class LedgerEntryCreate(BaseModel):
    """Fields accepted when a ledger row is created."""

    model_config = ConfigDict(extra="forbid")

    matter_id: uuid.UUID | None = None
    external_ledger_id: str | None = Field(default=None, max_length=64)
    date_start: date | None = None
    date_end: date | None = None
    date_text_raw: str | None = None
    fact_short_name: str = Field(min_length=1, max_length=255)
    fact_statement: str = Field(min_length=1)
    claim_use_text: str | None = None
    relief_use_text: str | None = None
    source_path_text: str | None = None
    source_locator_text: str | None = None
    source_status: SourceStatus | None = None
    authentication_or_witness: str | None = None
    confidence_level: StrengthLabel | None = None
    verification_task_text: str | None = None
    restrictions_or_notes: str | None = None
    linked_source_id: uuid.UUID | None = None
    tags: list[str] = Field(default_factory=list)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str]) -> list[str]:
        return _clean_tags(value) or []

    @field_validator("fact_short_name", "fact_statement")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value



class LedgerEntryUpdate(BaseModel):
    """Partial update; workspace_id and id are deliberately not accepted."""

    model_config = ConfigDict(extra="forbid")

    matter_id: uuid.UUID | None = None
    external_ledger_id: str | None = Field(default=None, max_length=64)
    date_start: date | None = None
    date_end: date | None = None
    date_text_raw: str | None = None
    fact_short_name: str | None = Field(default=None, min_length=1, max_length=255)
    fact_statement: str | None = Field(default=None, min_length=1)
    claim_use_text: str | None = None
    relief_use_text: str | None = None
    source_path_text: str | None = None
    source_locator_text: str | None = None
    source_status: SourceStatus | None = None
    authentication_or_witness: str | None = None
    confidence_level: StrengthLabel | None = None
    verification_task_text: str | None = None
    restrictions_or_notes: str | None = None
    linked_source_id: uuid.UUID | None = None
    tags: list[str] | None = None

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str] | None) -> list[str] | None:
        return _clean_tags(value)

    @field_validator("fact_short_name", "fact_statement")
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("must not be blank")
        return value



class LinkedSourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str


class LinkedSourceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: uuid.UUID


class LedgerEntryOut(BaseModel):
    """A ledger row, including the API-only tags and source summary."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    matter_id: uuid.UUID | None
    external_ledger_id: str | None
    date_start: date | None
    date_end: date | None
    date_text_raw: str | None
    fact_short_name: str
    fact_statement: str
    claim_use_text: str | None
    relief_use_text: str | None
    source_path_text: str | None
    source_locator_text: str | None
    source_status: SourceStatus | None
    authentication_or_witness: str | None
    confidence_level: StrengthLabel | None
    verification_task_text: str | None
    restrictions_or_notes: str | None
    linked_source_id: uuid.UUID | None
    tags_json: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    linked_source: LinkedSourceOut | None = None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def normalize_tags(self) -> LedgerEntryOut:
        # `tags_json` is the storage name; clients use the shorter `tags` name.
        if not self.tags and self.tags_json:
            self.tags = list(self.tags_json)
        return self


class LedgerEntryPage(BaseModel):
    items: list[LedgerEntryOut]
    total: int
    limit: int
    offset: int


class LedgerBulkPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tags: list[str] | None = None
    source_status: SourceStatus | None = None
    confidence_level: StrengthLabel | None = None
    matter_id: uuid.UUID | None = None

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, value: list[str] | None) -> list[str] | None:
        return _clean_tags(value)


class LedgerBulkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ids: list[uuid.UUID] = Field(min_length=1)
    patch: LedgerBulkPatch


class LedgerBulkError(BaseModel):
    id: uuid.UUID
    error: str


class LedgerBulkResult(BaseModel):
    # IDs are returned rather than only counts so a partial bulk operation is
    # auditable by the caller without having to repeat the request.
    updated: list[uuid.UUID]
    skipped: list[uuid.UUID]
    errors: list[LedgerBulkError]


class LedgerImportError(BaseModel):
    row: int
    error: str


class LedgerImportResult(BaseModel):
    valid: int
    created: int
    skipped: int
    errors: list[LedgerImportError]


class LedgerImportJSON(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rows: list[dict[str, Any]]
    dry_run: bool = False
