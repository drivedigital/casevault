"""Pipeline jobs (Sprint 3: evidence ingestion).

Keep this module importable WITHOUT redis/rq installed so unit tests and
direct-run bootstraps work everywhere. DB/API imports happen lazily inside
the job functions; `app` resolves via sys.path (pytest pythonpath, the
worker bootstrap, or run_process.py).

Sprint 3 status:
- process_source: real for text-type evidence (writes the extracted-text
  page); an explicit STUB for pdf/image/spreadsheet (no OCR engine wired
  yet — marks ocr_status='skipped' and records why in source_metadata).
- describe_image: VLM description stub (registered, not enqueued yet).
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path


def _ensure_app_importable() -> None:
    """Make the apps/api package importable when run outside pytest."""
    api_root = Path(__file__).resolve().parents[2] / "apps" / "api"
    if api_root.is_dir() and str(api_root) not in sys.path:
        sys.path.insert(0, str(api_root))


def _connect(database_url: str | None = None):
    """Open a DB session using DATABASE_URL (env / .env.local fallback)."""
    _ensure_app_importable()
    if database_url is None:
        try:
            from dotenv import load_dotenv

            load_dotenv(".env.local", override=False)
            load_dotenv(".env", override=False)
        except ImportError:
            pass
        database_url = os.environ.get(
            "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/casevault"
        )
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(database_url, pool_pre_ping=True)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()


def _merge_metadata(session, source_id: str, update: dict) -> None:
    from app.models.source import SourceMetadata

    meta = session.get(SourceMetadata, source_id)
    if meta is None:
        meta = SourceMetadata(source_id=source_id)
        session.add(meta)
    meta.metadata_json = {**(meta.metadata_json or {}), **update}


def process_source(source_id: str, database_url: str | None = None) -> dict:
    """Ingest pipeline for one source (rq-callable: plain-string args).

    - text/markdown/email/note: writes the single extracted-text page
    - pdf/image/spreadsheet/other: OCR stub — marks skipped with a reason
      (real Tesseract/OCRmyPDF integration lands with the OCR sprint item)
    """
    session = _connect(database_url)
    try:
        from app.models.enums import SourceType
        from app.models.source import Source, SourcePage

        source = session.get(Source, source_id)
        if source is None:
            raise ValueError(f"source {source_id} not found")

        if source.processing_status == "complete":
            return {"source_id": source_id, "status": "already_complete"}

        source.processing_status = "processing"
        session.commit()

        if source.source_type in (
            SourceType.text,
            SourceType.markdown,
            SourceType.email,
            SourceType.note,
        ):
            # Re-read the stored bytes and (re)write the text page.
            from app.services.storage import LocalStorage

            content = LocalStorage().read(source.storage_path)
            text = content.decode("utf-8", errors="replace")
            for page in source.pages:
                session.delete(page)
            session.flush()
            session.add(
                SourcePage(source_id=source.id, page_number=1, page_label="1", ocr_text=text)
            )
            source.page_count = 1
            source.ocr_status = "complete"
            _merge_metadata(
                session,
                source_id,
                {"ingest_method": "worker_text", "processed_at": _now()},
            )
        else:
            source.ocr_status = "skipped"
            _merge_metadata(
                session,
                source_id,
                {
                    "ingest_method": "worker_stub",
                    "processed_at": _now(),
                    "ocr": {
                        "engine": "stub",
                        "reason": "No OCR engine wired in this build "
                        "(Tesseract/OCRmyPDF integration is a later sprint item).",
                    },
                    **(
                        {"vlm": {"engine": "stub", "reason": "VLM description not configured."}}
                        if source.source_type == SourceType.image
                        else {}
                    ),
                },
            )
        source.processing_status = "complete"
        session.commit()
        return {
            "source_id": source_id,
            "status": "complete",
            "ocr_status": source.ocr_status,
            "page_count": source.page_count,
        }
    except Exception:
        session.rollback()
        _mark_failed_quietly(session, source_id)
        raise
    finally:
        session.close()


def _mark_failed_quietly(session, source_id: str) -> None:
    """Best-effort failure marker — must never mask the original error."""
    import contextlib
    import logging

    with contextlib.suppress(Exception):
        from app.models.source import Source

        source = session.get(Source, source_id)
        if source is not None:
            source.processing_status = "failed"
            session.commit()
    logging.getLogger("casevault.worker").warning(
        "source %s marked processing_status=failed", source_id
    )


def describe_image(source_id: str, database_url: str | None = None) -> dict:
    """VLM image-description stub (Sprint 3 deliverable: pipeline stub).

    Registered for the future `extract`/`analysis` queues; not enqueued by
    the upload flow yet. When a provider is configured this job will call
    it with the page image and store the description in source_metadata.
    """
    return {
        "job": "describe_image",
        "source_id": source_id,
        "status": "stub",
        "reason": "No VLM provider configured (AI defaults to no_ai).",
        "time_utc": _now(),
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ping() -> dict:
    """Trivial liveness job: proves the worker bootstrap and queue wiring."""
    return {
        "job": "ping",
        "status": "ok",
        "time_utc": _now(),
        "redis_url_set": bool(os.environ.get("REDIS_URL")),
    }


def health_check() -> dict:
    """Placeholder job registration target for later pipelines."""
    return {"job": "health_check", "status": "ok", "registered": True, "time_utc": _now()}
