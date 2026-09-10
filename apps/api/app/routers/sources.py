"""Evidence source endpoints: upload, list/filter, detail, lifecycle,
matter links, extracted-text pages, and the stored-file download used by
the source viewer.

Uploads are multipart (python-multipart); the bytes go straight to the
local storage adapter and only the RELATIVE storage path ever enters the
database. The file endpoint re-resolves that path inside the configured
storage root — a client can never request an arbitrary filesystem path.
"""
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.enums import EvidenceReviewStatus, SourceStatus, SourceType
from app.routers.matters import resolve_workspace_id
from app.schemas.source import (
    SourceMatterLinkCreate,
    SourceMatterLinkOut,
    SourceOut,
    SourcePageOut,
    SourceUpdate,
)
from app.services import source_service
from app.services.storage import LocalStorage

router = APIRouter(tags=["sources"])


def _source_out(db: Session, source) -> SourceOut:
    return SourceOut(
        **{c.name: getattr(source, c.name) for c in source.__table__.columns},
        duplicate_of=source_service.duplicate_of_info(db, source.id),
    )


@router.get("/sources", response_model=list[SourceOut])
def list_sources(
    workspace_id: uuid.UUID | None = Query(default=None),
    matter_id: uuid.UUID | None = Query(default=None),
    source_type: SourceType | None = Query(default=None),
    evidence_review_status: EvidenceReviewStatus | None = Query(default=None),
    q: str | None = Query(default=None, max_length=255),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    rows = source_service.list_sources(
        db,
        ws_id,
        matter_id=matter_id,
        source_type=source_type,
        evidence_review_status=evidence_review_status,
        query=q,
    )
    return [_source_out(db, s) for s in rows]


@router.post("/sources", response_model=SourceOut, status_code=201)
async def upload_source(
    file: UploadFile = File(...),
    title: str | None = Form(default=None, max_length=255),
    source_status: SourceStatus = Form(default=SourceStatus.derived),
    matter_id: uuid.UUID | None = Form(default=None),
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    content = await file.read()
    source = source_service.create_upload(
        db,
        ws_id,
        filename=file.filename or "upload",
        content=content,
        mime_type=file.content_type,
        title=title,
        source_status=source_status,
    )
    if matter_id is not None:
        source_service.link_source_to_matter(db, ws_id, matter_id, source.id, None)
    return _source_out(db, source)


@router.get("/sources/{source_id}", response_model=SourceOut)
def get_source(
    source_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    source = source_service.get_source(db, ws_id, source_id)
    return _source_out(db, source)


@router.patch("/sources/{source_id}", response_model=SourceOut)
def update_source(
    source_id: uuid.UUID,
    payload: SourceUpdate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    source = source_service.update_source(db, ws_id, source_id, payload)
    return _source_out(db, source)


@router.get("/sources/{source_id}/file")
def download_source_file(
    source_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    source = source_service.get_source(db, ws_id, source_id)
    storage = LocalStorage()
    try:
        path = storage.open_path(source.storage_path)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=410, detail="Stored file is missing.") from exc
    return FileResponse(
        path,
        media_type=source.mime_type or "application/octet-stream",
        filename=source.original_filename or path.name,
    )


@router.get("/sources/{source_id}/pages", response_model=list[SourcePageOut])
def list_source_pages(
    source_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return source_service.list_pages(db, ws_id, source_id)


@router.get("/sources/{source_id}/matters", response_model=list[SourceMatterLinkOut])
def list_source_matters(
    source_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return [_link_out(db, link) for link in source_service.list_links_for_source(db, ws_id, source_id)]


@router.get("/matters/{matter_id}/sources", response_model=list[SourceOut])
def list_matter_sources(
    matter_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    rows = source_service.list_sources(db, ws_id, matter_id=matter_id)
    return [_source_out(db, s) for s in rows]


@router.get("/matters/{matter_id}/source-links", response_model=list[SourceMatterLinkOut])
def list_matter_source_links(
    matter_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    return [
        _link_out(db, link) for link in source_service.list_links_for_matter(db, ws_id, matter_id)
    ]


@router.post("/matters/{matter_id}/sources", response_model=SourceMatterLinkOut, status_code=201)
def link_source_to_matter(
    matter_id: uuid.UUID,
    payload: SourceMatterLinkCreate,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    link = source_service.link_source_to_matter(
        db, ws_id, matter_id, payload.source_id, payload.link_reason
    )
    return _link_out(db, link)


@router.delete("/source-matter-links/{link_id}", status_code=204)
def delete_source_matter_link(
    link_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    ws_id = resolve_workspace_id(db, workspace_id)
    source_service.delete_link(db, ws_id, link_id)
    return Response(status_code=204)


def _link_out(db: Session, link) -> SourceMatterLinkOut:
    source = link.source
    matter = link.matter
    return SourceMatterLinkOut(
        id=link.id,
        source_id=source.id,
        source_title=source.title,
        matter_id=matter.id,
        matter_name=matter.name,
        matter_slug=matter.slug,
        link_reason=link.link_reason,
        created_at=link.created_at,
    )
