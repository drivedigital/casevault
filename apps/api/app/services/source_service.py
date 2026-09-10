"""Source (evidence) service: upload, dedupe, listing, lifecycle, links."""
from __future__ import annotations

import logging
import re
import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.enums import EvidenceReviewStatus, SourceStatus, SourceType
from app.models.matter import Matter
from app.models.source import (
    Source,
    SourceExcerpt,
    SourceMatterLink,
    SourceMetadata,
    SourcePage,
)
from app.schemas.source import SourceUpdate
from app.services import identity_service
from app.services.storage import LocalStorage

logger = logging.getLogger("casevault.sources")

# Types whose bytes are plain text: ingest writes the extracted text page
# synchronously at upload time (no worker round-trip needed).
TEXT_SOURCE_TYPES = {SourceType.text, SourceType.markdown, SourceType.email, SourceType.note}

_EXTENSION_TYPES = {
    ".pdf": SourceType.pdf,
    ".png": SourceType.image,
    ".jpg": SourceType.image,
    ".jpeg": SourceType.image,
    ".gif": SourceType.image,
    ".tif": SourceType.image,
    ".tiff": SourceType.image,
    ".webp": SourceType.image,
    ".bmp": SourceType.image,
    ".txt": SourceType.text,
    ".log": SourceType.text,
    ".csv": SourceType.spreadsheet,
    ".xlsx": SourceType.spreadsheet,
    ".xls": SourceType.spreadsheet,
    ".md": SourceType.markdown,
    ".markdown": SourceType.markdown,
    ".eml": SourceType.email,
    ".msg": SourceType.email,
}


def classify_source(filename: str | None, mime_type: str | None) -> SourceType:
    """Map a filename + client MIME type to a source_type."""
    if filename:
        stem = filename.rsplit("/", 1)[-1]
        dot = stem.rfind(".")
        if dot != -1:
            ext = stem[dot:].lower()
            if ext in _EXTENSION_TYPES:
                return _EXTENSION_TYPES[ext]
    if mime_type:
        if mime_type == "application/pdf":
            return SourceType.pdf
        if mime_type.startswith("image/"):
            return SourceType.image
        if mime_type in ("text/plain", "text/csv", "application/csv"):
            return SourceType.spreadsheet if mime_type.endswith("csv") else SourceType.text
        if mime_type == "text/markdown":
            return SourceType.markdown
        if mime_type.startswith("text/"):
            return SourceType.text
    return SourceType.other


def get_source(db: Session, workspace_id: uuid.UUID, source_id: uuid.UUID) -> Source:
    source = db.get(Source, source_id)
    if source is None or source.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Source not found.")
    return source


def _metadata_for(db: Session, source_id: uuid.UUID) -> SourceMetadata:
    meta = db.get(SourceMetadata, source_id)
    if meta is None:
        meta = SourceMetadata(
            source_id=source_id,
            metadata_json={},
            extracted_from_filename_json={},
            external_provenance_json={},
        )
        db.add(meta)
    return meta


def duplicate_of_info(db: Session, source_id: uuid.UUID) -> dict | None:
    meta = db.get(SourceMetadata, source_id)
    if meta is None:
        return None
    info = meta.metadata_json.get("duplicate_of")
    return info if isinstance(info, dict) else None


