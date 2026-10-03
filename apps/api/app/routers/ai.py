"""HTTP surface for the AI workstream (WS-AI-INTEL).

Mounted under `/api/v1/ai` (Tech Spec §9.2 `/api/v1` namespace; WS-VERIFY
Run-2 findings F1/F2, decision D1a). The API scaffold includes this router
in `app/main.py` via:

    from app.routers import ai
    app.include_router(ai.router, prefix="/api/v1")

Endpoints:
- GET  /api/v1/ai/providers                          configured providers (secrets masked)
- GET  /api/v1/ai/providers/health                   provider health probes
- POST /api/v1/ai/proposals/runs                     streamed extraction run (202)
- GET  /api/v1/ai/proposals                          review-queue listing
- POST /api/v1/ai/agent-runs                         create + run a multi-agent run (201)
- GET  /api/v1/ai/agent-runs/{run_id}                run with steps + artifacts
- POST /api/v1/ai/agent-runs/{run_id}/steps/{step_id}/proposals
                                                     convert agent output -> proposal (201)

Invariant #1 holds end-to-end: every proposal these endpoints create carries
`review_state = "proposed"`; there is no API path to mint a trusted fact.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.services.ai_service import (
    AgentRunOut,
    AgentRunRequest,
    AIService,
    AIServiceError,
    ConvertStepRequest,
    ProposalOut,
    ProposalRunRequest,
    ProposalRunResponse,
    ProviderHealth,
    ProviderInfo,
    get_service,
)

# Prefix-less router: mounted with `/api/v1` in app/main.py alongside the
# claims/matters routers (matches the Tech Spec §9.2 `/api/v1` namespace).
router = APIRouter(prefix="/ai", tags=["ai"])

_STATUS_CODES = {
    "policy_violation": 409,
    "unknown_provider": 404,
    "provider_unavailable": 503,
    "not_found": 404,
    "invalid_payload": 400,
}


def _http_error(exc: AIServiceError) -> HTTPException:
    return HTTPException(
        status_code=_STATUS_CODES.get(exc.code, 500),
        detail={"code": exc.code, "message": exc.message},
    )


@router.get("/providers", response_model=List[ProviderInfo])
def list_providers(service: AIService = Depends(get_service)) -> List[ProviderInfo]:
    """Providers resolved from environment config. Secrets are masked."""
    return service.list_providers()


@router.get("/providers/health", response_model=List[ProviderHealth])
def provider_health(service: AIService = Depends(get_service)) -> List[ProviderHealth]:
    return service.provider_health()


@router.post("/proposals/runs", response_model=ProposalRunResponse, status_code=202)
def run_proposals(
    request: ProposalRunRequest, service: AIService = Depends(get_service)
) -> ProposalRunResponse:
    """Run the streamed proposal pipeline over a source.

    All returned proposals are `review_state = "proposed"` — they enter the
    review inbox; nothing here touches the trusted factual record.
    """
    try:
        return service.run_proposal_extraction(request)
    except AIServiceError as exc:
        raise _http_error(exc) from exc


@router.get("/proposals", response_model=List[ProposalOut])
def list_proposals(
    matter_id: Optional[str] = Query(default=None),
    source_id: Optional[str] = Query(default=None),
    review_state: Optional[str] = Query(default=None),
    service: AIService = Depends(get_service),
) -> List[ProposalOut]:
    return service.list_proposals(
        matter_id=matter_id, source_id=source_id, review_state=review_state
    )


@router.post("/agent-runs", response_model=AgentRunOut, status_code=201)
def create_agent_run(
    request: AgentRunRequest, service: AIService = Depends(get_service)
) -> AgentRunOut:
    """Create a multi-agent run and execute its persona x provider steps."""
    try:
        return service.create_agent_run(request)
    except AIServiceError as exc:
        raise _http_error(exc) from exc


@router.get("/agent-runs/{run_id}", response_model=AgentRunOut)
def get_agent_run(run_id: str, service: AIService = Depends(get_service)) -> AgentRunOut:
    try:
        return service.get_agent_run(run_id)
    except AIServiceError as exc:
        raise _http_error(exc) from exc


@router.post(
    "/agent-runs/{run_id}/steps/{step_id}/proposals",
    response_model=ProposalOut,
    status_code=201,
)
def convert_step_to_proposal(
    run_id: str,
    step_id: str,
    request: ConvertStepRequest,
    service: AIService = Depends(get_service),
) -> ProposalOut:
    """Convert one agent step's output into a review-queue proposal.

    The proposal is created `review_state = "proposed"`; accepting it into
    the trusted record is the review workflow's job (Spec §17).
    """
    try:
        return service.convert_step_to_proposal(run_id, step_id, request)
    except AIServiceError as exc:
        raise _http_error(exc) from exc
