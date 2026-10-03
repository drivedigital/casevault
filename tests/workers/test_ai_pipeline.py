"""WS-AI-INTEL — AI proposal pipeline & streaming intake tests.

Covers:
- invariant #1: every AI-generated proposal starts `review_state=proposed`
- provider env resolution (NVIDIA / Ollama / OpenAI / Anthropic)
- adapter envelope mapping (OpenAI-compatible, Anthropic, Ollama)
- sharing-policy guardrails (no_ai / local_only)
- chunking, streaming intake, and error containment
- job entrypoints (fact/event proposals, agent steps, synthesis)
- HTTP surface (routers/ai.py) via FastAPI TestClient

All providers/transports are fakes — no network, no credentials.
"""
from __future__ import annotations

import json

import pytest

from workers.ai import (
    AI_INITIAL_REVIEW_STATE,
    AnthropicProvider,
    InMemoryAgentRunStore,
    InMemoryProposalStore,
    LLMResponse,
    OllamaProvider,
    OpenAICompatibleProvider,
    PolicyViolation,
    ProposalPipeline,
    ProviderConfig,
    ProviderError,
    ProviderRegistry,
    SharingPolicy,
    SourceChunk,
    chunk_source_text,
    configured_providers,
    extract_json,
    mask_secret,
    merged_environ,
    parse_proposal,
    clamp_confidence,
    select_provider,
    stream_proposals,
)
from workers.ai.config import parse_env_text
from workers.pipeline import ai_jobs

# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


def make_config(
    name="fakeprov",
    family="openai_compatible",
    base_url="https://fake.test/v1",
    api_key="sk-test-1234",
    default_model="fake-model",
    is_local=False,
):
    return ProviderConfig(
        name=name,
        display_name=name.title(),
        family=family,
        base_url=base_url,
        api_key=api_key,
        default_model=default_model,
        is_local=is_local,
        key_var="FAKE_KEY",
    )


class FakeLLMProvider:
    """Scripted stand-in for any LLM adapter."""

    def __init__(self, name="fake", is_local=False):
        self.name = name
        self.is_local = is_local
        self.structured_responses: list = []
        self.text_responses: list = []
        self.requests: list = []

    def generate_structured(self, request, schema):
        self.requests.append(("structured", request, dict(schema)))
        item = self.structured_responses.pop(0) if self.structured_responses else {"proposals": []}
        if isinstance(item, Exception):
            raise item
        return LLMResponse(
            provider=self.name,
            model="fake-model",
            text=json.dumps(item),
            structured=item,
            usage={"prompt_tokens": 10, "completion_tokens": 5},
        )

    def generate_text(self, request):
        self.requests.append(("text", request, None))
        item = self.text_responses.pop(0) if self.text_responses else "fake analysis"
        if isinstance(item, Exception):
            raise item
        return LLMResponse(provider=self.name, model="fake-model", text=item)

    def health_check(self):
        return True


class FakeTransport:
    def __init__(self, response=None, status=200):
        self.calls = []
        self.response = response if response is not None else {}
        self.status = status

    def post_json(self, url, body, headers=None, timeout=None):
        self.calls.append({"method": "POST", "url": url, "body": body, "headers": dict(headers or {})})
        return self.status, self.response

    def get_json(self, url, headers=None, timeout=None):
        self.calls.append({"method": "GET", "url": url, "headers": dict(headers or {})})
        return self.status, self.response


def fact_item(text="The landlord changed the 2F door locks on June 3, 2025.", **extra):
    item = {
        "proposal_type": "fact",
        "title": "2F door lock change",
        "proposed_text": text,
        "confidence": 0.9,
        "evidence_quote": "changed the 2F door locks",
    }
    item.update(extra)
    return item


def event_item(**extra):
    item = {
        "proposal_type": "event",
        "title": "Door exclusion",
        "proposed_text": "Tenant was excluded from the 2F apartment.",
        "date_text": "June 3, 2025",
        "structured": {
            "date_start": "2025-06-03",
            "date_end": None,
            "date_precision": "exact",
        },
    }
    item.update(extra)
    return item


