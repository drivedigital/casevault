"""AI job entrypoints for the worker queue (WS-AI-INTEL).

Implements the AI-related job types from Technical Spec §10.2:

- `fact_proposal_job`        (analysis queue)
- `event_proposal_job`       (analysis queue)
- `agent_run_step_job`       (ai queue)
- `agent_synthesis_job`      (ai queue)

Jobs are plain `payload: dict -> result: dict` functions, so they are
runnable inline (local dev, tests) and registrable as-is with RQ/Arq when
the queue infrastructure workstream lands — `JOB_REGISTRY` is the dispatch
seam. No DB dependency: persistence flows through the store protocols in
`workers.ai`, which other workstreams back with Postgres repositories.

Payload contract (all jobs):
    workspace_id, matter_id, source_id, ...  — identifiers as strings
    text                                     — raw source text (Wave 3 seam;
                                               later waves pass excerpt/page
                                               ids resolved by the pipeline)
    provider_name                            — optional provider override
    sharing_policy                           — optional policy override

Invariant #1: every proposal these jobs create lands `review_state=proposed`.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence

from workers.ai import (
    InMemoryAgentRunStore,
    InMemoryProposalStore,
    PolicyViolation,
    ProposalPipeline,
    ProviderError,
    ProviderRegistry,
    SharingPolicy,
    build_registry,
    chunk_source_text,
    configured_providers,
    convert_step_to_proposal,
    execute_agent_step,
    resolve_persona,
    select_provider,
    sharing_policy_from_env,
    stream_proposals,
    synthesize_run,
)

# ---------------------------------------------------------------------------
# Process-level defaults (swappable seams for DB-backed stores)
# ---------------------------------------------------------------------------

_DEFAULT_REGISTRY: Optional[ProviderRegistry] = None
_DEFAULT_PROPOSAL_STORE: Optional[InMemoryProposalStore] = None
_DEFAULT_AGENT_STORE: Optional[InMemoryAgentRunStore] = None


def get_provider_registry(refresh: bool = False) -> ProviderRegistry:
    """Registry built from the current environment (`.env.local` aware)."""
    global _DEFAULT_REGISTRY
    if _DEFAULT_REGISTRY is None or refresh:
        _DEFAULT_REGISTRY = build_registry(configured_providers())
    return _DEFAULT_REGISTRY


def get_proposal_store() -> InMemoryProposalStore:
    """In-process reference store.

    Integration seam: swap for the Postgres-backed repository once the data
    workstream's Migration 004 repository lands.
    """
    global _DEFAULT_PROPOSAL_STORE
    if _DEFAULT_PROPOSAL_STORE is None:
        _DEFAULT_PROPOSAL_STORE = InMemoryProposalStore()
    return _DEFAULT_PROPOSAL_STORE


def get_agent_store() -> InMemoryAgentRunStore:
    global _DEFAULT_AGENT_STORE
    if _DEFAULT_AGENT_STORE is None:
        _DEFAULT_AGENT_STORE = InMemoryAgentRunStore()
    return _DEFAULT_AGENT_STORE


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require(payload: Mapping[str, Any], *keys: str) -> None:
    missing = [k for k in keys if not payload.get(k)]
    if missing:
        raise ValueError(f"payload missing required field(s): {', '.join(missing)}")


def _resolve_policy(payload: Mapping[str, Any]) -> SharingPolicy:
    raw = payload.get("sharing_policy")
    if raw:
        try:
            return SharingPolicy(str(raw).lower())
        except ValueError:
            raise ValueError(f"unknown sharing_policy: {raw!r}") from None
    return sharing_policy_from_env()


def _iter_chunks(payload: Mapping[str, Any]) -> Sequence[Any]:
    """Payload-provided chunks win; otherwise chunk the raw text."""
    chunks = payload.get("chunks")
    if chunks:
        return list(chunks)
    return list(
        chunk_source_text(
            payload.get("text") or "",
            source_id=payload["source_id"],
            workspace_id=payload.get("workspace_id"),
            matter_id=payload.get("matter_id"),
            source_title=payload.get("source_title"),
            max_chars=int(payload.get("max_chunk_chars") or 6000),
            overlap=int(payload.get("chunk_overlap") or 400),
        )
    )


def _proposal_job(
    job_name: str,
    proposal_types: Sequence[str],
    payload: Mapping[str, Any],
    *,
    providers: Optional[ProviderRegistry] = None,
    store: Optional[Any] = None,
) -> Dict[str, Any]:
    _require(payload, "workspace_id", "source_id", "text")
    registry = providers if providers is not None else get_provider_registry()
    proposal_store = store if store is not None else get_proposal_store()
    policy = _resolve_policy(payload)
    provider = select_provider(registry, policy, payload.get("provider_name"))

    pipeline = ProposalPipeline(
        provider,
        proposal_store,
        sharing_policy=policy,
        proposal_types=proposal_types,
    )
    chunks = _iter_chunks(payload)
    if not chunks:
        raise ValueError("payload contains no extractable text")

    events = stream_proposals(pipeline, chunks)
    created_ids: List[str] = []
    chunk_error_events: List[Dict[str, Any]] = []
    skipped_duplicates = 0
    manifest: Dict[str, Any] = {}
    for event in events:
        if event.kind == "proposals":
            created_ids.extend(p["id"] for p in event.payload["created"])
            skipped_duplicates += event.payload["skipped_duplicates"]
            if not manifest and event.payload["manifest"]:
                manifest = event.payload["manifest"]
        elif event.kind == "chunk_error":
            chunk_error_events.append(event.payload)

    return {
        "job": job_name,
        "status": "completed_with_errors" if chunk_error_events else "completed",
        "provider": provider.name,
        "proposal_types": list(proposal_types),
        "sharing_policy": policy.value,
        "chunks_processed": len(chunks),
        "created": len(created_ids),
        "proposal_ids": created_ids,
        "skipped_duplicates": skipped_duplicates,
        "chunk_errors": chunk_error_events,
        "manifest": manifest,
        # WS-AI-INTEL invariant #1: everything created above is `proposed`.
        "review_state": "proposed",
    }


# ---------------------------------------------------------------------------
# Jobs (Technical Spec §10.2)
# ---------------------------------------------------------------------------


def fact_proposal_job(
    payload: Mapping[str, Any],
    *,
    providers: Optional[ProviderRegistry] = None,
    store: Optional[Any] = None,
) -> Dict[str, Any]:
    """Extract candidate fact assertions from a source (Spec §3.2 step 7)."""
    return _proposal_job("fact_proposal_job", ("fact",), payload, providers=providers, store=store)


def event_proposal_job(
    payload: Mapping[str, Any],
    *,
    providers: Optional[ProviderRegistry] = None,
    store: Optional[Any] = None,
) -> Dict[str, Any]:
    """Extract candidate chronology events from a source (Spec §3.2 step 8)."""
    return _proposal_job("event_proposal_job", ("event",), payload, providers=providers, store=store)


def agent_run_step_job(
    payload: Mapping[str, Any],
    *,
    providers: Optional[ProviderRegistry] = None,
    run_store: Optional[InMemoryAgentRunStore] = None,
) -> Dict[str, Any]:
    """Execute one persona x provider step of an agent run (Spec §13.2).

    If `agent_run_id` is absent, a run is created from the payload first so
    the job also works as a one-shot entrypoint.
    """
    _require(payload, "workspace_id", "question_text", "persona_name")
    registry = providers if providers is not None else get_provider_registry()
    store = run_store if run_store is not None else get_agent_store()
    policy = _resolve_policy(payload)
    provider = select_provider(registry, policy, payload.get("provider_name"))
    persona = resolve_persona(str(payload["persona_name"]))

    run_id = payload.get("agent_run_id")
    if not run_id:
        run = store.create_run(
            workspace_id=str(payload["workspace_id"]),
            matter_id=payload.get("matter_id"),
            question_text=str(payload["question_text"]),
            run_scope_policy=policy.value,
            created_by_user_id=payload.get("created_by_user_id"),
        )
        run_id = run["id"]
    store.update_run(run_id, status="running")

    step = execute_agent_step(
        store,
        run_id,
        persona,
        provider,
        context_text=str(payload.get("context_text") or ""),
        model=payload.get("model_name"),
    )
    status = "error" if step.get("error_text") else "completed"
    if status == "error":
        store.update_run(run_id, status="failed")
    return {
        "job": "agent_run_step_job",
        "status": status,
        "agent_run_id": run_id,
        "agent_run_step_id": step["id"],
        "provider": provider.name,
        "persona": persona.name,
        "error_text": step.get("error_text"),
    }


def agent_synthesis_job(
    payload: Mapping[str, Any],
    *,
    providers: Optional[ProviderRegistry] = None,
    run_store: Optional[InMemoryAgentRunStore] = None,
) -> Dict[str, Any]:
    """Synthesize all steps of an agent run into one artifact (Spec §13.2)."""
    _require(payload, "agent_run_id")
    registry = providers if providers is not None else get_provider_registry()
    store = run_store if run_store is not None else get_agent_store()
    run = store.get_run(str(payload["agent_run_id"]))
    if run is None:
        raise ValueError(f"unknown agent_run_id: {payload['agent_run_id']!r}")

    policy = SharingPolicy(run.get("run_scope_policy") or _resolve_policy(payload).value)
    provider = select_provider(registry, policy, payload.get("provider_name"))
    artifact = synthesize_run(store, run["id"], provider)
    store.update_run(run["id"], status="completed")
    return {
        "job": "agent_synthesis_job",
        "status": "completed",
        "agent_run_id": run["id"],
        "artifact_id": artifact["id"],
        "provider": provider.name,
    }


def convert_agent_step_job(
    payload: Mapping[str, Any],
    *,
    run_store: Optional[InMemoryAgentRunStore] = None,
    proposal_store: Optional[Any] = None,
) -> Dict[str, Any]:
    """Convert an agent step's output into a review-queue proposal.

    Always lands `review_state = "proposed"` (invariant #1).
    """
    _require(payload, "agent_run_id", "agent_run_step_id")
    agent_store = run_store if run_store is not None else get_agent_store()
    store = proposal_store if proposal_store is not None else get_proposal_store()
    run = agent_store.get_run(str(payload["agent_run_id"]))
    if run is None:
        raise ValueError(f"unknown agent_run_id: {payload['agent_run_id']!r}")
    step = next(
        (s for s in agent_store.list_steps(run["id"]) if s["id"] == payload["agent_run_step_id"]),
        None,
    )
    if step is None:
        raise ValueError(f"unknown agent_run_step_id: {payload['agent_run_step_id']!r}")

    record = convert_step_to_proposal(
        step,
        store,
        workspace_id=run.get("workspace_id"),
        matter_id=run.get("matter_id"),
        source_id=payload.get("source_id"),
        created_by_user_id=payload.get("created_by_user_id"),
        proposal_type=str(payload.get("proposal_type") or "verification_task"),
        title=payload.get("title"),
    )
    return {
        "job": "convert_agent_step_job",
        "status": "completed",
        "proposal_id": record["id"],
        "review_state": record["review_state"],
    }


#: Dispatch table for queue workers (RQ/Arq wiring belongs to the platform
#: workstream; names match Technical Spec §10.2 where defined).
JOB_REGISTRY: Dict[str, Callable[[Mapping[str, Any]], Dict[str, Any]]] = {
    "fact_proposal_job": fact_proposal_job,
    "event_proposal_job": event_proposal_job,
    "agent_run_step_job": agent_run_step_job,
    "agent_synthesis_job": agent_synthesis_job,
    "convert_agent_step_job": convert_agent_step_job,
}


def run_job(name: str, payload: Mapping[str, Any]) -> Dict[str, Any]:
    """Inline dispatcher used by local dev and tests.

    Queue integration seam: when Redis/RQ (or Arq) infrastructure lands,
    enqueue `run_job` by name instead of calling it directly.
    """
    try:
        job = JOB_REGISTRY[name]
    except KeyError:
        raise ValueError(f"unknown AI job: {name!r}") from None
    try:
        return job(payload)
    except PolicyViolation as exc:
        return {
            "job": name,
            "status": "rejected",
            "error_code": "policy_violation",
            "error": str(exc),
            "policy": exc.policy.value,
        }
    except (ProviderError, ValueError, KeyError) as exc:
        return {"job": name, "status": "failed", "error_code": type(exc).__name__, "error": str(exc)}
