"""AI service layer for the FastAPI backend (WS-AI-INTEL).

Business logic behind `app/routers/ai.py`. Wraps the worker-side AI stack
(`workers.ai` + `workers.pipeline.ai_jobs`) for HTTP callers:

- provider discovery/health from environment config (no secrets exposed)
- proposal extraction runs (streaming pipeline; all results `proposed`)
- multi-agent runs, step inspection, and step->proposal conversion

Storage flows through the store protocols from `workers.ai`; the default
in-process stores are shared with `ai_jobs` so inline runs and API calls
see the same review queue. DB-backed repositories plug in by constructing
`AIService` with Postgres-backed stores (integration seam, Wave 4+).
"""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional

from pydantic import BaseModel, Field

from workers.ai import (
    AI_INITIAL_REVIEW_STATE,
    InMemoryAgentRunStore,
    PolicyViolation,
    ProposalPipeline,
    ProviderError,
    ProviderRegistry,
    SharingPolicy,
    configured_providers,
    convert_step_to_proposal as convert_step_to_proposal_record,
    execute_agent_step,
    resolve_persona,
    select_provider,
    sharing_policy_from_env,
)
from workers.pipeline.ai_jobs import (
    get_agent_store,
    get_proposal_store,
    get_provider_registry,
)

# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class AIServiceError(RuntimeError):
    """Service-layer error with a stable machine-readable code."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


# ---------------------------------------------------------------------------
# API schemas
# ---------------------------------------------------------------------------


class ProviderInfo(BaseModel):
    provider_name: str
    display_name: str
    family: str
    is_local: bool
    enabled: bool = True
    default_model: str
    api_key_masked: str = ""


class ProviderHealth(BaseModel):
    provider_name: str
    healthy: bool
    detail: str = ""


class ProposalRunRequest(BaseModel):
    """Kick off a streamed extraction run over source text.

    Wave 3 seam: the source text travels inline. Once the source-storage
    service (Migration 003 repositories) exists, callers will pass only
    `source_id` and the service will hydrate pages/excerpts itself.
    """

    workspace_id: str
    source_id: str
    text: str
    matter_id: Optional[str] = None
    source_title: Optional[str] = None
    provider_name: Optional[str] = None
    sharing_policy: Optional[str] = None
    proposal_types: List[str] = Field(default_factory=lambda: ["fact", "event"])
    max_chunk_chars: int = 6000
    chunk_overlap: int = 400


class ProposalOut(BaseModel):
    id: str
    proposal_type: str
    review_state: str
    title: Optional[str] = None
    proposed_text: str
    proposed_structured_json: Dict[str, Any] = Field(default_factory=dict)
    confidence_score: Optional[float] = None
    source_id: Optional[str] = None
    matter_id: Optional[str] = None
    created_at: Optional[str] = None


class ProposalRunResponse(BaseModel):
    status: str
    provider: str
    sharing_policy: str
    chunks_processed: int
    created: int
    skipped_duplicates: int
    chunk_errors: List[Dict[str, Any]] = Field(default_factory=list)
    proposals: List[ProposalOut] = Field(default_factory=list)


class AgentRunRequest(BaseModel):
    workspace_id: str
    question_text: str
    matter_id: Optional[str] = None
    persona_names: List[str] = Field(default_factory=lambda: ["neutral_evidence_auditor"])
    provider_names: Optional[List[str]] = None
    context_text: str = ""
    sharing_policy: Optional[str] = None


class AgentStepOut(BaseModel):
    id: str
    persona_name: Optional[str] = None
    provider_name: Optional[str] = None
    model_name: Optional[str] = None
    error_text: Optional[str] = None
    output_text: Optional[str] = None
    input_manifest_json: Dict[str, Any] = Field(default_factory=dict)
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class AgentRunOut(BaseModel):
    id: str
    status: str
    question_text: str
    run_scope_policy: str
    matter_id: Optional[str] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None
    steps: List[AgentStepOut] = Field(default_factory=list)
    artifacts: List[Dict[str, Any]] = Field(default_factory=list)


class ConvertStepRequest(BaseModel):
    proposal_type: str = "verification_task"
    title: Optional[str] = None
    source_id: Optional[str] = None
    created_by_user_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class AIService:
    """Aggregates providers + stores behind one testable surface."""

    def __init__(
        self,
        registry: Optional[ProviderRegistry] = None,
        proposal_store: Optional[Any] = None,
        agent_store: Optional[InMemoryAgentRunStore] = None,
    ):
        # Defaults are the same process-level singletons `ai_jobs` uses, so
        # inline worker runs and API calls share one review queue.
        self.registry = registry if registry is not None else get_provider_registry()
        self.proposal_store = proposal_store if proposal_store is not None else get_proposal_store()
        self.agent_store = agent_store if agent_store is not None else get_agent_store()

    # -- providers -----------------------------------------------------------

    def list_providers(self) -> List[ProviderInfo]:
        configs = configured_providers()
        infos: List[ProviderInfo] = []
        for name, config in configs.items():
            infos.append(
                ProviderInfo(
                    provider_name=config.name,
                    display_name=config.display_name,
                    family=config.family,
                    is_local=config.is_local,
                    enabled=name in self.registry,
                    default_model=config.default_model,
                    api_key_masked=config.masked_key,
                )
            )
        return infos

    def provider_health(self) -> List[ProviderHealth]:
        results: List[ProviderHealth] = []
        for name, provider in self.registry.items():
            try:
                healthy = bool(provider.health_check())
                detail = "" if healthy else "health_check returned false"
            except Exception as exc:  # noqa: BLE001 - health probes must never raise
                healthy = False
                detail = str(exc)
            results.append(
                ProviderHealth(provider_name=name, healthy=healthy, detail=detail)
            )
        return results

    # -- proposal extraction ---------------------------------------------------

    def run_proposal_extraction(self, req: ProposalRunRequest) -> ProposalRunResponse:
        if not req.text.strip():
            raise AIServiceError("invalid_payload", "text must not be empty")
        if not req.proposal_types:
            raise AIServiceError("invalid_payload", "proposal_types must not be empty")

        policy = self._resolve_policy(req.sharing_policy)
        try:
            provider = select_provider(self.registry, policy, req.provider_name)
        except PolicyViolation as exc:
            raise AIServiceError("policy_violation", str(exc)) from exc
        except ProviderError as exc:
            raise AIServiceError("unknown_provider", str(exc)) from exc

        pipeline = ProposalPipeline(
            provider,
            self.proposal_store,
            sharing_policy=policy,
            proposal_types=tuple(req.proposal_types),
        )

        from workers.ai import chunk_source_text, stream_proposals

        chunks = chunk_source_text(
            req.text,
            req.source_id,
            workspace_id=req.workspace_id,
            matter_id=req.matter_id,
            source_title=req.source_title,
            max_chars=req.max_chunk_chars,
            overlap=req.chunk_overlap,
        )

        proposals: List[ProposalOut] = []
        chunk_errors: List[Dict[str, Any]] = []
        chunks_processed = 0
        skipped_duplicates = 0
        for event in stream_proposals(pipeline, chunks):
            if event.kind == "chunk_start":
                chunks_processed += 1
            elif event.kind == "proposals":
                skipped_duplicates += event.payload["skipped_duplicates"]
                for record in event.payload["created"]:
                    proposals.append(self._proposal_out(record))
            elif event.kind == "chunk_error":
                chunk_errors.append(event.payload)

        return ProposalRunResponse(
            status="completed_with_errors" if chunk_errors else "completed",
            provider=provider.name,
            sharing_policy=policy.value,
            chunks_processed=chunks_processed,
            created=len(proposals),
            skipped_duplicates=skipped_duplicates,
            chunk_errors=chunk_errors,
            proposals=proposals,
        )

    def list_proposals(
        self,
        *,
        matter_id: Optional[str] = None,
        source_id: Optional[str] = None,
        review_state: Optional[str] = None,
    ) -> List[ProposalOut]:
        rows = self.proposal_store.list_proposals(
            matter_id=matter_id, source_id=source_id, review_state=review_state
        )
        return [self._proposal_out(row) for row in rows]

    @staticmethod
    def _proposal_out(record: Mapping[str, Any]) -> ProposalOut:
        return ProposalOut(
            id=str(record.get("id")),
            proposal_type=str(record.get("proposal_type", "")),
            # Invariant #1 — the store guarantees `proposed` on creation; we
            # pass it through verbatim rather than trusting callers.
            review_state=str(record.get("review_state", AI_INITIAL_REVIEW_STATE)),
            title=record.get("title"),
            proposed_text=str(record.get("proposed_text", "")),
            proposed_structured_json=dict(record.get("proposed_structured_json") or {}),
            confidence_score=record.get("confidence_score"),
            source_id=record.get("source_id"),
            matter_id=record.get("matter_id"),
            created_at=record.get("created_at"),
        )

    # -- agent runs ---------------------------------------------------------------

    def create_agent_run(self, req: AgentRunRequest) -> AgentRunOut:
        if not req.question_text.strip():
            raise AIServiceError("invalid_payload", "question_text must not be empty")
        if not req.persona_names:
            raise AIServiceError("invalid_payload", "persona_names must not be empty")

        policy = self._resolve_policy(req.sharing_policy)

        try:
            personas = [resolve_persona(name) for name in req.persona_names]
        except KeyError as exc:
            raise AIServiceError("invalid_payload", str(exc)) from exc

        provider_names = req.provider_names or [None]
        resolved_providers = []
        for name in provider_names:
            try:
                resolved_providers.append(select_provider(self.registry, policy, name))
            except PolicyViolation as exc:
                raise AIServiceError("policy_violation", str(exc)) from exc
            except ProviderError as exc:
                raise AIServiceError("unknown_provider", str(exc)) from exc

        run = self.agent_store.create_run(
            workspace_id=req.workspace_id,
            matter_id=req.matter_id,
            question_text=req.question_text,
            run_scope_policy=policy.value,
        )
        self.agent_store.update_run(run["id"], status="running")

        # Wave 3 runs steps inline; queue wiring lands with the platform
        # workstream (see ai_jobs.agent_run_step_job for the queued path).
        for persona in personas:
            for provider in resolved_providers:
                execute_agent_step(
                    self.agent_store,
                    run["id"],
                    persona,
                    provider,
                    context_text=req.context_text,
                )

        steps = self.agent_store.list_steps(run["id"])
        final_status = "completed" if any(s.get("output_text") for s in steps) else "failed"
        self.agent_store.update_run(run["id"], status=final_status)
        return self.get_agent_run(run["id"])

    def get_agent_run(self, run_id: str) -> AgentRunOut:
        run = self.agent_store.get_run(run_id)
        if run is None:
            raise AIServiceError("not_found", f"unknown agent_run: {run_id}")
        return AgentRunOut(
            id=str(run["id"]),
            status=str(run.get("status", "")),
            question_text=str(run.get("question_text", "")),
            run_scope_policy=str(run.get("run_scope_policy", "")),
            matter_id=run.get("matter_id"),
            created_at=run.get("created_at"),
            completed_at=run.get("completed_at"),
            steps=[
                AgentStepOut(
                    id=str(step["id"]),
                    persona_name=step.get("persona_name"),
                    provider_name=step.get("provider_name"),
                    model_name=step.get("model_name"),
                    error_text=step.get("error_text"),
                    output_text=step.get("output_text"),
                    input_manifest_json=dict(step.get("input_manifest_json") or {}),
                    started_at=step.get("started_at"),
                    completed_at=step.get("completed_at"),
                )
                for step in self.agent_store.list_steps(run_id)
            ],
            artifacts=[dict(a) for a in self.agent_store.list_artifacts(run_id)],
        )

    def convert_step_to_proposal(
        self, run_id: str, step_id: str, req: ConvertStepRequest
    ) -> ProposalOut:
        run = self.agent_store.get_run(run_id)
        if run is None:
            raise AIServiceError("not_found", f"unknown agent_run: {run_id}")
        step = next(
            (s for s in self.agent_store.list_steps(run_id) if s["id"] == step_id),
            None,
        )
        if step is None:
            raise AIServiceError("not_found", f"unknown agent_run_step: {step_id}")
        try:
            record = convert_step_to_proposal_record(
                step,
                self.proposal_store,
                workspace_id=run.get("workspace_id"),
                matter_id=run.get("matter_id"),
                source_id=req.source_id,
                created_by_user_id=req.created_by_user_id,
                proposal_type=req.proposal_type,
                title=req.title,
            )
        except ValueError as exc:
            raise AIServiceError("invalid_payload", str(exc)) from exc
        return self._proposal_out(record)

    # -- shared helpers ------------------------------------------------------------

    @staticmethod
    def _resolve_policy(raw: Optional[str]) -> SharingPolicy:
        if raw:
            try:
                return SharingPolicy(str(raw).lower())
            except ValueError:
                raise AIServiceError("invalid_payload", f"unknown sharing_policy: {raw!r}") from None
        return sharing_policy_from_env()


# ---------------------------------------------------------------------------
# Module-level singleton (router dependency)
# ---------------------------------------------------------------------------

_SERVICE: Optional[AIService] = None


def get_service() -> AIService:
    global _SERVICE
    if _SERVICE is None:
        _SERVICE = AIService()
    return _SERVICE


def set_service(service: Optional[AIService]) -> None:
    """Override hook for tests and for swapping in DB-backed stores."""
    global _SERVICE
    _SERVICE = service
