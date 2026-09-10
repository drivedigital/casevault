"""Per-source ingest and OCR jobs (docs/contracts/sprint3_evidence.md §5).

Contract rules implemented here:

- ``ingest_source`` recomputes ``sha256``/``file_size_bytes`` when missing,
  sets ``mime_type``, sets ``page_count`` (PDF via optional ``pypdf``), and
  re-classifies ``source_type`` only when it is ``other`` — then sets
  ``processing_status`` to ``complete`` (or ``failed`` with the error string
  in ``source_metadata.metadata_json["ingest_error"]``).
- ``ocr_source`` writes page 1 ``ocr_text`` for plain-text evidence (text /
  markdown / csv / email / note), uses the optional OCR stack (``pypdf`` /
  ``pytesseract`` / ``pdf2image``) when importable AND its system binaries are
  present, and otherwise marks ``ocr_status="skipped"`` with
  ``metadata_json["ocr_note"]``. Exceptions become ``ocr_status="failed"`` with
  ``metadata_json["ocr_error"]``.
- Jobs are idempotent (safe to re-run), open their own DB session via
  ``app.db.session.get_session_factory()`` (same ``DATABASE_URL`` as the API),
  and NEVER raise: every return is a dict, and failures are recorded in
  ``source_metadata.metadata_json``.

The module stays importable WITHOUT redis/rq, without the optional OCR
libraries, and without a database — all app/DB/heavy imports happen inside
the functions (same posture as ``workers/pipeline/jobs.py``).
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
import mimetypes
import shutil
import sys
import uuid as uuid_lib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger("casevault.worker")

_INGEST_METHOD = "workers.pipeline.source_jobs.ingest_source"
_OCR_METHOD = "workers.pipeline.source_jobs.ocr_source"

# Source types whose stored bytes are readable as text without an OCR engine.
# CSV is covered by extension below (it classifies as `spreadsheet`, §4.3).
_PLAIN_TEXT_SOURCE_TYPES = {"text", "markdown", "email", "note"}
_PLAIN_TEXT_EXTS = {".txt", ".log", ".rtf", ".md", ".markdown", ".eml", ".msg", ".csv"}

# Explicit extension → mime map (deterministic across platforms; mimetypes
# fills in the rest, e.g. .pdf/.png/.jpg).
_MIME_OVERRIDES = {
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".log": "text/plain",
    ".eml": "message/rfc822",
    ".msg": "application/vnd.ms-outlook",
    ".csv": "text/csv",
    ".heic": "image/heic",
    ".rtf": "application/rtf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pages": "application/x-iwork-pages-sffpages",
}


def _ensure_app_importable() -> None:
    """Make the apps/api package importable when run outside pytest."""
    api_root = Path(__file__).resolve().parents[2] / "apps" / "api"
    if api_root.is_dir() and str(api_root) not in sys.path:
        sys.path.insert(0, str(api_root))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _session():
    """Own DB session per job run (contract §5) — same DATABASE_URL as the API."""
    _ensure_app_importable()
    from app.db.session import get_session_factory

    return get_session_factory()()


def _load_source(session, source_id: str, workspace_id: str):
    """Fetch the source, refusing unknown ids and workspace mismatches."""
    from app.models.source import Source

    try:
        source_uuid = uuid_lib.UUID(str(source_id))
    except (TypeError, ValueError):
        return None
    source = session.get(Source, source_uuid)
    if source is None or str(source.workspace_id) != str(workspace_id):
        return None
    return source


def _merge_metadata(session, source_uuid, update: dict) -> None:
    """Shallow-merge ``update`` into source_metadata.metadata_json."""
    from app.models.source import SourceMetadata

    meta = session.get(SourceMetadata, source_uuid)
    if meta is None:
        meta = SourceMetadata(source_id=source_uuid)
        session.add(meta)
    meta.metadata_json = {**(meta.metadata_json or {}), **update}


def _guess_mime(filename: str) -> str:
    ext = Path(filename.replace("\\", "/")).suffix.lower()
    if ext in _MIME_OVERRIDES:
        return _MIME_OVERRIDES[ext]
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or "application/octet-stream"


def _filename_of(source) -> str:
    if source.original_filename:
        return source.original_filename
    return Path(source.storage_path.replace("\\", "/")).name


# ---------------------------------------------------------------------------
# ingest_source
# ---------------------------------------------------------------------------
def ingest_source(source_id: str, workspace_id: str) -> dict:
    """Ingest one source: hashes, size, mime, page count, classification.

    Idempotent and never raises (contract §5). Returns at least
    ``{"job", "source_id", "workspace_id", "status"}``.
    """
    result: dict[str, Any] = {
        "job": "ingest_source",
        "source_id": str(source_id),
        "workspace_id": str(workspace_id),
        "status": "failed",
    }
    try:
        result.update(_ingest_source(str(source_id), str(workspace_id)))
    except Exception as exc:  # noqa: BLE001 — jobs must never raise
        logger.warning("ingest_source %s failed: %s", source_id, exc)
        _mark_failed(source_id, status_field="processing_status", error_key="ingest_error", message=str(exc))
        result["status"] = "failed"
        result["error"] = str(exc)[:500]
    return result


def _ingest_source(source_id: str, workspace_id: str) -> dict:
    from app.integrations.storage import classify_source_type, get_storage
    from app.models.enums import SourceType

    session = _session()
    try:
        source = _load_source(session, source_id, workspace_id)
        if source is None:
            return {"status": "not_found"}

        if source.processing_status == "complete" and source.sha256 and source.file_size_bytes:
            return {
                "status": "already_complete",
                "sha256": source.sha256,
                "size_bytes": source.file_size_bytes,
            }

        data: bytes = get_storage().read_bytes(source.storage_path)

        if not source.sha256:
            source.sha256 = hashlib.sha256(data).hexdigest()
        if source.file_size_bytes is None:
            source.file_size_bytes = len(data)

        filename = _filename_of(source)
        if not source.mime_type:
            source.mime_type = _guess_mime(filename)

        page_count: int | None = None
        if Path(filename.lower()).suffix == ".pdf" or str(source.source_type) == SourceType.pdf.value:
            page_count = _pdf_page_count(data)
            if page_count is not None:
                source.page_count = page_count

        # Re-classify ONLY when the source still carries the `other` bucket.
        if str(source.source_type) == SourceType.other.value:
            source.source_type = classify_source_type(filename)

        metadata: dict[str, Any] = {"ingest_method": _INGEST_METHOD, "processed_at": _now()}
        if page_count is None and str(source.source_type) == SourceType.pdf.value:
            metadata["ingest_note"] = (
                "pypdf is not installed (workers/requirements-ocr.txt); page_count not computed"
            )
        source.processing_status = "complete"
        _merge_metadata(session, source.id, metadata)
        session.commit()
        return {
            "status": "complete",
            "sha256": source.sha256,
            "size_bytes": source.file_size_bytes,
            "mime_type": source.mime_type,
            "page_count": source.page_count,
            "source_type": str(source.source_type),
        }
    finally:
        session.close()


def _pdf_page_count(data: bytes) -> int | None:
    """Page count via optional pypdf; None when pypdf is not installed.

    A parse error propagates — a corrupt PDF is an ingest failure with the
    error recorded in metadata_json["ingest_error"].
    """
    try:
        import pypdf
    except ImportError:
        return None
    return len(pypdf.PdfReader(io.BytesIO(data)).pages)


# ---------------------------------------------------------------------------
# ocr_source
# ---------------------------------------------------------------------------
def ocr_source(source_id: str, workspace_id: str) -> dict:
    """OCR/text-extract one source into source_pages (contract §5).

    Plain-text evidence becomes page 1 verbatim; PDF/image go through the
    optional engine stack when available, else ``ocr_status="skipped"`` with
    an ``ocr_note``. Idempotent and never raises.
    """
    result: dict[str, Any] = {
        "job": "ocr_source",
        "source_id": str(source_id),
        "workspace_id": str(workspace_id),
        "status": "failed",
    }
    try:
        result.update(_ocr_source(str(source_id), str(workspace_id)))
    except Exception as exc:  # noqa: BLE001 — jobs must never raise
        logger.warning("ocr_source %s failed: %s", source_id, exc)
        _mark_failed(source_id, status_field="ocr_status", error_key="ocr_error", message=str(exc))
        result["status"] = "failed"
        result["error"] = str(exc)[:500]
    return result


def _ocr_source(source_id: str, workspace_id: str) -> dict:
    from app.integrations.storage import get_storage
    from app.models.enums import SourceType

    session = _session()
    try:
        source = _load_source(session, source_id, workspace_id)
        if source is None:
            return {"status": "not_found"}
        if source.ocr_status == "complete":
            return {
                "status": "already_complete",
                "ocr_status": "complete",
                "page_count": source.page_count,
            }

        storage = get_storage()
        filename = _filename_of(source)
        ext = Path(filename.replace("\\", "/")).suffix.lower()
        source_type = str(source.source_type)

        if source_type in _PLAIN_TEXT_SOURCE_TYPES or ext in _PLAIN_TEXT_EXTS:
            text = storage.read_bytes(source.storage_path).decode("utf-8", errors="replace")
            _rewrite_pages(session, source, [(1, text)])
            source.page_count = 1
            source.ocr_status = "complete"
            _merge_metadata(session, source.id, {"ocr_method": "plain_text", "ocr_completed_at": _now()})
            session.commit()
            return {"status": "complete", "ocr_status": "complete", "page_count": 1}

        if source_type == SourceType.pdf.value:
            return _ocr_pdf(session, source, storage)
        if source_type == SourceType.image.value:
            return _ocr_image(session, source, storage)

        return _skip(
            session,
            source,
            f"No OCR engine for source_type={source_type} ({ext or 'no extension'}) in this "
            "build; evidence stays reviewable without extracted text",
        )
    finally:
        session.close()


def _ocr_pdf(session, source, storage) -> dict:
    """PDF text extraction via optional pypdf; scanned pages via pdf2image+tesseract."""
    try:
        import pypdf
    except ImportError:
        return _skip(
            session,
            source,
            "pypdf is not installed (pip install -r workers/requirements-ocr.txt); "
            "PDF text extraction skipped",
        )

    data: bytes = storage.read_bytes(source.storage_path)
    reader = pypdf.PdfReader(io.BytesIO(data))
    pages: list[tuple[int, str]] = []
    for index, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if not text:
            text = _raster_ocr_page(data, index) or ""
        pages.append((index, text))
        _write_page_json(storage, source, index, text)
    _rewrite_pages(session, source, pages)
    source.page_count = len(pages)
    source.ocr_status = "complete"
    _merge_metadata(session, source.id, {"ocr_method": "pypdf", "ocr_completed_at": _now()})
    session.commit()
    return {"status": "complete", "ocr_status": "complete", "page_count": len(pages)}


def _ocr_image(session, source, storage) -> dict:
    """Image OCR via optional pytesseract + Pillow, requiring the tesseract binary."""
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        pytesseract = None
    if pytesseract is None or shutil.which("tesseract") is None:
        return _skip(
            session,
            source,
            "image OCR needs pytesseract + Pillow (workers/requirements-ocr.txt) and the "
            "tesseract binary on PATH; skipped in this deployment",
        )
    image = Image.open(io.BytesIO(storage.read_bytes(source.storage_path)))
    text = (pytesseract.image_to_string(image) or "").strip()
    _rewrite_pages(session, source, [(1, text)])
    source.page_count = 1
    source.ocr_status = "complete"
    _merge_metadata(session, source.id, {"ocr_method": "tesseract", "ocr_completed_at": _now()})
    session.commit()
    return {"status": "complete", "ocr_status": "complete", "page_count": 1}


def _raster_ocr_page(pdf_bytes: bytes, page_number: int) -> str | None:
    """OCR one scanned PDF page by rasterising it; None when the stack is absent.

    Uses pdf2image (poppler's pdftoppm) + pytesseract (tesseract), all optional.
    """
    try:
        import pytesseract
        from pdf2image import convert_from_bytes
    except ImportError:
        return None
    if shutil.which("pdftoppm") is None or shutil.which("tesseract") is None:
        return None
    images = convert_from_bytes(pdf_bytes, dpi=150, first_page=page_number, last_page=page_number)
    if not images:
        return None
    return (pytesseract.image_to_string(images[0]) or "").strip()


def _write_page_json(storage, source, page_number: int, text: str) -> None:
    """Best-effort sidecar per §4.2 (``ocr/{ws}/{src}/pages/{n}.json``)."""
    from app.integrations.storage import ocr_page_key

    try:
        payload = json.dumps(
            {"page_number": page_number, "characters": len(text), "ocr_text": text},
            ensure_ascii=False,
        ).encode("utf-8")
        storage.write_derived(ocr_page_key(source.workspace_id, source.id, page_number), payload)
    except Exception:  # noqa: BLE001 — sidecar must not fail the job
        logger.warning("could not write OCR page JSON for source %s page %s", source.id, page_number)


def _rewrite_pages(session, source, pages: list[tuple[int, str]]) -> None:
    """Replace the source's stored pages (idempotent on re-runs)."""
    from app.models.source import SourcePage

    for page in list(source.pages):
        session.delete(page)
    session.flush()
    for number, text in pages:
        session.add(
            SourcePage(
                source_id=source.id,
                page_number=number,
                page_label=str(number),
                ocr_text=text,
            )
        )


def _skip(session, source, note: str) -> dict:
    source.ocr_status = "skipped"
    _merge_metadata(session, source.id, {"ocr_method": "none", "ocr_note": note, "ocr_skipped_at": _now()})
    session.commit()
    return {"status": "skipped", "ocr_status": "skipped", "reason": note}


# ---------------------------------------------------------------------------
# shared failure marker (never raises)
# ---------------------------------------------------------------------------
def _mark_failed(source_id: str, *, status_field: str, error_key: str, message: str) -> None:
    """Best-effort failure marker in its own session — never masks the job error."""
    try:
        source_uuid = uuid_lib.UUID(str(source_id))
    except (TypeError, ValueError):
        return
    try:
        session = _session()
        try:
            from app.models.source import Source

            source = session.get(Source, source_uuid)
            if source is None:
                return
            setattr(source, status_field, "failed")
            _merge_metadata(
                session,
                source_uuid,
                {error_key: message[:2000], "failed_at": _now()},
            )
            session.commit()
        finally:
            session.close()
    except Exception:
        logger.exception("could not mark source %s as failed", source_id)
