"""Workspace-scoped source-ledger operations."""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

from fastapi import HTTPException
from sqlalchemy import Select, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.intake import LedgerEntry
from app.models.matter import Matter
from app.models.source import Source
from app.schemas.ledger import (
    LedgerBulkPatch,
    LedgerBulkRequest,
    LedgerEntryCreate,
    LedgerEntryUpdate,
)


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Ledger entry not found.")


def _check_matter(db: Session, workspace_id: uuid.UUID, matter_id: uuid.UUID | None) -> None:
    if matter_id is None:
        return
    matter = db.get(Matter, matter_id)
    if matter is None or matter.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Matter not found.")


def _check_source(db: Session, workspace_id: uuid.UUID, source_id: uuid.UUID | None) -> None:
    if source_id is None:
        return
    source = db.get(Source, source_id)
    if source is None or source.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Source not found.")


def get_entry(db: Session, workspace_id: uuid.UUID, entry_id: uuid.UUID) -> LedgerEntry:
    entry = db.scalar(
        select(LedgerEntry).where(
            LedgerEntry.id == entry_id,
            LedgerEntry.workspace_id == workspace_id,
        )
    )
    if entry is None:
        raise _not_found()
    return entry


def _entry_dict(db: Session, entry: LedgerEntry) -> dict[str, Any]:
    source = None
    linked_source_id = getattr(entry, "linked_source_id", None)
    if linked_source_id is not None:
        linked = db.get(Source, linked_source_id)
        # A source can only be linked after workspace validation.  Keep the
        # summary null rather than leaking a cross-workspace title if a legacy
        # database contains an inconsistent row.
        if linked is not None and linked.workspace_id == entry.workspace_id:
            source = {"id": linked.id, "title": linked.title}
    values = {
        "id": entry.id,
        "workspace_id": entry.workspace_id,
        "matter_id": entry.matter_id,
        "external_ledger_id": entry.external_ledger_id,
        "date_start": entry.date_start,
        "date_end": entry.date_end,
        "date_text_raw": entry.date_text_raw,
        "fact_short_name": entry.fact_short_name,
        "fact_statement": entry.fact_statement,
        "claim_use_text": entry.claim_use_text,
        "relief_use_text": entry.relief_use_text,
        "source_path_text": entry.source_path_text,
        "source_locator_text": entry.source_locator_text,
        "source_status": entry.source_status,
        "authentication_or_witness": entry.authentication_or_witness,
        "confidence_level": entry.confidence_level,
        "verification_task_text": entry.verification_task_text,
        "restrictions_or_notes": entry.restrictions_or_notes,
        "linked_source_id": linked_source_id,
        "tags_json": list(entry.tags_json or []),
        "tags": list(entry.tags_json or []),
        "linked_source": source,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
    }
    return values


def to_out(db: Session, entry: LedgerEntry) -> dict[str, Any]:
    """Build a response-safe representation without exposing ORM relations."""
    return _entry_dict(db, entry)


def create_entry(
    db: Session, workspace_id: uuid.UUID, payload: LedgerEntryCreate
) -> LedgerEntry:
    _check_matter(db, workspace_id, payload.matter_id)
    _check_source(db, workspace_id, payload.linked_source_id)
    values = payload.model_dump(exclude={"tags"})
    entry = LedgerEntry(
        workspace_id=workspace_id,
        tags_json=list(payload.tags),
        **values,
    )
    db.add(entry)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "external_ledger" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail="external_ledger_id is already used in this matter.",
            ) from exc
        raise
    db.refresh(entry)
    return entry