def create_upload(
    db: Session,
    workspace_id: uuid.UUID,
    *,
    filename: str,
    content: bytes,
    mime_type: str | None,
    title: str | None,
    source_status: SourceStatus,
) -> Source:
    settings = get_settings()
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {settings.max_upload_bytes // (1024 * 1024)} MB upload limit.",
        )
    if not content:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    source_type = classify_source(filename, mime_type)
    storage = LocalStorage()
    stored = storage.save(workspace_id, filename, content)

    # sha256 duplicate detection within the workspace: keep the upload as
    # its own evidence record (provenance: as-received copy) but flag the
    # lifecycle status `duplicate` and point back to the first occurrence.
    existing = db.scalar(
        select(Source).where(
            Source.workspace_id == workspace_id,
            Source.sha256 == stored.sha256,
            Source.evidence_review_status != EvidenceReviewStatus.duplicate,
        )
    )

    user = identity_service.get_local_user(db)
    source = Source(
        workspace_id=workspace_id,
        source_type=source_type,
        title=(title or filename.rsplit("/", 1)[-1] or "Untitled")[:255],
        original_filename=filename.rsplit("/", 1)[-1][:255],
        mime_type=(mime_type or None),
        storage_path=stored.relative_path,
        sha256=stored.sha256,
        file_size_bytes=stored.size_bytes,
        source_status=source_status,
        evidence_review_status=(
            EvidenceReviewStatus.duplicate if existing is not None else EvidenceReviewStatus.uploaded
        ),
        processing_status="queued",
        ocr_status="not_started",
        created_by_user_id=user.id,
    )
    db.add(source)
    db.flush()

    metadata_json: dict = {
        "ingest": {
            "filename": source.original_filename,
            "mime_type": source.mime_type,
            "size_bytes": stored.size_bytes,
            "sha256": stored.sha256,
        }
    }
    if existing is not None:
        metadata_json["duplicate_of"] = {
            "source_id": str(existing.id),
            "title": existing.title,
            "sha256": existing.sha256,
        }
    meta = _metadata_for(db, source.id)
    meta.metadata_json = metadata_json
    meta.extracted_from_filename_json = filename_heuristics(source.original_filename)

    if source_type in TEXT_SOURCE_TYPES:
        # Plain-text evidence: extracted text is available immediately —
        # write the page inline, no worker round-trip.
        ingest_text(db, source, content, meta)
        enqueue_processing = False
    else:
        enqueue_processing = True

    db.commit()
    db.refresh(source)

    if enqueue_processing:
        _try_enqueue_process(source.id)
    return source


def ingest_text(
    db: Session, source: Source, content: bytes, meta: SourceMetadata | None = None
) -> None:
    """Write the single extracted-text page for a text-type source."""
    text = content.decode("utf-8", errors="replace")
    db.add(
        SourcePage(
            source_id=source.id,
            page_number=1,
            page_label="1",
            ocr_text=text,
        )
    )
    source.page_count = 1
    source.ocr_status = "complete"
    source.processing_status = "complete"
    if meta is None:
        meta = _metadata_for(db, source.id)
    meta.metadata_json = {**(meta.metadata_json or {}), "ingest_method": "inline_text"}


def filename_heuristics(filename: str | None) -> dict:
    """Cheap filename observations (Schema Draft: extracted_from_filename)."""
    if not filename:
        return {}
    lower = filename.lower()
    return {
        "lowercase_name": lower,
        "looks_like_bates": bool(re.search(r"\b[a-z]{2,6}\s?\d{4,}\b", lower)),
        "looks_like_email_export": lower.endswith((".eml", ".msg")),
        "extension": lower.rsplit(".", 1)[-1] if "." in lower else "",
    }


def list_sources(
    db: Session,
    workspace_id: uuid.UUID,
    *,
    matter_id: uuid.UUID | None = None,
    source_type: SourceType | None = None,
    evidence_review_status: EvidenceReviewStatus | None = None,
    query: str | None = None,
) -> list[Source]:
    stmt = select(Source).where(Source.workspace_id == workspace_id)
    if matter_id is not None:
        stmt = stmt.join(SourceMatterLink, SourceMatterLink.source_id == Source.id).where(
            SourceMatterLink.matter_id == matter_id
        )
    if source_type is not None:
        stmt = stmt.where(Source.source_type == source_type)
    if evidence_review_status is not None:
        stmt = stmt.where(Source.evidence_review_status == evidence_review_status)
    if query:
        pattern = f"%{query.strip().lower()}%"
        stmt = stmt.where(func.lower(Source.title).like(pattern))
    return list(db.scalars(stmt.order_by(Source.created_at.desc())))


