"""Multi-agent run execution (WS-AI-INTEL).

Implements the run model from Technical Spec §13.2: one user question =>
one `agent_run` => many `agent_run_steps` + zero or more
`agent_run_artifacts`, mirroring the Migration-009 tables (Database Schema
Draft §6.12) without an ORM dependency.

Safety rules enforced here (PRD §10.12 guardrails):
- agent output never mutates the trusted record; conversion into a
  proposal always lands in `review_state = "proposed"` (invariant #1);
- every step records an input manifest of what context was shared.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional, Sequence

from .prompts import AGENT_PERSONAS, AGENT_RUN_USER_TEMPLATE, SYNTHESIS_PROMPT, AgentPersona
from .proposal_pipeline import ProposalStore
from .providers import LLMProvider, LLMRequest
from .schemas import AI_INITIAL_REVIEW_STATE


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class InMemoryAgentRunStore:
    """Reference store for agent runs/steps/artifacts.

    The Postgres-backed implementation (Alembic Migration 009) is owned by
    the data workstream; it must keep the same dict-of-records surface.
    """

    def __init__(self) -> None:
        self._runs: Dict[str, Dict[str, Any]] = {}
        self._steps: Dict[str, List[Dict[str, Any]]] = {}
        self._artifacts: Dict[str, List[Dict[str, Any]]] = {}

    # -- runs ---------------------------------------------------------------

    def create_run(
        self,
        *,
        workspace_id: str,
        matter_id: Optional[str],
        question_text: str,
        run_scope_policy: str,
        created_by_user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        run_id = str(uuid.uuid4())
        run = {
            "id": run_id,
            "workspace_id": workspace_id,
            "matter_id": matter_id,
            "question_text": question_text,
            "run_scope_policy": run_scope_policy,
            "status": "queued",
            "created_by_user_id": created_by_user_id,
            "created_at": _utcnow(),
            "completed_at": None,
        }
        self._runs[run_id] = run
        self._steps[run_id] = []
        self._artifacts[run_id] = []
        return run

    def get_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        return self._runs.get(run_id)

    def update_run(self, run_id: str, **fields: Any) -> Dict[str, Any]:
        run = self._runs.get(run_id)
        if run is None:
            raise KeyError(f"unknown agent_run: {run_id}")
        run.update(fields)
        return run

    def list_runs(self) -> Sequence[Mapping[str, Any]]:
        return list(self._runs.values())

    # -- steps ----------------------------------------------------------------

    def add_step(self, run_id: str, step: Mapping[str, Any]) -> str:
        if run_id not in self._runs:
            raise KeyError(f"unknown agent_run: {run_id}")
        row = dict(step)
        row_id = str(row.get("id") or uuid.uuid4())
        row["id"] = row_id
        row["agent_run_id"] = run_id
        self._steps[run_id].append(row)
        return row_id

    def update_step(self, run_id: str, step_id: str, **fields: Any) -> Dict[str, Any]:
        for step in self._steps.get(run_id, []):
            if step["id"] == step_id:
                step.update(fields)
                return step
        raise KeyError(f"unknown agent_run_step: {step_id}")

    def list_steps(self, run_id: str) -> Sequence[Mapping[str, Any]]:
        return list(self._steps.get(run_id, []))

    # -- artifacts ---------------------------------------------------------------

    def add_artifact(self, run_id: str, artifact: Mapping[str, Any]) -> str:
        if run_id not in self._runs:
            raise KeyError(f"unknown agent_run: {run_id}")
        row = dict(artifact)
        row_id = str(row.get("id") or uuid.uuid4())
        row["id"] = row_id
        row["agent_run_id"] = run_id
        self._artifacts[run_id].append(row)
        return row_id

    def list_artifacts(self, run_id: str) -> Sequence[Mapping[str, Any]]:
        return list(self._artifacts.get(run_id, []))


# ---------------------------------------------------------------------------
# Step execution
# ---------------------------------------------------------------------------


def resolve_persona(name: str) -> AgentPersona:
    try:
        return AGENT_PERSONAS[name.lower()]
    except KeyError:
        raise KeyError(f"unknown agent persona: {name!r}") from None


def execute_agent_step(
    run_store: InMemoryAgentRunStore,
    run_id: str,
    persona: AgentPersona,
    provider: LLMProvider,
    *,
    context_text: str = "",
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """Execute one persona x provider step and persist its record.

    Failures are stored on the step (error_text) rather than raised, so one
    provider outage does not block sibling steps of the same run.
    """
    run = run_store.get_run(run_id)
    if run is None:
        raise KeyError(f"unknown agent_run: {run_id}")

    input_manifest = {
        "provider": provider.name,
        "model": model or getattr(getattr(provider, "config", None), "default_model", None),
        "persona": persona.name,
        "prompt_ref": persona.prompt_ref,
        "sharing_policy": run.get("run_scope_policy"),
        "chars_sent": len(context_text),
        "question_chars": len(run.get("question_text", "")),
    }
    step_id = run_store.add_step(
        run_id,
        {
            "persona_name": persona.name,
            "provider_name": provider.name,
            "model_name": input_manifest["model"],
            "prompt_version": persona.prompt_ref,
            "input_manifest_json": input_manifest,
            "output_text": None,
            "output_structured_json": {},
            "error_text": None,
            "started_at": _utcnow(),
            "completed_at": None,
        },
    )

    user_prompt = AGENT_RUN_USER_TEMPLATE.format(
        question=run.get("question_text", ""),
        context=context_text or "(no scoped context provided)",
    )
    try:
        response = provider.generate_text(
            LLMRequest(
                system_prompt=persona.system_prompt,
                user_prompt=user_prompt,
                model=model or persona.default_model_name,
                share_manifest=dict(input_manifest),
            )
        )
    except Exception as exc:  # noqa: BLE001 - stored on the step, not raised
        return run_store.update_step(
            run_id,
            step_id,
            error_text=str(exc),
            completed_at=_utcnow(),
        )

    return run_store.update_step(
        run_id,
        step_id,
        output_text=response.text,
        output_structured_json={"usage": response.usage},
        error_text=None,
        completed_at=_utcnow(),
    )


def convert_step_to_proposal(
    step: Mapping[str, Any],
    proposal_store: ProposalStore,
    *,
    workspace_id: Optional[str] = None,
    matter_id: Optional[str] = None,
    source_id: Optional[str] = None,
    created_by_user_id: Optional[str] = None,
    proposal_type: str = "verification_task",
    title: Optional[str] = None,
) -> Dict[str, Any]:
    """Convert an agent step output into a review-queue proposal.

    Per Technical Spec §13.3 the conversion may create a *proposal* only —
    the store boundary pins review_state to `proposed` (invariant #1).
    """
    output_text = (step.get("output_text") or "").strip()
    if not output_text:
        raise ValueError("agent step has no output text to convert")

    structured = dict(step.get("output_structured_json") or {})
    structured.setdefault("agent_run_step_id", step.get("id"))
    structured.setdefault("persona", step.get("persona_name"))
    structured.setdefault("provider", step.get("provider_name"))

    now = _utcnow()
    record: Dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "workspace_id": workspace_id,
        "matter_id": matter_id,
        "source_id": source_id,
        "excerpt_id": None,
        "proposal_type": proposal_type,
        "review_state": AI_INITIAL_REVIEW_STATE,
        "title": title or f"Agent insight ({step.get('persona_name', 'agent')})",
        "proposed_text": output_text,
        "proposed_structured_json": structured,
        "confidence_score": None,
        "fingerprint": None,
        "provenance": {
            "origin": "agent_run_step",
            "agent_run_id": step.get("agent_run_id"),
            "agent_run_step_id": step.get("id"),
            "provider": step.get("provider_name"),
            "input_manifest": step.get("input_manifest_json"),
        },
        "created_by_system": True,
        "created_by_user_id": created_by_user_id,
        "created_at": now,
        "updated_at": now,
    }
    record["id"] = proposal_store.insert_proposal(record)
    return record


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------


def synthesize_run(
    run_store: InMemoryAgentRunStore,
    run_id: str,
    provider: LLMProvider,
) -> Dict[str, Any]:
    """Produce a synthesis artifact from all completed steps of a run."""
    run = run_store.get_run(run_id)
    if run is None:
        raise KeyError(f"unknown agent_run: {run_id}")
    steps = [
        {
            "persona": s.get("persona_name"),
            "provider": s.get("provider_name"),
            "output_text": s.get("output_text"),
            "error_text": s.get("error_text"),
        }
        for s in run_store.list_steps(run_id)
    ]
    if not steps:
        raise ValueError(f"agent_run {run_id} has no steps to synthesize")

    request = LLMRequest(
        system_prompt=SYNTHESIS_PROMPT.system,
        user_prompt=SYNTHESIS_PROMPT.render_user(
            question=run.get("question_text", ""),
            steps_json=_json_dumps(steps),
        ),
        share_manifest={
            "provider": provider.name,
            "prompt_name": SYNTHESIS_PROMPT.name,
            "prompt_version": SYNTHESIS_PROMPT.version,
            "step_count": len(steps),
        },
    )
    response = provider.generate_structured(request, SYNTHESIS_PROMPT.output_schema)

    artifact_id = run_store.add_artifact(
        run_id,
        {
            "artifact_type": "synthesis",
            "content_text": response.text,
            "content_json": response.structured if isinstance(response.structured, dict) else {},
            "created_by": "system",
            "created_by_user_id": None,
            "created_at": _utcnow(),
            "provenance": {
                "provider": provider.name,
                "model": response.model,
                "prompt_version": SYNTHESIS_PROMPT.version,
            },
        },
    )
    return {
        "id": artifact_id,
        "agent_run_id": run_id,
        "artifact_type": "synthesis",
        "content": response.structured,
        "text": response.text,
    }


def _json_dumps(value: Any) -> str:
    import json

    return json.dumps(value, ensure_ascii=False, indent=2)