def update_entry(
    db: Session,
    workspace_id: uuid.UUID,
    entry_id: uuid.UUID,
    payload: LedgerEntryUpdate,
) -> LedgerEntry:
    entry = get_entry(db, workspace_id, entry_id)
    changes = payload.model_dump(exclude_unset=True)
    if "matter_id" in changes:
        _check_matter(db, workspace_id, changes["matter_id"])
    if "linked_source_id" in changes:
        _check_source(db, workspace_id, changes["linked_source_id"])
    if "tags" in changes:
        entry.tags_json = list(changes.pop("tags") or [])
    for field, value in changes.items():
        setattr(entry, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "external_ledger" in str(exc).lower():
            raise HTTPException(
                status_code=409,
                detail="external_ledger_id is already used in this matter.",
            ) from exc
        raise
    db.refresh(entry)
    return entry


def delete_entry(db: Session, workspace_id: uuid.UUID, entry_id: uuid.UUID) -> None:
    entry = get_entry(db, workspace_id, entry_id)
    db.delete(entry)
    db.commit()


def list_entries(
    db: Session,
    workspace_id: uuid.UUID,
    *,
    matter_id: uuid.UUID | None = None,
    query: str | None = None,
    source_status: Any | None = None,
    confidence_level: Any | None = None,
    tag: str | None = None,
    has_verification_task: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[LedgerEntry], int]:
    """List ledger rows with all §3.1 filters and a total before pagination."""
    stmt: Select[tuple[LedgerEntry]] = select(LedgerEntry).where(
        LedgerEntry.workspace_id == workspace_id
    )
    if matter_id is not None:
        stmt = stmt.where(LedgerEntry.matter_id == matter_id)
    if query:
        pattern = f"%{query.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(LedgerEntry.fact_statement).like(pattern),
                func.lower(LedgerEntry.fact_short_name).like(pattern),
                func.lower(LedgerEntry.external_ledger_id).like(pattern),
            )
        )
    if source_status is not None:
        stmt = stmt.where(LedgerEntry.source_status == source_status)
    if confidence_level is not None:
        stmt = stmt.where(LedgerEntry.confidence_level == confidence_level)
    if tag:
        # JSONB containment matches a complete array element, not a substring.
        stmt = stmt.where(LedgerEntry.tags_json.contains([tag.strip()]))
    if has_verification_task is True:
        stmt = stmt.where(
            LedgerEntry.verification_task_text.is_not(None),
            func.length(func.trim(LedgerEntry.verification_task_text)) > 0,
        )
    elif has_verification_task is False:
        stmt = stmt.where(
            or_(
                LedgerEntry.verification_task_text.is_(None),
                func.length(func.trim(LedgerEntry.verification_task_text)) == 0,
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.scalars(
            stmt.order_by(LedgerEntry.created_at.desc(), LedgerEntry.id)
            .limit(limit)
            .offset(offset)
        )
    )
    return rows, int(total)


def _apply_bulk_patch(
    db: Session, workspace_id: uuid.UUID, entry: LedgerEntry, patch: LedgerBulkPatch
) -> None:
    changes = patch.model_dump(exclude_unset=True)
    if "matter_id" in changes:
        _check_matter(db, workspace_id, changes["matter_id"])
    if "tags" in changes:
        entry.tags_json = list(changes.pop("tags") or [])
    for field, value in changes.items():
        setattr(entry, field, value)


def bulk_patch(
    db: Session, workspace_id: uuid.UUID, request: LedgerBulkRequest
) -> dict[str, Any]:
    """Apply a valid patch to each row independently.

    ``updated`` and ``skipped`` contain IDs, while ``errors`` carries the ID
    and reason for each failed item.  One missing/cross-workspace ID therefore
    cannot turn a valid batch into an all-or-nothing 404.
    """
    updated: list[uuid.UUID] = []
    skipped: list[uuid.UUID] = []
    errors: list[dict[str, Any]] = []
    seen: set[uuid.UUID] = set()

    for entry_id in request.ids:
        if entry_id in seen:
            skipped.append(entry_id)
            continue
        seen.add(entry_id)
        entry = db.scalar(
            select(LedgerEntry).where(
                LedgerEntry.id == entry_id,
                LedgerEntry.workspace_id == workspace_id,
            )
        )
        if entry is None:
            errors.append({"id": entry_id, "error": "Ledger entry not found."})
            continue
        if not request.patch.model_dump(exclude_unset=True):
            skipped.append(entry_id)
            continue
        try:
            _apply_bulk_patch(db, workspace_id, entry, request.patch)
        except HTTPException as exc:
            errors.append({"id": entry_id, "error": str(exc.detail)})
            continue
        updated.append(entry_id)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # The supported bulk fields cannot normally violate a constraint, but
        # report a partial-operation error instead of returning a 500.
        for entry_id in updated:
            errors.append({"id": entry_id, "error": "Could not apply bulk patch."})
        updated = []
        if not errors:
            errors.append({"id": uuid.UUID(int=0), "error": str(exc.orig)})

    return {"updated": updated, "skipped": skipped, "errors": errors}


def _existing_import_tuple(entry: LedgerEntry) -> tuple[Any, ...]:
    from app.services.ledger_csv import CSV_COLUMNS

    values = {
        "external_ledger_id": entry.external_ledger_id,
        "date_start": entry.date_start,
        "date_end": entry.date_end,
        "date_text_raw": entry.date_text_raw,
        "fact_short_name": entry.fact_short_name,
        "fact_statement": entry.fact_statement,
        "claim_use_text": entry.claim_use_text,
        "relief_use_text": entry.relief_use_text,
        "source_path_text": entry.source_path_text,
        "source_locator_text": entry.source_locator_text,
        "source_status": entry.source_status,
        "authentication_or_witness": entry.authentication_or_witness,
        "confidence_level": entry.confidence_level,
        "verification_task_text": entry.verification_task_text,
        "restrictions_or_notes": entry.restrictions_or_notes,
        "tags": tuple(entry.tags_json or []),
    }
    return tuple(values[column] for column in CSV_COLUMNS)


def import_rows(
    db: Session,
    workspace_id: uuid.UUID,
    rows: Sequence[tuple[int, dict[str, Any]]],
    *,
    matter_id: uuid.UUID | None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Validate and optionally persist import rows, retaining row-level errors."""
    from app.services.ledger_csv import canonical_import_row, normalize_import_row

    _check_matter(db, workspace_id, matter_id)
    valid = 0
    created = 0
    skipped = 0
    errors: list[dict[str, Any]] = []
    pending: dict[tuple[uuid.UUID | None, str], tuple[Any, ...]] = {}
    entries_to_create: list[LedgerEntry] = []

    for row_number, raw_row in rows:
        try:
            values = normalize_import_row(raw_row, matter_id=matter_id)
        except ValueError as exc:
            errors.append({"row": row_number, "error": str(exc)})
            continue

        row_tuple = canonical_import_row(values)
        external_id = values.get("external_ledger_id")
        key = (matter_id, external_id) if external_id is not None else None
        if key is not None and key in pending:
            if pending[key] == row_tuple:
                valid += 1
                skipped += 1
            else:
                errors.append(
                    {
                        "row": row_number,
                        "error": "duplicate external_ledger_id in this matter",
                    }
                )
            continue

        existing = None
        if key is not None:
            existing = db.scalar(
                select(LedgerEntry).where(
                    LedgerEntry.workspace_id == workspace_id,
                    LedgerEntry.matter_id == matter_id,
                    LedgerEntry.external_ledger_id == external_id,
                )
            )
        if existing is not None:
            if _existing_import_tuple(existing) == row_tuple:
                valid += 1
                skipped += 1
            else:
                errors.append(
                    {
                        "row": row_number,
                        "error": "duplicate external_ledger_id in this matter",
                    }
                )
            continue

        valid += 1
        if key is not None:
            pending[key] = row_tuple
        if not dry_run:
            entry_values = dict(values)
            tags = entry_values.pop("tags")
            entries_to_create.append(
                LedgerEntry(workspace_id=workspace_id, tags_json=list(tags), **entry_values)
            )
        created += 1

    if dry_run:
        db.rollback()
        created = 0
    elif entries_to_create:
        db.add_all(entries_to_create)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            # This is only expected if another writer inserted the same
            # external ID during validation.  Return row-level errors rather
            # than making the endpoint look successful.
            errors.extend(
                {
                    "row": row_number,
                    "error": "duplicate external_ledger_id in this matter",
                }
                for row_number, _ in rows
                if row_number not in {item["row"] for item in errors}
            )
            created = 0
    return {"valid": valid, "created": created, "skipped": skipped, "errors": errors}
