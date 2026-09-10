"""Source ledger endpoints (Wave 2 contract v1.0)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import Response as FastAPIResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.enums import SourceStatus, StrengthLabel
from app.routers.matters import resolve_workspace_id
from app.schemas.ledger import (
    LedgerBulkRequest,
    LedgerBulkResult,
    LedgerEntryCreate,
    LedgerEntryOut,
    LedgerEntryPage,
    LedgerEntryUpdate,
    LedgerImportJSON,
    LedgerImportResult,
    LinkedSourceRequest,
)
from app.services import ledger_csv, ledger_service

router = APIRouter(tags=["ledger"])


_LIMIT_DESCRIPTION = "Maximum 200 rows per request."


def _as_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _list_kwargs(
    *,
    matter_id: uuid.UUID | None,
    q: str | None,
    source_status: SourceStatus | None,
    confidence_level: StrengthLabel | None,
    tag: str | None,
    has_verification_task: bool | None,
    limit: int,
    offset: int,
) -> dict:
    return {
        "matter_id": matter_id,
        "query": q,
        "source_status": source_status,
        "confidence_level": confidence_level,
        "tag": tag,
        "has_verification_task": has_verification_task,
        "limit": limit,
        "offset": offset,
    }


def _page(
    db: Session,
    workspace_id: uuid.UUID,
    *,
    kwargs: dict,
) -> LedgerEntryPage:
    entries, total = ledger_service.list_entries(db, workspace_id, **kwargs)
    return LedgerEntryPage(
        items=[ledger_service.to_out(db, entry) for entry in entries],
        total=total,
        limit=kwargs["limit"],
        offset=kwargs["offset"],
    )


@router.get("/ledger-entries", response_model=LedgerEntryPage)
def list_ledger_entries(
    workspace_id: uuid.UUID | None = Query(default=None),
    matter_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None),
    source_status: SourceStatus | None = Query(default=None),
    confidence_level: StrengthLabel | None = Query(default=None),
    tag: str | None = Query(default=None),
    has_verification_task: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200, description=_LIMIT_DESCRIPTION),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return _page(
        db,
        ws_id,
        kwargs=_list_kwargs(
            matter_id=matter_id,
            q=q,
            source_status=source_status,
            confidence_level=confidence_level,
            tag=tag,
            has_verification_task=has_verification_task,
            limit=limit,
            offset=offset,
        ),
    )


@router.post("/ledger-entries", response_model=LedgerEntryOut, status_code=201)
def create_ledger_entry(
    payload: LedgerEntryCreate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return ledger_service.to_out(db, ledger_service.create_entry(db, ws_id, payload))


@router.get("/ledger-entries/export.csv", response_class=FastAPIResponse)
def export_ledger_entries(
    workspace_id: uuid.UUID | None = Query(default=None),
    matter_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None),
    source_status: SourceStatus | None = Query(default=None),
    confidence_level: StrengthLabel | None = Query(default=None),
    tag: str | None = Query(default=None),
    has_verification_task: bool | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=200, description=_LIMIT_DESCRIPTION),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    entries, _ = ledger_service.list_entries(
        db,
        ws_id,
        **_list_kwargs(
            matter_id=matter_id,
            q=q,
            source_status=source_status,
            confidence_level=confidence_level,
            tag=tag,
            has_verification_task=has_verification_task,
            limit=limit,
            offset=offset,
        ),
    )
    return FastAPIResponse(
        content=ledger_csv.export_csv(entries),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ledger-entries.csv"},
    )


@router.post("/ledger-entries/import", response_model=LedgerImportResult)
async def import_ledger_entries(
    request: Request,
    workspace_id: uuid.UUID | None = Query(default=None),
    matter_id: uuid.UUID | None = Query(default=None),
    dry_run: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    """Import either multipart ``file`` or JSON ``{"rows": [...]}``.

    Reading the request directly lets the same endpoint accept a body flag for
    JSON and a form flag for multipart without making either media type depend
    on FastAPI's generated body model.
    """
    content_type = request.headers.get("content-type", "").lower()
    row_pairs: list[tuple[int, dict]]
    effective_dry_run = dry_run

    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file")
        if upload is None or not hasattr(upload, "read"):
            raise HTTPException(status_code=422, detail="multipart import requires a file field")
        form_dry_run = form.get("dry_run")
        if form_dry_run is not None:
            effective_dry_run = _as_bool(form_dry_run)
        try:
            rows = ledger_csv.parse_csv(await upload.read())
        except ledger_csv.CSVHeaderError as exc:
            raise HTTPException(
                status_code=422,
                detail={"error": str(exc), "expected_columns": list(ledger_csv.CSV_COLUMNS)},
            ) from exc
        except ledger_csv.CSVContentError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        row_pairs = [(index + 2, row) for index, row in enumerate(rows)]
    else:
        try:
            body = await request.json()
            parsed = LedgerImportJSON.model_validate(body)
        except Exception as exc:
            raise HTTPException(status_code=422, detail="JSON import requires a rows array") from exc
        effective_dry_run = effective_dry_run or parsed.dry_run
        row_pairs = [(index + 1, row) for index, row in enumerate(parsed.rows)]

    ws_id = resolve_workspace_id(db, workspace_id)
    result = ledger_service.import_rows(
        db,
        ws_id,
        row_pairs,
        matter_id=matter_id,
        dry_run=effective_dry_run,
    )
    return result


@router.post("/ledger-entries/bulk", response_model=LedgerBulkResult)
def bulk_ledger_entries(
    request: LedgerBulkRequest,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return ledger_service.bulk_patch(db, ws_id, request)


@router.get("/ledger-entries/{entry_id}", response_model=LedgerEntryOut)
def get_ledger_entry(
    entry_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return ledger_service.to_out(db, ledger_service.get_entry(db, ws_id, entry_id))


@router.patch("/ledger-entries/{entry_id}", response_model=LedgerEntryOut)
def update_ledger_entry(
    entry_id: uuid.UUID,
    payload: LedgerEntryUpdate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    updated = ledger_service.update_entry(db, ws_id, entry_id, payload)
    return ledger_service.to_out(db, updated)


@router.delete("/ledger-entries/{entry_id}", status_code=204)
def delete_ledger_entry(
    entry_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ledger_service.delete_entry(db, resolve_workspace_id(db, workspace_id), entry_id)
    return Response(status_code=204)


@router.post("/ledger-entries/{entry_id}/link-source", response_model=LedgerEntryOut)
def link_ledger_source(
    entry_id: uuid.UUID,
    payload: LinkedSourceRequest,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    # The contract uses a small JSON body: {"source_id": ...}.
    ws_id = resolve_workspace_id(db, workspace_id)
    return ledger_service.to_out(
        db,
        ledger_service.update_entry(
            db,
            ws_id,
            entry_id,
            LedgerEntryUpdate(linked_source_id=payload.source_id),
        ),
    )
