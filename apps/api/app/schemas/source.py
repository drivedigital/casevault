import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import EvidenceReviewStatus, SourceStatus, SourceType


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    source_type: SourceType
    title: str
    original_filename: str | None
    mime_type: str | None
    storage_path: str
    sha256: str | None
    file_size_bytes: int | None
    page_count: int | None
    source_status: SourceStatus
    evidence_review_status: EvidenceReviewStatus
    included_flag: bool
    excluded_flag: bool
    exclusion_reason: str | None
    authentication_notes: str | None
    restrictions_notes: str | None
    processing_status: str
    ocr_status: str
    created_at: datetime
    updated_at: datetime
    # set when a duplicate upload was detected (same sha256 in workspace)
    duplicate_of: dict | None = None


class SourceUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    source_status: SourceStatus | None = None
    evidence_review_status: EvidenceReviewStatus | None = None
    included_flag: bool | None = None
    excluded_flag: bool | None = None
    exclusion_reason: str | None = None
    authentication_notes: str | None = None
    restrictions_notes: str | None = None


class SourcePageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_id: uuid.UUID
    page_number: int
    page_label: str | None
    ocr_text: str | None
    image_path: str | None
    created_at: datetime
    updated_at: datetime


class SourceMatterLinkCreate(BaseModel):
    source_id: uuid.UUID
    link_reason: str | None = Field(default=None, max_length=128)


class SourceMatterLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_id: uuid.UUID
    source_title: str
    matter_id: uuid.UUID
    matter_name: str
    matter_slug: str
    link_reason: str | None
    created_at: datetime

# Wave 2 W2-EV: source excerpts and per-source pipeline reprocessing.


ExcerptType = Literal["quote", "region", "timestamp", "bates", "paragraph", "other"]


class SourceExcerptCreate(BaseModel):
    page_start: int | None = None
    page_end: int | None = None
    locator_text: str | None = None
    excerpt_text: str | None = None
    excerpt_type: ExcerptType
    anchor_json: dict[str, Any] | None = None


class SourceExcerptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_id: uuid.UUID
    page_start: int | None
    page_end: int | None
    locator_text: str | None
    excerpt_text: str | None
    excerpt_type: ExcerptType
    anchor_json: dict[str, Any]
    created_by: str
    created_by_user_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class ReprocessRequest(BaseModel):
    stages: list[Literal["ingest", "ocr"]] = Field(default_factory=lambda: ["ocr"], min_length=1)


class ReprocessOut(BaseModel):
    queued: bool
    job_id: str | None
    reason: str | None