def update_source(
    db: Session, workspace_id: uuid.UUID, source_id: uuid.UUID, payload: SourceUpdate
) -> Source:
    source = get_source(db, workspace_id, source_id)
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(source, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A source cannot be both included and excluded.",
        )
    db.refresh(source)
    return source


def list_pages(db: Session, workspace_id: uuid.UUID, source_id: uuid.UUID) -> list[SourcePage]:
    get_source(db, workspace_id, source_id)
    return list(
        db.scalars(
            select(SourcePage)
            .where(SourcePage.source_id == source_id)
            .order_by(SourcePage.page_number)
        )
    )


def link_source_to_matter(
    db: Session,
    workspace_id: uuid.UUID,
    matter_id: uuid.UUID,
    source_id: uuid.UUID,
    link_reason: str | None,
) -> SourceMatterLink:
    matter = db.get(Matter, matter_id)
    if matter is None or matter.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Matter not found.")
    get_source(db, workspace_id, source_id)
    link = SourceMatterLink(
        source_id=source_id, matter_id=matter_id, link_reason=link_reason
    )
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="This source is already linked to that matter."
        )
    db.refresh(link)
    return link


def list_links_for_matter(
    db: Session, workspace_id: uuid.UUID, matter_id: uuid.UUID
) -> list[SourceMatterLink]:
    stmt = (
        select(SourceMatterLink)
        .join(Source, SourceMatterLink.source_id == Source.id)
        .where(SourceMatterLink.matter_id == matter_id, Source.workspace_id == workspace_id)
        .order_by(Source.title)
    )
    return list(db.scalars(stmt))


def list_links_for_source(
    db: Session, workspace_id: uuid.UUID, source_id: uuid.UUID
) -> list[SourceMatterLink]:
    get_source(db, workspace_id, source_id)
    stmt = (
        select(SourceMatterLink)
        .join(Source, SourceMatterLink.source_id == Source.id)
        .where(SourceMatterLink.source_id == source_id, Source.workspace_id == workspace_id)
        .order_by(SourceMatterLink.created_at)
    )
    return list(db.scalars(stmt))


def delete_link(db: Session, workspace_id: uuid.UUID, link_id: uuid.UUID) -> None:
    link = db.get(SourceMatterLink, link_id)
    if link is None or link.source.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Link not found.")
    db.delete(link)
    db.commit()


def _try_enqueue_process(source_id: uuid.UUID) -> bool:
    """Best-effort enqueue onto the ingest queue; no redis → stays queued."""
    try:
        import redis
        from rq import Queue

        settings = get_settings()
        conn = redis.Redis.from_url(settings.redis_url)
        Queue("ingest", connection=conn).enqueue(
            "workers.pipeline.jobs.process_source", str(source_id)
        )
        return True
    except Exception as exc:  # noqa: BLE001 - enqueue must never fail an upload
        logger.warning("ingest enqueue skipped for source %s: %s", source_id, exc)
        return False

# ---------------------------------------------------------------------------
# Wave 2 W2-EV: excerpt CRUD and per-source reprocessing.
# Keep these additions below the Sprint 3 service implementation so existing
# source response shapes and enqueue behavior remain unchanged.

_EXCERPT_TYPES = {"quote", "region", "timestamp", "bates", "paragraph", "other"}


def create_excerpt(
    db: Session,
    workspace_id: uuid.UUID,
    source_id: uuid.UUID,
    *,
    page_start: int | None,
    page_end: int | None,
    locator_text: str | None,
    excerpt_text: str | None,
    excerpt_type: str,
    anchor_json: dict | None,
) -> SourceExcerpt:
    """Create an excerpt after resolving the source in the requested workspace."""
    source = get_source(db, workspace_id, source_id)
    if excerpt_type not in _EXCERPT_TYPES:
        # Normally enforced by the Pydantic request schema; retain a service
        # guard for callers that use this module directly.
        raise HTTPException(status_code=422, detail="Invalid excerpt type.")

    excerpt = SourceExcerpt(
        source_id=source.id,
        page_start=page_start,
        page_end=page_end,
        locator_text=locator_text,
        excerpt_text=excerpt_text,
        excerpt_type=excerpt_type,
        anchor_json=anchor_json or {},
    )
    db.add(excerpt)
    db.commit()
    db.refresh(excerpt)
    return excerpt