def make_chunk(text="The landlord changed the 2F door locks on June 3, 2025.", index=0):
    return SourceChunk(
        source_id="src-1",
        text=text,
        index=index,
        workspace_id="ws-1",
        matter_id="matter-1",
        source_title="Access Memo",
    )


def make_pipeline(provider, store, *, policy=SharingPolicy.EXTERNAL_EXCERPTS_ONLY, types=("fact",)):
    return ProposalPipeline(provider, store, sharing_policy=policy, proposal_types=types)


@pytest.fixture(autouse=True)
def _isolate_ai_jobs_singletons(monkeypatch):
    """Never let process-level singletons leak between tests."""
    monkeypatch.setattr(ai_jobs, "_DEFAULT_REGISTRY", None, raising=False)
    monkeypatch.setattr(ai_jobs, "_DEFAULT_PROPOSAL_STORE", None, raising=False)
    monkeypatch.setattr(ai_jobs, "_DEFAULT_AGENT_STORE", None, raising=False)


# ---------------------------------------------------------------------------
# schemas: JSON extraction, validation, confidence
# ---------------------------------------------------------------------------


class TestJsonExtraction:
    def test_plain_json(self):
        assert extract_json('{"proposals": []}') == {"proposals": []}

    def test_fenced_json(self):
        text = "Here you go:\n```json\n{\"proposals\": []}\n```\nDone."
        # fence regex matches a fully-fenced string; with prose around it the
        # balanced-scan fallback must still recover the object.
        assert extract_json(text) == {"proposals": []}

    def test_pure_fence(self):
        text = "```json\n{\"a\": 1}\n```"
        assert extract_json(text) == {"a": 1}

    def test_embedded_json(self):
        text = 'Sure! The result is {"proposals": [{"proposal_type": "fact"}]} as requested.'
        assert extract_json(text)["proposals"][0]["proposal_type"] == "fact"

    def test_no_json_raises(self):
        with pytest.raises(ValueError):
            extract_json("I cannot comply.")

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            extract_json("   ")


class TestProposalValidation:
    def test_parse_and_lift_dates(self):
        raw = {
            "proposal_type": "event",
            "title": "Hearing",
            "proposed_text": "A hearing was held.",
            "date_text": "Jan 2, 2025",
            "confidence": 2.5,
        }
        draft = parse_proposal(raw)
        assert draft.proposal_type == "event"
        assert draft.structured["date_text"] == "Jan 2, 2025"
        assert draft.confidence == 1.0  # clamped into NUMERIC(5,4) range

    def test_unknown_type_rejected(self):
        with pytest.raises(ValueError):
            parse_proposal({"proposal_type": "miracle", "proposed_text": "x"})

    def test_missing_text_rejected(self):
        with pytest.raises(ValueError):
            parse_proposal({"proposal_type": "fact"})

    def test_confidence_clamping(self):
        assert clamp_confidence(None) is None
        assert clamp_confidence("not-a-number") is None
        assert clamp_confidence(float("nan")) is None
        assert clamp_confidence(-3) == 0.0
        assert clamp_confidence(3) == 1.0
        assert clamp_confidence(0.42) == 0.42


# ---------------------------------------------------------------------------
# config: env resolution for NVIDIA / Ollama / OpenAI / Anthropic
# ---------------------------------------------------------------------------


