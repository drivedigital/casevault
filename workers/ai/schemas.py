"""Core data shapes for AI-generated proposals (WS-AI-INTEL).

These mirror the `proposals` table contract (Database Schema Draft §6 /
Technical Spec §7.3 Group F) without depending on SQLAlchemy or Alembic —
the DB-backed repositories owned by other workstreams plug into the
`ProposalStore` protocol defined in `workers.ai.proposal_pipeline`.

Hard invariant (WS-AI-INTEL #1): every AI-generated fact/event MUST start
in `review_state = proposed`. Both the pipeline and the store enforce this.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Mapping, Optional, Sequence, Set, Tuple

# ---------------------------------------------------------------------------
# Enums — mirror Database Schema Draft §5.8 / §5.9
# ---------------------------------------------------------------------------


class ProposalType(str, Enum):
    FACT = "fact"
    EVENT = "event"
    ACTOR = "actor"
    DUPLICATE_MERGE = "duplicate_merge"
    DATE_NORMALIZATION = "date_normalization"
    CLAIM_MAPPING = "claim_mapping"
    CONTRADICTION = "contradiction"
    VERIFICATION_TASK = "verification_task"
    RESTRICTION = "restriction"


class ReviewState(str, Enum):
    PROPOSED = "proposed"
    ACCEPTED = "accepted"
    ACCEPTED_WITH_EDITS = "accepted_with_edits"
    REJECTED = "rejected"
    DEFERRED = "deferred"
    UNCERTAIN = "uncertain"
    SUPERSEDED = "superseded"
    DISPUTED = "disputed"


#: The only state an AI-generated record may be created in.
AI_INITIAL_REVIEW_STATE = ReviewState.PROPOSED.value

VALID_PROPOSAL_TYPES: Set[str] = {t.value for t in ProposalType}


# ---------------------------------------------------------------------------
# JSON extraction from model output
# ---------------------------------------------------------------------------

_FENCE_RE = re.compile(
    r"^```[a-zA-Z0-9_-]*[ \t]*\r?\n(.*?)\r?\n?```$", re.DOTALL
)


def extract_json(text: str) -> Any:
    """Best-effort extraction of a JSON value from raw model output.

    Handles: pure JSON, markdown-fenced JSON, and JSON embedded in prose.
    Raises `ValueError` when no parseable JSON object/array is found.
    """
    if text is None:
        raise ValueError("model returned no text")
    stripped = text.strip()
    if not stripped:
        raise ValueError("model returned empty text")

    candidates = [stripped]
    fence = _FENCE_RE.match(stripped)
    if fence:
        candidates.insert(0, fence.group(1).strip())
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            continue

    # Balanced-scan fallback: find the first brace-balanced JSON value.
    for open_ch, close_ch in (("{", "}"), ("[", "]")):
        start = stripped.find(open_ch)
        while start != -1:
            depth = 0
            for i in range(start, len(stripped)):
                ch = stripped[i]
                if ch == open_ch:
                    depth += 1
                elif ch == close_ch:
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(stripped[start : i + 1])
                        except (json.JSONDecodeError, ValueError):
                            break
            start = stripped.find(open_ch, start + 1)

    raise ValueError("no JSON value found in model output")


# ---------------------------------------------------------------------------
# Proposal drafts and validation
# ---------------------------------------------------------------------------


def clamp_confidence(value: Any) -> Optional[float]:
    """Normalize a model-supplied confidence into NUMERIC(5,4) range 0..1."""
    if value is None:
        return None
    try:
        score = float(value)
    except (TypeError, ValueError):
        return None
    if score != score:  # NaN
        return None
    return max(0.0, min(1.0, score))


@dataclass
class ProposalDraft:
    """A validated candidate proposal produced by a model, pre-persistence."""

    proposal_type: str
    proposed_text: str
    title: Optional[str] = None
    structured: Dict[str, Any] = field(default_factory=dict)
    confidence: Optional[float] = None
    evidence_quote: Optional[str] = None

    def fingerprint_source_text(self) -> str:
        return _normalize_text(self.proposed_text)


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip().lower()


def parse_proposal(raw: Mapping[str, Any], allowed_types: Optional[Set[str]] = None) -> ProposalDraft:
    """Validate one model-emitted proposal object into a `ProposalDraft`.

    Raises `ValueError` for unusable payloads so the pipeline can skip a bad
    item without discarding its siblings.
    """
    if not isinstance(raw, Mapping):
        raise ValueError("proposal entry is not an object")

    proposal_type = str(raw.get("proposal_type") or "").strip().lower()
    if proposal_type not in VALID_PROPOSAL_TYPES:
        raise ValueError(f"unknown proposal_type: {proposal_type!r}")
    if allowed_types is not None and proposal_type not in allowed_types:
        raise ValueError(f"proposal_type {proposal_type!r} not requested in this run")

    proposed_text = str(raw.get("proposed_text") or "").strip()
    if not proposed_text:
        raise ValueError("proposal is missing proposed_text")

    structured = raw.get("structured") if isinstance(raw.get("structured"), Mapping) else {}
    # Convenience: lift common scalar fields into structured json.
    lifted: Dict[str, Any] = dict(structured)
    for key in ("date_text", "date_start", "date_end", "date_precision", "actors"):
        if key in raw and key not in lifted and raw[key] not in (None, "", [], {}):
            lifted[key] = raw[key]

    title = raw.get("title")
    title = str(title).strip() if title not in (None, "") else None

    quote = raw.get("evidence_quote")
    quote = str(quote).strip() if quote not in (None, "") else None

    return ProposalDraft(
        proposal_type=proposal_type,
        proposed_text=proposed_text,
        title=title,
        structured=lifted,
        confidence=clamp_confidence(raw.get("confidence")),
        evidence_quote=quote,
    )


def proposal_fingerprint(source_id: Optional[str], proposal_type: str, text: str) -> str:
    """Stable near-duplicate key (Technical Spec §16 duplicate detection)."""
    basis = json.dumps(
        {"source_id": source_id or "", "type": proposal_type, "text": _normalize_text(text)},
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def parse_proposals_payload(payload: Any, allowed_types: Optional[Set[str]] = None) -> Tuple[Sequence[ProposalDraft], Sequence[str]]:
    """Parse a full model payload into drafts; returns (drafts, skip_reasons)."""
    if isinstance(payload, Mapping):
        items = payload.get("proposals")
    else:
        items = payload
    if items is None:
        items = []
    if not isinstance(items, Sequence) or isinstance(items, (str, bytes)):
        raise ValueError("model output must contain a `proposals` array")
    drafts = []
    reasons = []
    for item in items:
        try:
            drafts.append(parse_proposal(item, allowed_types))
        except ValueError as exc:
            reasons.append(str(exc))
    return drafts, reasons