def list_excerpts(
    db: Session, workspace_id: uuid.UUID, source_id: uuid.UUID
) -> list[SourceExcerpt]:
    """List excerpts in source/page order, scoped through the source workspace."""
    get_source(db, workspace_id, source_id)
    return list(
        db.scalars(
            select(SourceExcerpt)
            .where(SourceExcerpt.source_id == source_id)
            .order_by(SourceExcerpt.page_start, SourceExcerpt.created_at, SourceExcerpt.id)
        )
    )


def delete_excerpt(db: Session, workspace_id: uuid.UUID, excerpt_id: uuid.UUID) -> None:
    """Delete an excerpt only when its source belongs to the workspace."""
    excerpt = db.scalar(
        select(SourceExcerpt)
        .join(Source, SourceExcerpt.source_id == Source.id)
        .where(SourceExcerpt.id == excerpt_id, Source.workspace_id == workspace_id)
    )
    if excerpt is None:
        raise HTTPException(status_code=404, detail="Excerpt not found.")
    db.delete(excerpt)
    db.commit()


def _enqueue_reprocess_stage(
    source_id: uuid.UUID, workspace_id: uuid.UUID, stage: str
) -> dict[str, bool | str | None]:
    """Enqueue one reprocessing stage, degrading cleanly when RQ/Redis is absent."""
    queue_jobs = {
        "ingest": ("ingest", "workers.pipeline.jobs.ingest_source"),
        "ocr": ("ocr", "workers.pipeline.jobs.ocr_source"),
    }
    queue_name, job_path = queue_jobs[stage]
    try:
        import redis
        from rq import Queue

        connection = redis.Redis.from_url(get_settings().redis_url)
        job = Queue(queue_name, connection=connection).enqueue(
            job_path, str(source_id), str(workspace_id)
        )
        return {"queued": True, "job_id": str(job.id), "reason": None}
    except Exception as exc:  # noqa: BLE001 - queueing must not fail a 202 response
        logger.warning(
            "%s enqueue skipped for source %s: %s", stage, source_id, exc
        )
        return {
            "queued": False,
            "job_id": None,
            "reason": f"{stage} queue unavailable: {exc}",
        }


def reprocess_source(
    db: Session,
    workspace_id: uuid.UUID,
    source_id: uuid.UUID,
    stages: list[str],
) -> dict[str, bool | str | None]:
    """Mark requested stages queued and best-effort enqueue their jobs.

    Statuses are committed before contacting Redis. This is intentional: a
    redis-free installation still reports the requested work as queued, while
    the response makes clear that no remote job was created.
    """
    source = get_source(db, workspace_id, source_id)
    requested = list(dict.fromkeys(stages))
    if not requested or any(stage not in {"ingest", "ocr"} for stage in requested):
        raise HTTPException(status_code=422, detail="Stages must be ingest or ocr.")

    if "ingest" in requested:
        source.processing_status = "queued"
    if "ocr" in requested:
        source.ocr_status = "queued"
    db.commit()

    results = [
        _enqueue_reprocess_stage(source.id, workspace_id, stage) for stage in requested
    ]
    successful = [result for result in results if result["queued"]]
    failed_reasons = [result["reason"] for result in results if result["reason"]]
    return {
        "queued": bool(successful),
        "job_id": successful[0]["job_id"] if successful else None,
        "reason": "; ".join(str(reason) for reason in failed_reasons) or None,
    }