class TestEnvConfig:
    BASE_ENV = {
        "OPENAI_API_KEY": "sk-openai",
        "ANTHROPIC_API_KEY": "sk-ant",
        "NVIDIA_API_KEY": "nv-key",
        "OLLAMA_BASE_URL": "http://localhost:11434",
    }

    def test_brief_providers_resolved(self):
        configs = configured_providers(self.BASE_ENV)
        assert set(configs) == {"openai", "anthropic", "nvidia", "ollama"}
        assert configs["nvidia"].base_url == "https://integrate.api.nvidia.com/v1"
        assert configs["ollama"].is_local is True
        assert configs["openai"].is_local is False

    def test_no_credentials_no_providers(self):
        assert configured_providers({}) == {}

    def test_override_base_and_model(self):
        env = {
            **self.BASE_ENV,
            "OLLAMA_BASE_URL": "https://ollama-cloud.example.com",
            "OLLAMA_MODEL": "mistral-large",
            "NVIDIA_MODEL": "nvidia/nemotron-4-340b-instruct",
        }
        configs = configured_providers(env)
        assert configs["ollama"].base_url == "https://ollama-cloud.example.com"
        assert configs["ollama"].default_model == "mistral-large"
        assert configs["nvidia"].default_model == "nvidia/nemotron-4-340b-instruct"

    def test_disabled_providers(self):
        env = {**self.BASE_ENV, "AI_DISABLED_PROVIDERS": "ollama, openai"}
        assert set(configured_providers(env)) == {"anthropic", "nvidia"}

    def test_explicit_disable_flag(self):
        env = {**self.BASE_ENV, "OPENAI_ENABLED": "0"}
        assert "openai" not in configured_providers(env)

    def test_env_file_parse_and_merge(self, tmp_path, monkeypatch):
        env_file = tmp_path / ".env.local"
        env_file.write_text(
            "# comment\n"
            "NVIDIA_API_KEY=nv-from-file\n"
            'OPENAI_MODEL="gpt-4o"\n'
            "export OLLAMA_BASE_URL=http://localhost:11434\n"
            "\n"
        )
        monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
        monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)
        monkeypatch.setenv("OPENAI_API_KEY", "sk-from-process")
        merged = merged_environ(env_file)
        # file values land; process env wins on conflict
        assert merged["NVIDIA_API_KEY"] == "nv-from-file"
        assert merged["OPENAI_API_KEY"] == "sk-from-process"
        assert merged["OPENAI_MODEL"] == "gpt-4o"
        configs = configured_providers(merged)
        assert {"nvidia", "openai", "ollama"} <= set(configs)

    def test_parse_env_text_quotes_and_exports(self):
        values = parse_env_text("export A=1\nB=\"two words\"\nC='x'\n# nope\nD=plain # trailing")
        assert values == {"A": "1", "B": "two words", "C": "x", "D": "plain"}

    def test_mask_secret(self):
        assert mask_secret(None) == ""
        assert mask_secret("abc") == "****"
        assert mask_secret("sk-abcdef123") == "****f123"


# ---------------------------------------------------------------------------
# providers: adapter envelope mapping
# ---------------------------------------------------------------------------


