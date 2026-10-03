"""Versioned prompt templates for the AI pipeline (WS-AI-INTEL).

Implements the prompt-registry intent of Technical Spec §12.4: every prompt
carries a name, version, intended use, and output schema. Wave 3 stores them
in code; a later wave may move them under `packages/prompts/` without
changing the `PromptTemplate` surface.

Guardrail baked into every extraction prompt: output is a *candidate* for
human review — models are instructed to never invent content beyond the
supplied excerpt (PRD §10.12 guardrails; Technical Spec §17.1).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Mapping

from .schemas import ProposalType


@dataclass(frozen=True)
class PromptTemplate:
    name: str
    version: str
    purpose: str
    system: str
    user_template: str
    output_schema: Dict[str, Any] = field(default_factory=dict)
    allowed_source_classes: tuple = ("excerpt",)

    def render_user(self, **kwargs: Any) -> str:
        return self.user_template.format(**kwargs)


# ---------------------------------------------------------------------------
# Shared output schemas
# ---------------------------------------------------------------------------

PROPOSAL_ITEM_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["proposal_type", "proposed_text"],
    "properties": {
        "proposal_type": {"type": "string", "enum": sorted(t.value for t in ProposalType)},
        "title": {"type": ["string", "null"], "description": "Short label (<= 255 chars)"},
        "proposed_text": {"type": "string", "description": "One complete, self-contained statement"},
        "structured": {"type": "object", "description": "Dates/actors/other structured fields"},
        "confidence": {"type": ["number", "null"], "minimum": 0, "maximum": 1},
        "evidence_quote": {"type": ["string", "null"], "description": "Verbatim quote from the excerpt"},
        "date_text": {"type": ["string", "null"]},
        "actors": {"type": "array", "items": {"type": "string"}},
    },
}

PROPOSALS_OUTPUT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["proposals"],
    "properties": {
        "proposals": {"type": "array", "items": PROPOSAL_ITEM_SCHEMA},
    },
}

EVENT_PROPOSALS_OUTPUT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["proposals"],
    "properties": {
        "proposals": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["proposal_type", "proposed_text", "title"],
                "properties": {
                    **PROPOSAL_ITEM_SCHEMA["properties"],
                    "proposal_type": {"const": "event"},
                    "date_text": {"type": ["string", "null"], "description": "Raw date expression as written"},
                    "structured": {
                        "type": "object",
                        "properties": {
                            "date_start": {"type": ["string", "null"], "description": "ISO date"},
                            "date_end": {"type": ["string", "null"], "description": "ISO date"},
                            "date_precision": {
                                "type": ["string", "null"],
                                "enum": ["exact", "range", "approximate", "unknown", None],
                            },
                        },
                    },
                },
            },
        },
    },
}


_EXTRACTION_SYSTEM_BASE = (
    "You are an evidence-extraction engine inside a legal matter workspace. "
    "You receive one excerpt of a source document and emit candidate "
    "proposals for human review. Rules: (1) Only use information present in "
    "the excerpt — never invent, infer beyond it, or import outside "
    "knowledge. (2) Every proposal must quote its supporting evidence "
    "verbatim in `evidence_quote`. (3) Output is always a candidate: it "
    "enters a review queue and a human decides; phrase proposals neutrally. "
    "(4) Return an empty `proposals` array when the excerpt contains "
    "nothing qualifying. (5) Respond with JSON only."
)


FACT_PROPOSAL_PROMPT = PromptTemplate(
    name="fact_proposal",
    version="1.0.0",
    purpose="Extract candidate fact assertions from one source excerpt",
    system=_EXTRACTION_SYSTEM_BASE,
    user_template=(
        "Matter context: {matter_context}\n"
        "Source: {source_title} (chunk {chunk_index})\n\n"
        "EXCERPT:\n\"\"\"\n{excerpt_text}\n\"\"\"\n\n"
        "Extract every distinct, legally relevant FACT stated in this "
        "excerpt. Each fact must be one atomic, self-contained statement "
        "with `proposal_type` = \"fact\". Prefer concrete statements "
        "(who did/said/received what, when, where). Do not restate law, "
        "argument, or boilerplate."
    ),
    output_schema=PROPOSALS_OUTPUT_SCHEMA,
)


EVENT_PROPOSAL_PROMPT = PromptTemplate(
    name="event_proposal",
    version="1.0.0",
    purpose="Extract candidate chronology events from one source excerpt",
    system=_EXTRACTION_SYSTEM_BASE,
    user_template=(
        "Matter context: {matter_context}\n"
        "Source: {source_title} (chunk {chunk_index})\n\n"
        "EXCERPT:\n\"\"\"\n{excerpt_text}\n\"\"\"\n\n"
        "Extract every distinct EVENT suitable for a chronology from this "
        "excerpt. Each event must have `proposal_type` = \"event\", a short "
        "`title`, and date fields: put the raw date expression in "
        "`date_text` and normalized ISO dates plus `date_precision` "
        "(exact|range|approximate|unknown) under `structured`. If no date "
        "is stated, use `date_precision` = \"unknown\" and null dates."
    ),
    output_schema=EVENT_PROPOSALS_OUTPUT_SCHEMA,
)


GENERIC_PROPOSAL_PROMPT = PromptTemplate(
    name="generic_proposal",
    version="1.0.0",
    purpose="Extract other proposal kinds (actors, contradictions, verification tasks)",
    system=_EXTRACTION_SYSTEM_BASE,
    user_template=(
        "Matter context: {matter_context}\n"
        "Source: {source_title} (chunk {chunk_index})\n\n"
        "EXCERPT:\n\"\"\"\n{excerpt_text}\n\"\"\"\n\n"
        "Extract candidate proposals limited to these proposal_type values: "
        "{allowed_types_csv}. Use `structured` for any type-specific fields."
    ),
    output_schema=PROPOSALS_OUTPUT_SCHEMA,
)


# ---------------------------------------------------------------------------
# Agent personas (Technical Spec §13.1) — used by agent_run_step_job
# ---------------------------------------------------------------------------

_PERSONA_SYSTEM_BASE = (
    "You are one reviewer in a multi-agent legal analysis run. Your output "
    "is advisory only: it may suggest, warn, or question, but it never "
    "alters the approved factual record. Be concrete, cite the provided "
    "context, and flag uncertainty explicitly."
)


@dataclass(frozen=True)
class AgentPersona:
    name: str
    display_name: str
    description: str
    prompt_ref: str
    system_prompt: str
    default_provider_name: str | None = None
    default_model_name: str | None = None


AGENT_PERSONAS: Dict[str, AgentPersona] = {
    "plaintiff_strategist": AgentPersona(
        name="plaintiff_strategist",
        display_name="Plaintiff Strategist",
        description="Argues the strongest plaintiff-side theory from the reviewed record",
        prompt_ref="workers/ai/prompts.py::plaintiff_strategist@1.0.0",
        system_prompt=_PERSONA_SYSTEM_BASE + " Role: plaintiff strategist.",
    ),
    "defense_red_team": AgentPersona(
        name="defense_red_team",
        display_name="Defense Red Team",
        description="Attacks the case the way opposing counsel would",
        prompt_ref="workers/ai/prompts.py::defense_red_team@1.0.0",
        system_prompt=_PERSONA_SYSTEM_BASE + " Role: defense red team.",
    ),
    "neutral_evidence_auditor": AgentPersona(
        name="neutral_evidence_auditor",
        display_name="Neutral Evidence Auditor",
        description="Checks evidentiary support, authentication, and hearsay risk",
        prompt_ref="workers/ai/prompts.py::neutral_evidence_auditor@1.0.0",
        system_prompt=_PERSONA_SYSTEM_BASE + " Role: neutral evidence auditor.",
    ),
    "chronology_reviewer": AgentPersona(
        name="chronology_reviewer",
        display_name="Chronology Reviewer",
        description="Checks timeline consistency, gaps, and date conflicts",
        prompt_ref="workers/ai/prompts.py::chronology_reviewer@1.0.0",
        system_prompt=_PERSONA_SYSTEM_BASE + " Role: chronology reviewer.",
    ),
    "claim_gap_detector": AgentPersona(
        name="claim_gap_detector",
        display_name="Claim Gap Detector",
        description="Surfaces claim elements with weak or missing support",
        prompt_ref="workers/ai/prompts.py::claim_gap_detector@1.0.0",
        system_prompt=_PERSONA_SYSTEM_BASE + " Role: claim gap detector.",
    ),
    "procedural_risk_reviewer": AgentPersona(
        name="procedural_risk_reviewer",
        display_name="Procedural Risk Reviewer",
        description="Flags deadlines, preservation duties, and procedural exposure",
        prompt_ref="workers/ai/prompts.py::procedural_risk_reviewer@1.0.0",
        system_prompt=_PERSONA_SYSTEM_BASE + " Role: procedural risk reviewer.",
    ),
}


AGENT_RUN_USER_TEMPLATE = (
    "Question:\n{question}\n\n"
    "Scoped matter context (assembled per sharing policy — this is all you get):\n"
    "\"\"\"\n{context}\n\"\"\"\n\n"
    "Answer the question from the scoped context only. Structure your answer "
    "with short sections. If the context is insufficient, say exactly what is "
    "missing."
)


SYNTHESIS_PROMPT = PromptTemplate(
    name="agent_synthesis",
    version="1.0.0",
    purpose="Synthesize multi-agent run steps into one reviewable artifact",
    system=(
        "You synthesize the outputs of several independent reviewer agents "
        "into one neutral briefing. Report consensus, disagreements, and "
        "risks faithfully; do not add facts absent from the inputs. Respond "
        "with JSON only."
    ),
    user_template=(
        "Original question:\n{question}\n\n"
        "Agent outputs (JSON array):\n{steps_json}\n\n"
        "Produce the synthesis object."
    ),
    output_schema={
        "type": "object",
        "required": ["summary"],
        "properties": {
            "summary": {"type": "string"},
            "agreements": {"type": "array", "items": {"type": "string"}},
            "disagreements": {"type": "array", "items": {"type": "string"}},
            "risks": {"type": "array", "items": {"type": "string"}},
            "suggested_next_steps": {"type": "array", "items": {"type": "string"}},
        },
    },
)


def template_for_proposal_types(proposal_types: Mapping[str, Any] | set | tuple) -> Dict[str, PromptTemplate]:
    """Map requested proposal types to the prompt that emits them."""
    templates: Dict[str, PromptTemplate] = {}
    types = set(proposal_types)
    if "fact" in types:
        templates["fact"] = FACT_PROPOSAL_PROMPT
    if "event" in types:
        templates["event"] = EVENT_PROPOSAL_PROMPT
    generic = sorted(t for t in types if t not in ("fact", "event"))
    for extra in generic:
        templates[extra] = GENERIC_PROPOSAL_PROMPT
    return templates
