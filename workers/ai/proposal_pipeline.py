"""AI proposal pipeline (WS-AI-INTEL).

Turns source chunks/excerpts into review-queue `proposals` via a configured
LLM provider. Implements:

- sharing-policy enforcement before any external call (Spec §12.5)
- an input manifest recording exactly what was sent where (Spec §12.5)
- near-duplicate suppression via sha256 fingerprints (Spec §16.2)
- hard invariant: every AI-generated record is stored with
  `review_state = "proposed"` — enforced both here and at the store
  boundary (Technical Spec §17.1)

Persistence is behind the `ProposalStore` protocol so DB-backed
repositories (owned by other workstreams, Alembic migrations 004/009) can
be swapped in without touching pipeline code.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional, Protocol, Sequence, Set, Tuple

from .config import SharingPolicy
from .prompts import GENERIC_PROPOSAL_PROMPT, PromptTemplate, template_for_proposal_types
from .providers import LLMProvider, LLMRequest, PolicyViolation, StructuredOutputError
from .schemas import (
    AI_INITIAL_REVIEW_STATE,
    ProposalDraft,
    parse_proposals_payload,
    proposal_fingerprint,
)


@dataclass
class SourceChunk:
    """One slice of a source document fed into the pipeline.

    Produced by `workers.ai.streaming.chunk_source_text` or by the upload
    pipeline once page/excerpt tables exist (Migration 003).
    """

    source_id: str
    text: str
    index: int = 0
    workspace_id: Optional[str] = None
    matter_id: Optional[str] = None
    source_title: Optional[str] = None
    excerpt_ids: Tuple[str, ...] = ()
    page_start: Optional[int] = None
    page_end: Optional[int] = None


@dataclass
class StoredProposal:
    """A persisted proposal row (mirrors the `proposals` table contract)."""

    id: str
    workspace_id: Optional[str]
    matter_id: Optional[str]
    source_id: Optional[str]
    excerpt_id: Optional[str]
    proposal_type: str
    review_state: str
    title: Optional[str]
    proposed_text: str
    proposed_structured_json: Dict[str, Any]
    confidence_score: Optional[float]
    fingerprint: str
    provenance: Dict[str, Any]
    created_at: str

    def to_record(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "workspace_id": self.workspace_id,
            "matter_id": self.matter_id,
            "source_id": self.source_id,
            "excerpt_id": self.excerpt_id,
            "proposal_type": self.proposal_type,
            "review_state": self.review_state,
            "title": self.title,
            "proposed_text": self.proposed_text,
            "proposed_structured_json": self.proposed_structured_json,
            "confidence_score": self.confidence_score,
            "fingerprint": self.fingerprint,
            "provenance": self.provenance,
            "created_at": self.created_at,
        }


# ---------------------------------------------------------------------------
# Storage protocol + default in-memory implementation
# ---------------------------------------------------------------------------


class ProposalStore(Protocol):
    """Persistence seam for proposals.

    The DB-backed implementation (Postgres `proposals` table, Alembic
    Migration 004) is owned by the data workstream; it must preserve the
    invariant that AI-created rows start `review_state = 'proposed'`.
    """

    def insert_proposal(self, record: Mapping[str, Any]) -> str: ...

    def find_duplicate(self, fingerprint: str) -> Optional[str]: ...

    def list_proposals(
        self,
        *,
        matter_id: Optional[str] = None,
        source_id: Optional[str] = None,
        review_state: Optional[str] = None,
    ) -> Sequence[Mapping[str, Any]]: ...


class InMemoryProposalStore:
    """Reference store used for local runs, tests, and Wave 3 dev mode."""

    def __init__(self) -> None:
        self._rows: Dict[str, Dict[str, Any]] = {}
        self._by_fingerprint: Dict[str, str] = {}

    def insert_proposal(self, record: Mapping[str, Any]) -> str:
        row = dict(record)
        row_id = str(row.get("id") or uuid.uuid4())
        # WS-AI-INTEL invariant #1 — enforced at the storage boundary so no
        # caller (pipeline, job, or API) can mint an AI fact in any state
        # other than `proposed`.
        row["id"] = row_id
        row["review_state"] = AI_INITIAL_REVIEW_STATE
        row.setdefault("created_by_system", True)
        self._rows[row_id] = row
        fingerprint = row.get("fingerprint")
        if fingerprint:
            self._by_fingerprint.setdefault(fingerprint, row_id)
        return row_id

    def find_duplicate(self, fingerprint: str) -> Optional[str]:
        return self._by_fingerprint.get(fingerprint)

    def list_proposals(
        self,
        *,
        matter_id: Optional[str] = None,
        source_id: Optional[str] = None,
        review_state: Optional[str] = None,
    ) -> Sequence[Mapping[str, Any]]:
        rows = list(self._rows.values())
        if matter_id is not None:
            rows = [r for r in rows if r.get("matter_id") == matter_id]
        if source_id is not None:
            rows = [r for r in rows if r.get("source_id") == source_id]
        if review_state is not None:
            rows = [r for r in rows if r.get("review_state") == review_state]
        return rows


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


@dataclass
class ChunkExtractionResult:
    chunk_index: int
    created: List[StoredProposal] = field(default_factory=list)
    skipped_duplicates: int = 0
    skipped_invalid: List[str] = field(default_factory=list)
    manifest: Dict[str, Any] = field(default_factory=dict)


class ProposalPipeline:
    """Runs extraction prompts over chunks and stores proposed candidates."""

    def __init__(
        self,
        provider: LLMProvider,
        store: ProposalStore,
        *,
        sharing_policy: SharingPolicy = SharingPolicy.EXTERNAL_EXCERPTS_ONLY,
        proposal_types: Sequence[str] = ("fact", "event"),
        max_tokens: int = 2000,
        temperature: float = 0.1,
    ):
        if not proposal_types:
            raise ValueError("proposal_types must not be empty")
        self.provider = provider
        self.store = store
        self.sharing_policy = SharingPolicy(sharing_policy)
        self.proposal_types = tuple(proposal_types)
        self.max_tokens = max_tokens
        self.temperature = temperature

    # -- guardrails --------------------------------------------------------

    def _check_policy(self) -> None:
        if self.sharing_policy == SharingPolicy.NO_AI:
            raise PolicyViolation(
                "AI use is disabled for this scope (sharing policy: no_ai)",
                policy=self.sharing_policy,
                provider=self.provider.name,
            )
        if self.sharing_policy == SharingPolicy.LOCAL_ONLY and not self.provider.is_local:
            raise PolicyViolation(
                f"sharing policy local_only forbids external provider {self.provider.name!r}",
                policy=self.sharing_policy,
                provider=self.provider.name,
            )

    # -- extraction ----------------------------------------------------------

    def extract_from_chunk(
        self,
        chunk: SourceChunk,
        *,
        templates: Optional[Mapping[str, PromptTemplate]] = None,
    ) -> ChunkExtractionResult:
        """Extract all requested proposal types from one chunk.

        One provider call per prompt template. A template-level failure is
        recorded but does not abort sibling templates, so a flaky model
        degrades gracefully inside a streamed run.
        """
        self._check_policy()
        templates = templates or template_for_proposal_types(self.proposal_types)
        result = ChunkExtractionResult(chunk_index=chunk.index)

        # Group requested types by template to minimize calls.
        grouped: Dict[str, Set[str]] = {}
        for proposal_type in self.proposal_types:
            template = templates.get(proposal_type)
            if template is None:
                template = GENERIC_PROPOSAL_PROMPT
            grouped.setdefault(template.name, set()).add(proposal_type)

        for template_name, types in grouped.items():
            template = next(t for t in templates.values() if t.name == template_name)
            allowed = types
            try:
                drafts, item_skip_reasons, response = self._call_template(chunk, template, allowed)
            except (StructuredOutputError, ValueError) as exc:
                # Output-shape problems: record and degrade gracefully.
                result.skipped_invalid.append(f"{template_name}: {exc}")
                continue
            # ProviderError / transport failures intentionally propagate so
            # the streaming layer can surface them as chunk_error events.
            result.skipped_invalid.extend(
                f"{template_name}: {reason}" for reason in item_skip_reasons
            )

            manifest = self._build_manifest(chunk, template, response)
            if not result.manifest:
                result.manifest = manifest

            for draft in drafts:
                if draft.proposal_type not in allowed:
                    result.skipped_invalid.append(
                        f"dropped {draft.proposal_type!r}: not requested in this run"
                    )
                    continue
                stored, was_duplicate = self._store_draft(chunk, draft, manifest)
                if was_duplicate:
                    result.skipped_duplicates += 1
                else:
                    result.created.append(stored)

        # Record why individual items were skipped.
        return result

    def _call_template(
        self,
        chunk: SourceChunk,
        template: PromptTemplate,
        allowed_types: Set[str],
    ) -> Tuple[List[ProposalDraft], List[str], Any]:
        user_prompt = self._render_user_prompt(chunk, template, allowed_types)
        request = LLMRequest(
            system_prompt=template.system,
            user_prompt=user_prompt,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            share_manifest=self._build_manifest(chunk, template, None),
        )
        response = self.provider.generate_structured(request, template.output_schema)
        # allowed_types filtering happens in extract_from_chunk so drops are
        # counted; parse-level validation still applies here.
        drafts, reasons = parse_proposals_payload(response.structured, allowed_types=None)
        return list(drafts), list(reasons), response

    def _render_user_prompt(
        self, chunk: SourceChunk, template: PromptTemplate, allowed_types: Set[str]
    ) -> str:
        kwargs: Dict[str, Any] = {
            "matter_context": chunk.matter_id or "(matter not specified)",
            "source_title": chunk.source_title or chunk.source_id,
            "chunk_index": chunk.index,
            "excerpt_text": chunk.text,
        }
        if "{allowed_types_csv}" in template.user_template:
            kwargs["allowed_types_csv"] = ", ".join(sorted(allowed_types))
        return template.render_user(**kwargs)

    def _build_manifest(self, chunk: SourceChunk, template: PromptTemplate, response: Any) -> Dict[str, Any]:
        """What-was-shared manifest (Technical Spec §12.5)."""
        fallback_model = None
        provider_config = getattr(self.provider, "config", None)
        if provider_config is not None:
            fallback_model = getattr(provider_config, "default_model", None)
        manifest: Dict[str, Any] = {
            "provider": self.provider.name,
            "model": getattr(response, "model", None) or fallback_model,
            "prompt_name": template.name,
            "prompt_version": template.version,
            "sharing_policy": self.sharing_policy.value,
            "share_class": "excerpt_only"
            if self.sharing_policy != SharingPolicy.EXTERNAL_SELECTED_FULL_DOCS
            else "selected_full_document",
            "source_id": chunk.source_id,
            "chunk_index": chunk.index,
            "chars_sent": len(chunk.text),
            "excerpt_ids": list(chunk.excerpt_ids),
            "page_start": chunk.page_start,
            "page_end": chunk.page_end,
        }
        if response is not None and getattr(response, "usage", None):
            manifest["usage"] = response.usage
        return manifest

    def _store_draft(
        self, chunk: SourceChunk, draft: ProposalDraft, manifest: Mapping[str, Any]
    ) -> Tuple[StoredProposal, bool]:
        fingerprint = proposal_fingerprint(chunk.source_id, draft.proposal_type, draft.proposed_text)
        existing = self.store.find_duplicate(fingerprint)
        if existing:
            placeholder = StoredProposal(
                id=existing,
                workspace_id=chunk.workspace_id,
                matter_id=chunk.matter_id,
                source_id=chunk.source_id,
                excerpt_id=chunk.excerpt_ids[0] if chunk.excerpt_ids else None,
                proposal_type=draft.proposal_type,
                review_state=AI_INITIAL_REVIEW_STATE,
                title=draft.title,
                proposed_text=draft.proposed_text,
                proposed_structured_json=dict(draft.structured),
                confidence_score=draft.confidence,
                fingerprint=fingerprint,
                provenance=dict(manifest),
                created_at="",
            )
            return placeholder, True

        now = datetime.now(timezone.utc).isoformat()
        record: Dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "workspace_id": chunk.workspace_id,
            "matter_id": chunk.matter_id,
            "source_id": chunk.source_id,
            "excerpt_id": chunk.excerpt_ids[0] if chunk.excerpt_ids else None,
            "proposal_type": draft.proposal_type,
            # WS-AI-INTEL invariant #1 — AI output always enters review here.
            "review_state": AI_INITIAL_REVIEW_STATE,
            "title": draft.title,
            "proposed_text": draft.proposed_text,
            "proposed_structured_json": dict(draft.structured),
            "confidence_score": draft.confidence,
            "evidence_quote": draft.evidence_quote,
            "fingerprint": fingerprint,
            "provenance": dict(manifest),
            "created_by_system": True,
            "created_at": now,
            "updated_at": now,
        }
        row_id = self.store.insert_proposal(record)
        record["id"] = row_id
        stored = StoredProposal(
            id=row_id,
            workspace_id=chunk.workspace_id,
            matter_id=chunk.matter_id,
            source_id=chunk.source_id,
            excerpt_id=record["excerpt_id"],
            proposal_type=draft.proposal_type,
            review_state=AI_INITIAL_REVIEW_STATE,
            title=draft.title,
            proposed_text=draft.proposed_text,
            proposed_structured_json=record["proposed_structured_json"],
            confidence_score=draft.confidence,
            fingerprint=fingerprint,
            provenance=dict(manifest),
            created_at=now,
        )
        return stored, False
