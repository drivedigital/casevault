"""WS-AI-INTEL — AI proposal pipeline, streaming intake, and agent runs.

Public surface for the worker layer. See:
- `config`     — env loading + provider resolution (.env.local aware)
- `providers`  — provider-agnostic LLM adapters (Technical Spec §12)
- `prompts`    — versioned prompt templates (Technical Spec §12.4)
- `schemas`    — proposal/review-state data contracts (Spec §5.8/§5.9)
- `proposal_pipeline` — chunk -> proposed-proposal extraction
- `streaming`  — streaming intake over chunk iterators
- `agent_runs` — multi-agent run execution (Technical Spec §13)

Hard invariant: all AI-generated facts start `review_state = "proposed"`.
"""

from .agent_runs import (
    InMemoryAgentRunStore,
    convert_step_to_proposal,
    execute_agent_step,
    resolve_persona,
    synthesize_run,
)
from .config import (
    ProviderConfig,
    SharingPolicy,
    configured_providers,
    default_provider_name,
    mask_secret,
    merged_environ,
    sharing_policy_from_env,
)
from .prompts import AGENT_PERSONAS, AgentPersona, PromptTemplate
from .proposal_pipeline import (
    ChunkExtractionResult,
    InMemoryProposalStore,
    ProposalPipeline,
    SourceChunk,
    StoredProposal,
)
from .providers import (
    AnthropicProvider,
    HttpJsonTransport,
    LLMProvider,
    LLMRequest,
    LLMResponse,
    OllamaProvider,
    OpenAICompatibleProvider,
    PolicyViolation,
    ProviderError,
    ProviderRegistry,
    StructuredOutputError,
    build_registry,
    select_provider,
)
from .schemas import (
    AI_INITIAL_REVIEW_STATE,
    ProposalDraft,
    ProposalType,
    ReviewState,
    clamp_confidence,
    extract_json,
    parse_proposal,
    proposal_fingerprint,
)
from .streaming import StreamEvent, chunk_source_text, run_stream_to_completion, stream_proposals

__all__ = [
    "AGENT_PERSONAS",
    "AI_INITIAL_REVIEW_STATE",
    "AgentPersona",
    "AnthropicProvider",
    "ChunkExtractionResult",
    "HttpJsonTransport",
    "InMemoryAgentRunStore",
    "InMemoryProposalStore",
    "LLMProvider",
    "LLMRequest",
    "LLMResponse",
    "OllamaProvider",
    "OpenAICompatibleProvider",
    "PolicyViolation",
    "PromptTemplate",
    "ProposalDraft",
    "ProposalPipeline",
    "ProposalType",
    "ProviderConfig",
    "ProviderError",
    "ProviderRegistry",
    "ReviewState",
    "SharingPolicy",
    "SourceChunk",
    "StoredProposal",
    "StreamEvent",
    "StructuredOutputError",
    "build_registry",
    "chunk_source_text",
    "clamp_confidence",
    "configured_providers",
    "convert_step_to_proposal",
    "default_provider_name",
    "execute_agent_step",
    "extract_json",
    "mask_secret",
    "merged_environ",
    "parse_proposal",
    "proposal_fingerprint",
    "resolve_persona",
    "run_stream_to_completion",
    "select_provider",
    "sharing_policy_from_env",
    "stream_proposals",
    "synthesize_run",
]
