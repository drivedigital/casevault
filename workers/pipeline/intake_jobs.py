"""Intake pipeline jobs (Wave 2 contract §4.4): fact-proposal generation.

Keep this module importable WITHOUT redis/rq installed, matching
`workers/pipeline/jobs.py` — DB/session imports happen lazily inside the job
functions so the API can import it for the inline path everywhere.

- generate_fact_proposals: paragraph sweep over a source's extracted text
  pages → `proposals` rows (type `fact`, state `proposed`, system-authored).
  Idempotent via a sha1 `provenance_key` recorded in
  `proposed_structured_json` per source; capped at `max_proposals`; never
  raises out of the job.
- enqueue_proposal_generation: best-effort RQ enqueue on the frozen `extract`
  queue; reports `{"queued": False, ...}` with a reason when redis is absent.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re

logger = logging.getLogger("casevault.intake_jobs")

# Contract §4.4 paragraph rules.
MAX_PARAGRAPH_CHARS = 1200
MIN_PARAGRAPH_CHARS = 40
TITLE_CHARS = 80
DEFAULT_MAX_PROPOSALS = 50

# Blank-line separated paragraph split (tolerates \r\n and whitespace-only
# separator lines).
_PARAGRAPH_SPLIT = re.compile(r"\n\s*\n")


def generate_fact_proposals(
    source_id: str,
    workspace_id: str,
    max_proposals: int = DEFAULT_MAX_PROPOSALS,
    database_url: str | None = None,
) -> dict:
    """Sweep one source's text pages into fact proposals (contract §4.4).

    Only text pages (extracted text present) are read; paragraphs are split on
    blank lines and trimmed to ``MAX_PARAGRAPH_CHARS``. Paragraphs shorter than
    ``MIN_PARAGRAPH_CHARS`` are skipped, as are paragraphs whose sha1 is already
    recorded under ``proposed_structured_json["provenance_key"]`` for that
    source (so re-runs are idempotent). Stops creating once
    ``max_proposals`` rows exist from this run; the remainder counts as
    skipped. Never raises: failures return status="failed" with a reason.
    """
    created = 0
    skipped = 0
    session = None
    try:
        from sqlalchemy import select

        from app.models.enums import ProposalType, ReviewState
        from app.models.intake import Proposal
        from app.models.source import Source, SourcePage
        from workers.pipeline.jobs import _connect

        session = _connect(database_url)
        source = session.get(Source, source_id)
        if source is None or str(source.workspace_id) != str(workspace_id):
            return _result("failed", 0, 0, "source not found in workspace")

        pages = list(
            session.scalars(
                select(SourcePage)
                .where(
                    SourcePage.source_id == source.id,
                    # "text pages only": rows with extracted text present
                    SourcePage.ocr_text.isnot(None),
                    SourcePage.ocr_text != "",
                )
                .order_by(SourcePage.page_number)
            )
        )

        # Provenance keys already recorded for this source → idempotent re-runs.
        seen: set[str] = set()
        for structured in session.scalars(
            select(Proposal.proposed_structured_json).where(Proposal.source_id == source.id)
        ):
            if isinstance(structured, dict):
                key = structured.get("provenance_key")
                if isinstance(key, str):
                    seen.add(key)

        max_proposals = max(0, int(max_proposals))
        for page in pages:
            for raw in _PARAGRAPH_SPLIT.split(page.ocr_text or ""):
                paragraph = raw.strip()
                if len(paragraph) > MAX_PARAGRAPH_CHARS:
                    # §4.4: paragraphs are ≤ 1200 chars — trim the overflow
                    # rather than dropping the sentence material.
                    paragraph = paragraph[:MAX_PARAGRAPH_CHARS].rstrip()
                if len(paragraph) < MIN_PARAGRAPH_CHARS:
                    skipped += 1
                    continue
                key = hashlib.sha1(paragraph.encode("utf-8")).hexdigest()
                if key in seen:
                    skipped += 1
                    continue
                if created >= max_proposals:
                    skipped += 1
                    continue
                seen.add(key)
                session.add(
                    Proposal(
                        workspace_id=source.workspace_id,
                        matter_id=None,
                        proposal_type=ProposalType.fact,
                        review_state=ReviewState.proposed,
                        title=paragraph[:TITLE_CHARS],
                        proposed_text=paragraph,
                        proposed_structured_json={
                            "provenance_key": key,
                            "page_number": page.page_number,
                        },
                        source_id=source.id,
                        confidence_score=None,
                        created_by_system=True,
                    )
                )
                created += 1
        session.commit()
        return _result("complete", created, skipped, None)
    except Exception as exc:  # the job contract (§4.4): never raise out
        logger.exception("generate_fact_proposals failed for source %s", source_id)
        if session is not None:
            import contextlib

            with contextlib.suppress(Exception):
                session.rollback()
        # The single end-of-run commit is all-or-nothing, so nothing was written.
        return _result("failed", 0, skipped, f"{type(exc).__name__}: {exc}")
    finally:
        if session is not None:
            session.close()


def enqueue_proposal_generation(
    source_id: str, workspace_id: str, max_proposals: int | None = None
) -> dict:
    """Best-effort RQ enqueue of generate_fact_proposals on `extract`.

    Returns {"queued": bool, "job_id": str|None, "reason": str|None} — the
    caller falls back to the inline path when this reports queued=False.
    `max_proposals` travels as RQ job kwargs so a queued run honors the same
    cap as the inline one (omitted → the job's default applies). No redis (not
    installed, unreachable, or unset) must never raise.
    """
    try:
        import redis  # deferred: optional dependency
        from rq import Queue

        from workers.pipeline.jobs import _ensure_app_importable

        _ensure_app_importable()
        redis_url = os.environ.get("REDIS_URL") or _settings_redis_url()
        conn = redis.Redis.from_url(redis_url, socket_connect_timeout=2)
        conn.ping()
        # RQ 2.x parses `enqueue(f, *args, **kwargs)`: mixing positional job
        # args with an explicit `kwargs=` trips Queue.parse_args' assert, and
        # the except below would silently swallow it into the inline fallback.
        # Job arguments must travel ONLY as explicit args=/kwargs= (round-2
        # integrator review of c174051).
        job = Queue("extract", connection=conn).enqueue(
            "workers.pipeline.intake_jobs.generate_fact_proposals",
            args=(str(source_id), str(workspace_id)),
            kwargs=None if max_proposals is None else {"max_proposals": int(max_proposals)},
        )
        return {"queued": True, "job_id": getattr(job, "id", None), "reason": None}
    except Exception as exc:  # noqa: BLE001 - graceful without redis by contract
        reason = str(exc) or type(exc).__name__
        logger.info("proposal generation not queued (redis unavailable): %s", reason)
        return {"queued": False, "job_id": None, "reason": reason}


def _settings_redis_url() -> str:
    try:
        from app.config import get_settings

        return get_settings().redis_url
    except Exception:  # noqa: BLE001 - worker env may lack app config
        return "redis://localhost:6379/0"


def _result(status: str, created: int, skipped: int, reason: str | None) -> dict:
    return {
        "job": "generate_fact_proposals",
        "status": status,
        "created": created,
        "skipped": skipped,
        "reason": reason,
    }