class TestOpenAICompatibleAdapter:
    def _provider(self, transport):
        return OpenAICompatibleProvider(make_config(), transport)

    def test_text_envelope(self):
        transport = FakeTransport(
            response={
                "model": "fake-model",
                "choices": [{"message": {"role": "assistant", "content": "hello"}}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
            }
        )
        from workers.ai import LLMRequest

        provider = self._provider(transport)
        response = provider.generate_text(
            LLMRequest(system_prompt="sys", user_prompt="hi", model="custom-model")
        )
        call = transport.calls[0]
        assert call["url"] == "https://fake.test/v1/chat/completions"
        assert call["headers"]["Authorization"] == "Bearer sk-test-1234"
        assert call["body"]["model"] == "custom-model"
        assert call["body"]["messages"][0] == {"role": "system", "content": "sys"}
        assert call["body"]["messages"][1] == {"role": "user", "content": "hi"}
        assert response.text == "hello"
        assert response.usage["total_tokens"] == 5

    def test_structured_sets_json_mode_and_parses(self):
        transport = FakeTransport(
            response={
                "choices": [{"message": {"content": '```json\n{"proposals": []}\n```'}}]
            }
        )
        from workers.ai import LLMRequest

        provider = self._provider(transport)
        response = provider.generate_structured(
            LLMRequest(system_prompt="sys", user_prompt="extract"), {"type": "object"}
        )
        assert transport.calls[0]["body"]["response_format"] == {"type": "json_object"}
        assert response.structured == {"proposals": []}

    def test_bad_json_raises_structured_error(self):
        transport = FakeTransport(response={"choices": [{"message": {"content": "nope"}}]})
        from workers.ai import LLMRequest, StructuredOutputError

        provider = self._provider(transport)
        with pytest.raises(StructuredOutputError):
            provider.generate_structured(
                LLMRequest(system_prompt="sys", user_prompt="extract"), {"type": "object"}
            )


class TestAnthropicAdapter:
    def test_envelope(self):
        transport = FakeTransport(
            response={
                "model": "claude-fake",
                "content": [{"type": "text", "text": "answer"}],
                "usage": {"input_tokens": 4, "output_tokens": 1},
            }
        )
        provider = AnthropicProvider(
            make_config(name="anthropic", family="anthropic", base_url="https://api.anthropic.com"),
            transport,
        )
        from workers.ai import LLMRequest

        response = provider.generate_text(LLMRequest(system_prompt="sys", user_prompt="hi"))
        call = transport.calls[0]
        assert call["url"] == "https://api.anthropic.com/v1/messages"
        assert call["headers"]["x-api-key"] == "sk-test-1234"
        assert call["headers"]["anthropic-version"]
        assert call["body"]["system"] == "sys"
        assert call["body"]["messages"] == [{"role": "user", "content": "hi"}]
        assert response.text == "answer"
        assert response.usage["input_tokens"] == 4


class TestOllamaAdapter:
    def test_envelope(self):
        transport = FakeTransport(
            response={"model": "llama3.1", "message": {"role": "assistant", "content": "local says hi"}}
        )
        provider = OllamaProvider(
            make_config(
                name="ollama",
                family="ollama",
                base_url="http://localhost:11434",
                api_key=None,
                is_local=True,
            ),
            transport,
        )
        from workers.ai import LLMRequest

        response = provider.generate_text(LLMRequest(system_prompt="sys", user_prompt="hi"))
        call = transport.calls[0]
        assert call["url"] == "http://localhost:11434/api/chat"
        assert call["body"]["stream"] is False
        assert "Authorization" not in call["headers"]
        assert response.text == "local says hi"
        assert provider.is_local


# ---------------------------------------------------------------------------
# provider selection under sharing policy
# ---------------------------------------------------------------------------


class TestProviderSelection:
    def registry(self):
        external = FakeLLMProvider(name="openai", is_local=False)
        local = FakeLLMProvider(name="ollama", is_local=True)
        return ProviderRegistry({"openai": external, "ollama": local}), external, local

    def test_no_ai_always_rejected(self):
        registry, _, _ = self.registry()
        with pytest.raises(PolicyViolation):
            select_provider(registry, SharingPolicy.NO_AI)

    def test_local_only_skips_external(self):
        registry, _, local = self.registry()
        assert select_provider(registry, SharingPolicy.LOCAL_ONLY) is local

    def test_local_only_rejects_named_external(self):
        registry, _, _ = self.registry()
        with pytest.raises(PolicyViolation):
            select_provider(registry, SharingPolicy.LOCAL_ONLY, "openai")

    def test_named_unknown_provider(self):
        registry, _, _ = self.registry()
        with pytest.raises(ProviderError):
            select_provider(registry, SharingPolicy.EXTERNAL_EXCERPTS_ONLY, "bogus")

    def test_default_prefers_first_registered(self):
        registry, external, _ = self.registry()
        assert (
            select_provider(registry, SharingPolicy.EXTERNAL_EXCERPTS_ONLY) is external
        )


# ---------------------------------------------------------------------------
# pipeline: invariant #1, dedupe, manifests, policy
# ---------------------------------------------------------------------------


class TestProposalPipeline:
    def test_proposals_always_start_proposed(self):
        provider = FakeLLMProvider()
        provider.structured_responses.append({"proposals": [fact_item()]})
        store = InMemoryProposalStore()
        pipeline = make_pipeline(provider, store)

        result = pipeline.extract_from_chunk(make_chunk())

        assert len(result.created) == 1
        record = store.list_proposals()[0]
        assert record["review_state"] == "proposed"
        assert record["review_state"] == AI_INITIAL_REVIEW_STATE
        assert record["proposal_type"] == "fact"
        assert record["source_id"] == "src-1"
        assert record["created_by_system"] is True

    def test_store_boundary_forces_proposed_even_if_caller_cheats(self):
        store = InMemoryProposalStore()
        row_id = store.insert_proposal(
            {
                "proposal_type": "fact",
                "proposed_text": "sneaky",
                "review_state": "accepted",  # invariant #1 must survive this
            }
        )
        row = next(r for r in store.list_proposals() if r["id"] == row_id)
        assert row["review_state"] == "proposed"

    def test_provenance_manifest_recorded(self):
        provider = FakeLLMProvider()
        provider.structured_responses.append({"proposals": [fact_item()]})
        store = InMemoryProposalStore()
        pipeline = make_pipeline(provider, store)

        pipeline.extract_from_chunk(make_chunk())

        record = store.list_proposals()[0]
        manifest = record["provenance"]
        assert manifest["provider"] == "fake"
        assert manifest["prompt_name"] == "fact_proposal"
        assert manifest["sharing_policy"] == "external_excerpts_only"
        assert manifest["share_class"] == "excerpt_only"
        assert manifest["chars_sent"] > 0

    def test_duplicate_suppression(self):
        provider = FakeLLMProvider()
        provider.structured_responses.append({"proposals": [fact_item()]})
        provider.structured_responses.append({"proposals": [fact_item()]})
        store = InMemoryProposalStore()
        pipeline = make_pipeline(provider, store)

        first = pipeline.extract_from_chunk(make_chunk())
        second = pipeline.extract_from_chunk(make_chunk())

        assert len(first.created) == 1
        assert len(second.created) == 0
        assert second.skipped_duplicates == 1
        assert len(store.list_proposals()) == 1

    def test_near_duplicate_whitespace_insensitive(self):
        provider = FakeLLMProvider()
        provider.structured_responses.append({"proposals": [fact_item()]})
        provider.structured_responses.append(
            {"proposals": [fact_item(text="The landlord  changed the 2F door locks\non June 3, 2025. ")]}
        )
        store = InMemoryProposalStore()
        pipeline = make_pipeline(provider, store)
        pipeline.extract_from_chunk(make_chunk())
        second = pipeline.extract_from_chunk(make_chunk())
        assert second.skipped_duplicates == 1

    def test_invalid_items_skipped_but_siblings_kept(self):
        provider = FakeLLMProvider()
        provider.structured_responses.append(
            {
                "proposals": [
                    fact_item(),
                    {"proposal_type": "levitation"},  # invalid type
                    {"proposal_type": "fact"},  # missing text
                ]
            }
        )
        store = InMemoryProposalStore()
        pipeline = make_pipeline(provider, store)
        result = pipeline.extract_from_chunk(make_chunk())
        assert len(result.created) == 1
        assert len(result.skipped_invalid) == 2

    def test_no_ai_policy_blocks_extraction(self):
        provider = FakeLLMProvider()
        store = InMemoryProposalStore()
        pipeline = make_pipeline(provider, store, policy=SharingPolicy.NO_AI)
        with pytest.raises(PolicyViolation):
            pipeline.extract_from_chunk(make_chunk())
        assert store.list_proposals() == []

    def test_local_only_blocks_external_provider(self):
        provider = FakeLLMProvider(is_local=False)
        store = InMemoryProposalStore()
        pipeline = make_pipeline(provider, store, policy=SharingPolicy.LOCAL_ONLY)
        with pytest.raises(PolicyViolation):
            pipeline.extract_from_chunk(make_chunk())

    def test_local_only_allows_local_provider(self):
        provider = FakeLLMProvider(name="ollama", is_local=True)
        provider.structured_responses.append({"proposals": [fact_item()]})
        store = InMemoryProposalStore()
        pipeline = make_pipeline(provider, store, policy=SharingPolicy.LOCAL_ONLY)
        result = pipeline.extract_from_chunk(make_chunk())
        assert len(result.created) == 1

    def test_mixed_fact_and_event_types(self):
        provider = FakeLLMProvider()
        provider.structured_responses.append({"proposals": [fact_item()]})
        provider.structured_responses.append({"proposals": [event_item()]})
        store = InMemoryProposalStore()
        pipeline = make_pipeline(provider, store, types=("fact", "event"))
        result = pipeline.extract_from_chunk(make_chunk())
        types = sorted(p.proposal_type for p in result.created)
        assert types == ["event", "fact"]
        event_row = next(
            r for r in store.list_proposals() if r["proposal_type"] == "event"
        )
        assert event_row["proposed_structured_json"]["date_start"] == "2025-06-03"


# ---------------------------------------------------------------------------
# streaming intake
# ---------------------------------------------------------------------------


class TestStreamingIntake:
    def test_chunker_bounds_and_coverage(self):
        paragraphs = [f"Paragraph {i}. " + ("word " * 60).strip() + f" end-{i}." for i in range(20)]
        text = "\n\n".join(paragraphs)
        chunks = list(chunk_source_text(text, "src-9", max_chars=700, overlap=80))
        assert chunks, "chunker produced nothing"
        for chunk in chunks:
            assert len(chunk.text) <= 700
        joined = "\n".join(c.text for c in chunks)
        for i in range(20):
            assert f"end-{i}." in joined, f"paragraph {i} lost by chunker"
        assert [c.index for c in chunks] == list(range(len(chunks)))

    def test_chunker_handles_oversized_paragraph(self):
        text = "Sentence here. " * 1000  # one giant paragraph
        chunks = list(chunk_source_text(text, "src-big", max_chars=500, overlap=50))
        assert len(chunks) > 1
        for chunk in chunks:
            assert len(chunk.text) <= 500

    def test_chunker_empty_text(self):
        assert list(chunk_source_text("", "src-x")) == []
        assert list(chunk_source_text("   \n  \n", "src-x")) == []

    def test_stream_events_and_error_containment(self):
        provider = FakeLLMProvider()
        provider.structured_responses.append({"proposals": [fact_item()]})
        provider.structured_responses.append(ProviderError("boom", provider="fake", status=500))
        provider.structured_responses.append({"proposals": [fact_item(text="Another fact.")]})
        store = InMemoryProposalStore()
        pipeline = make_pipeline(provider, store)

        chunks = [make_chunk(index=0), make_chunk(text="middle", index=1), make_chunk(text="tail", index=2)]
        events = list(stream_proposals(pipeline, chunks))
        kinds = [e.kind for e in events]
        assert kinds == [
            "chunk_start", "proposals",
            "chunk_start", "chunk_error",
            "chunk_start", "proposals",
            "done",
        ]
        done = events[-1].payload
        assert done["created"] == 2
        assert len(done["chunk_errors"]) == 1
        assert done["chunk_errors"][0]["chunk_index"] == 1

    def test_stream_resume_skips_earlier_chunks(self):
        provider = FakeLLMProvider()
        provider.structured_responses.append({"proposals": [fact_item()]})
        store = InMemoryProposalStore()
        pipeline = make_pipeline(provider, store)
        chunks = [make_chunk(index=0), make_chunk(text="second", index=1)]
        events = [
            e for e in stream_proposals(pipeline, chunks, resume_from=1) if e.kind != "done"
        ]
        assert events[0].chunk_index == 1  # chunk 0 skipped
        assert len(provider.requests) == 1


# ---------------------------------------------------------------------------
# jobs
# ---------------------------------------------------------------------------


def _registry_with(provider):
    return ProviderRegistry({provider.name: provider})


class TestJobs:
    PAYLOAD = {
        "workspace_id": "ws-1",
        "matter_id": "matter-1",
        "source_id": "src-1",
        "text": "The landlord changed the 2F door locks on June 3, 2025.\n\nRent was paid through June.",
    }

    def test_fact_proposal_job_end_to_end(self):
        provider = FakeLLMProvider(name="openai")
        provider.structured_responses.append({"proposals": [fact_item(), fact_item(text="Rent was paid through June.")]})
        store = InMemoryProposalStore()

        result = ai_jobs.fact_proposal_job(
            self.PAYLOAD, providers=_registry_with(provider), store=store
        )

        assert result["status"] == "completed"
        assert result["provider"] == "openai"
        assert result["review_state"] == "proposed"
        assert result["created"] >= 1
        rows = store.list_proposals()
        assert rows and all(r["review_state"] == "proposed" for r in rows)
        assert all(r["proposal_type"] == "fact" for r in rows)

    def test_event_proposal_job(self):
        provider = FakeLLMProvider(name="openai")
        provider.structured_responses.append({"proposals": [event_item()]})
        store = InMemoryProposalStore()
        result = ai_jobs.event_proposal_job(
            self.PAYLOAD, providers=_registry_with(provider), store=store
        )
        assert result["created"] == 1
        row = store.list_proposals()[0]
        assert row["proposal_type"] == "event"
        assert row["review_state"] == "proposed"
        assert row["proposed_structured_json"]["date_precision"] == "exact"

    def test_job_missing_fields(self):
        with pytest.raises(ValueError):
            ai_jobs.fact_proposal_job({"workspace_id": "ws"}, providers=_registry_with(FakeLLMProvider()))

    def test_run_job_policy_rejection_is_reported(self):
        result = ai_jobs.run_job(
            "fact_proposal_job", {**self.PAYLOAD, "sharing_policy": "no_ai"}
        )
        assert result["status"] == "rejected"
        assert result["error_code"] == "policy_violation"

    def test_run_job_unknown_name(self):
        with pytest.raises(ValueError):
            ai_jobs.run_job("teleport_job", {})

    def test_agent_run_step_job(self):
        provider = FakeLLMProvider(name="openai")
        provider.text_responses.append("The record shows a strong exclusion claim.")
        run_store = InMemoryAgentRunStore()
        payload = {
            "workspace_id": "ws-1",
            "matter_id": "matter-1",
            "question_text": "How strong is the wrongful exclusion claim?",
            "persona_name": "defense_red_team",
            "context_text": "Fact: locks changed June 3.",
        }
        result = ai_jobs.agent_run_step_job(
            payload, providers=_registry_with(provider), run_store=run_store
        )
        assert result["status"] == "completed"
        run = run_store.get_run(result["agent_run_id"])
        assert run["status"] == "running"
        steps = run_store.list_steps(run["id"])
        assert len(steps) == 1
        assert steps[0]["output_text"].startswith("The record")
        assert steps[0]["input_manifest_json"]["chars_sent"] == len("Fact: locks changed June 3.")

    def test_agent_synthesis_job(self):
        provider = FakeLLMProvider(name="openai")
        provider.text_responses.append("step output")
        run_store = InMemoryAgentRunStore()
        step_result = ai_jobs.agent_run_step_job(
            {
                "workspace_id": "ws-1",
                "question_text": "q?",
                "persona_name": "neutral_evidence_auditor",
                "context_text": "ctx",
            },
            providers=_registry_with(provider),
            run_store=run_store,
        )
        provider.structured_responses.append(
            {"summary": "Both agents agree the lockout is documented."}
        )
        synthesis = ai_jobs.agent_synthesis_job(
            {"agent_run_id": step_result["agent_run_id"]},
            providers=_registry_with(provider),
            run_store=run_store,
        )
        assert synthesis["status"] == "completed"
        artifacts = run_store.list_artifacts(step_result["agent_run_id"])
        assert len(artifacts) == 1
        assert artifacts[0]["artifact_type"] == "synthesis"
        assert run_store.get_run(step_result["agent_run_id"])["status"] == "completed"

    def test_convert_agent_step_job_creates_proposed_proposal(self):
        provider = FakeLLMProvider(name="openai")
        provider.text_responses.append("Verify whether the super kept a key.")
        run_store = InMemoryAgentRunStore()
        proposal_store = InMemoryProposalStore()
        step_result = ai_jobs.agent_run_step_job(
            {
                "workspace_id": "ws-1",
                "matter_id": "matter-1",
                "question_text": "What should we verify?",
                "persona_name": "claim_gap_detector",
                "context_text": "ctx",
            },
            providers=_registry_with(provider),
            run_store=run_store,
        )
        converted = ai_jobs.convert_agent_step_job(
            {
                "agent_run_id": step_result["agent_run_id"],
                "agent_run_step_id": step_result["agent_run_step_id"],
            },
            run_store=run_store,
            proposal_store=proposal_store,
        )
        assert converted["review_state"] == "proposed"
        rows = proposal_store.list_proposals()
        assert len(rows) == 1
        assert rows[0]["proposal_type"] == "verification_task"
        assert rows[0]["review_state"] == "proposed"


# ---------------------------------------------------------------------------
# HTTP surface
# ---------------------------------------------------------------------------


@pytest.fixture()
def api_client(monkeypatch):
    fastapi = pytest.importorskip("fastapi")
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient

    from app.routers.ai import router as ai_router
    from app.services.ai_service import AIService, set_service

    provider = FakeLLMProvider(name="openai")
    registry = ProviderRegistry({provider.name: provider})
    service = AIService(
        registry=registry,
        proposal_store=InMemoryProposalStore(),
        agent_store=InMemoryAgentRunStore(),
    )
    set_service(service)

    app = fastapi.FastAPI()
    # Mirror app/main.py: prefix-less router mounted under /api/v1.
    app.include_router(ai_router, prefix="/api/v1")
    client = TestClient(app)
    yield client, provider, service
    set_service(None)


class TestHttpSurface:
    def test_list_providers_masks_secrets(self, api_client, monkeypatch):
        client, _, _ = api_client
        monkeypatch.setenv("OPENAI_API_KEY", "sk-supersecret-value")
        response = client.get("/api/v1/ai/providers")
        assert response.status_code == 200
        body = response.json()
        assert any(p["provider_name"] == "openai" for p in body)
        assert all("sk-supersecret-value" not in json.dumps(p) for p in body)

    def test_proposal_run_returns_only_proposed(self, api_client):
        client, provider, _ = api_client
        provider.structured_responses.append({"proposals": [fact_item()]})
        provider.structured_responses.append({"proposals": [event_item()]})
        response = client.post(
            "/api/v1/ai/proposals/runs",
            json={
                "workspace_id": "ws-1",
                "matter_id": "matter-1",
                "source_id": "src-1",
                "text": "The landlord changed the 2F door locks on June 3, 2025.",
                "proposal_types": ["fact", "event"],
            },
        )
        assert response.status_code == 202, response.text
        body = response.json()
        assert body["created"] == 2
        assert body["proposals"]
        assert all(p["review_state"] == "proposed" for p in body["proposals"])

    def test_proposal_run_policy_violation_409(self, api_client):
        client, _, _ = api_client
        response = client.post(
            "/api/v1/ai/proposals/runs",
            json={
                "workspace_id": "ws-1",
                "source_id": "src-1",
                "text": "text",
                "sharing_policy": "no_ai",
            },
        )
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "policy_violation"

    def test_proposal_run_unknown_provider_404(self, api_client):
        client, _, _ = api_client
        response = client.post(
            "/api/v1/ai/proposals/runs",
            json={
                "workspace_id": "ws-1",
                "source_id": "src-1",
                "text": "text",
                "provider_name": "bogus",
            },
        )
        assert response.status_code == 404

    def test_agent_run_flow_and_conversion(self, api_client):
        client, provider, _ = api_client
        provider.text_responses.append("Defense view: the record is thin on notice.")
        created = client.post(
            "/api/v1/ai/agent-runs",
            json={
                "workspace_id": "ws-1",
                "matter_id": "matter-1",
                "question_text": "Where is the case weakest?",
                "persona_names": ["defense_red_team"],
                "context_text": "Fact: locks were changed.",
            },
        )
        assert created.status_code == 201, created.text
        run = created.json()
        assert run["status"] == "completed"
        assert len(run["steps"]) == 1
        step_id = run["steps"][0]["id"]

        fetched = client.get(f"/api/v1/ai/agent-runs/{run['id']}")
        assert fetched.status_code == 200
        assert fetched.json()["id"] == run["id"]

        converted = client.post(
            f"/api/v1/ai/agent-runs/{run['id']}/steps/{step_id}/proposals",
            json={"proposal_type": "verification_task"},
        )
        assert converted.status_code == 201, converted.text
        assert converted.json()["review_state"] == "proposed"

    def test_unknown_agent_run_404(self, api_client):
        client, _, _ = api_client
        assert client.get("/api/v1/ai/agent-runs/nope").status_code == 404
