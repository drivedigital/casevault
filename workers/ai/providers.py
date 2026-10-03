"""Provider-agnostic LLM adapters (WS-AI-INTEL).

Implements the `LLMProvider` contract from Technical Spec §12.2:
`generate_text`, `generate_structured`, `health_check`, plus request
envelopes carrying sharing-policy metadata (§12.5). Adapters map the generic
envelope to provider APIs, normalize responses, and surface consistent errors
(§12.3).

Adapters here are transport-injectable and dependency-free (stdlib urllib)
so the worker layer runs anywhere and is trivially testable offline.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Mapping, Optional, Protocol, Tuple

from .config import (
    FAMILY_ANTHROPIC,
    FAMILY_OLLAMA,
    FAMILY_OPENAI_COMPATIBLE,
    ProviderConfig,
    SharingPolicy,
)
from .schemas import extract_json

DEFAULT_TIMEOUT = 60.0
HEALTH_TIMEOUT = 5.0
ANTHROPIC_VERSION = "2023-06-01"


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class ProviderError(RuntimeError):
    """Consistent provider failure surface (Technical Spec §12.3)."""

    def __init__(self, message: str, *, provider: str, status: Optional[int] = None):
        super().__init__(message)
        self.provider = provider
        self.status = status


class StructuredOutputError(ProviderError):
    """Provider responded, but its output could not be parsed as JSON."""


class PolicyViolation(RuntimeError):
    """A run was blocked by the AI sharing guardrails (Technical Spec §12.5)."""

    def __init__(self, message: str, *, policy: SharingPolicy, provider: str = ""):
        super().__init__(message)
        self.policy = policy
        self.provider = provider


# ---------------------------------------------------------------------------
# Request / response envelopes
# ---------------------------------------------------------------------------


@dataclass
class LLMRequest:
    """Generic request envelope (Technical Spec §12.2)."""

    system_prompt: str
    user_prompt: str
    model: Optional[str] = None
    temperature: float = 0.2
    max_tokens: int = 1500
    #: Accounting of what context is being shared. Never sent to the provider;
    #: recorded in provenance manifests per §12.5.
    share_manifest: Dict[str, Any] = field(default_factory=dict)
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class LLMResponse:
    provider: str
    model: str
    text: str
    structured: Optional[Any] = None
    usage: Dict[str, Any] = field(default_factory=dict)
    raw: Dict[str, Any] = field(default_factory=dict)


class LLMProvider(Protocol):
    """Internal provider contract (Technical Spec §12.2)."""

    name: str
    is_local: bool

    def generate_text(self, request: LLMRequest) -> LLMResponse: ...

    def generate_structured(self, request: LLMRequest, schema: Mapping[str, Any]) -> LLMResponse: ...

    def health_check(self) -> bool: ...


# ---------------------------------------------------------------------------
# HTTP transport (injectable)
# ---------------------------------------------------------------------------


class HttpJsonTransport:
    """Minimal JSON-over-HTTP transport backed by urllib.

    Injectable seam: tests substitute a fake with the same surface.
    """

    def post_json(
        self,
        url: str,
        body: Mapping[str, Any],
        headers: Optional[Mapping[str, str]] = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> Tuple[int, Any]:
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")
        for key, value in (headers or {}).items():
            req.add_header(key, value)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8") or "null")
                return resp.status, payload
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8", errors="replace")[:2000]
            except Exception:  # noqa: BLE001 - defensive
                detail = ""
            raise ProviderError(
                f"HTTP {exc.code} from {url}: {detail or exc.reason}",
                provider="",
                status=exc.code,
            ) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ProviderError(f"network error calling {url}: {exc}", provider="") from exc

    def get_json(
        self,
        url: str,
        headers: Optional[Mapping[str, str]] = None,
        timeout: float = HEALTH_TIMEOUT,
    ) -> Tuple[int, Any]:
        req = urllib.request.Request(url, method="GET")
        req.add_header("Accept", "application/json")
        for key, value in (headers or {}).items():
            req.add_header(key, value)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8") or "null")
                return resp.status, payload
        except urllib.error.HTTPError as exc:
            raise ProviderError(f"HTTP {exc.code} from {url}", provider="", status=exc.code) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ProviderError(f"network error calling {url}: {exc}", provider="") from exc


TransportLike = HttpJsonTransport  # structural type hint for docs


def _schema_instruction(schema: Mapping[str, Any]) -> str:
    return (
        "Respond with ONLY one valid JSON value — no markdown, no commentary — "
        "conforming exactly to this JSON schema:\n"
        f"{json.dumps(schema, indent=2)}"
    )


# ---------------------------------------------------------------------------
# Adapters
# ---------------------------------------------------------------------------


class OpenAICompatibleProvider:
    """Adapter for OpenAI-compatible chat APIs.

    Covers OpenAI, NVIDIA NIM, Gemini (openai endpoint), xAI, OpenRouter,
    LM Studio, vLLM, etc. (Technical Spec §12.3).
    """

    def __init__(
        self,
        config: ProviderConfig,
        transport: Optional[HttpJsonTransport] = None,
        *,
        use_response_format: bool = True,
        timeout: float = DEFAULT_TIMEOUT,
    ):
        self.config = config
        self.name = config.name
        self.is_local = config.is_local
        self.transport = transport or HttpJsonTransport()
        self.use_response_format = use_response_format
        self.timeout = timeout

    # -- envelope mapping ------------------------------------------------

    def _headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

    def _build_body(self, request: LLMRequest, system_prompt: str) -> Dict[str, Any]:
        body: Dict[str, Any] = {
            "model": request.model or self.config.default_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.user_prompt},
            ],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        }
        body.update(request.extra.get("body_overrides", {}))
        return body

    def _url(self) -> str:
        return f"{self.config.base_url}/chat/completions"

    # -- contract ---------------------------------------------------------

    def generate_text(self, request: LLMRequest) -> LLMResponse:
        body = self._build_body(request, request.system_prompt)
        try:
            status, payload = self.transport.post_json(
                self._url(), body, headers=self._headers(), timeout=self.timeout
            )
        except ProviderError as exc:
            raise ProviderError(str(exc), provider=self.name, status=exc.status) from exc
        return self._normalize(body, payload)

    def generate_structured(self, request: LLMRequest, schema: Mapping[str, Any]) -> LLMResponse:
        system_prompt = request.system_prompt.rstrip() + "\n\n" + _schema_instruction(schema)
        body = self._build_body(request, system_prompt)
        if self.use_response_format:
            body["response_format"] = {"type": "json_object"}
        try:
            status, payload = self.transport.post_json(
                self._url(), body, headers=self._headers(), timeout=self.timeout
            )
        except ProviderError as exc:
            raise ProviderError(str(exc), provider=self.name, status=exc.status) from exc
        response = self._normalize(body, payload)
        try:
            response.structured = extract_json(response.text)
        except ValueError as exc:
            raise StructuredOutputError(
                f"{self.name}: could not parse structured output: {exc}",
                provider=self.name,
            ) from exc
        return response

    def _normalize(self, body: Mapping[str, Any], payload: Mapping[str, Any]) -> LLMResponse:
        choices = payload.get("choices") or []
        text = ""
        if choices:
            message = choices[0].get("message") or {}
            text = message.get("content") or ""
        usage = payload.get("usage") or {}
        return LLMResponse(
            provider=self.name,
            model=str(payload.get("model") or body.get("model") or ""),
            text=text,
            usage={k: usage[k] for k in ("prompt_tokens", "completion_tokens", "total_tokens") if k in usage},
            raw=dict(payload),
        )

    def health_check(self) -> bool:
        try:
            status, _ = self.transport.get_json(
                f"{self.config.base_url}/models", headers=self._headers(), timeout=HEALTH_TIMEOUT
            )
            return 200 <= status < 300
        except ProviderError:
            return False


class AnthropicProvider:
    """Adapter for the Anthropic Messages API (Technical Spec §12.3)."""

    def __init__(
        self,
        config: ProviderConfig,
        transport: Optional[HttpJsonTransport] = None,
        *,
        timeout: float = DEFAULT_TIMEOUT,
    ):
        self.config = config
        self.name = config.name
        self.is_local = config.is_local
        self.transport = transport or HttpJsonTransport()
        self.timeout = timeout

    def _headers(self) -> Dict[str, str]:
        headers = {"anthropic-version": ANTHROPIC_VERSION}
        if self.config.api_key:
            headers["x-api-key"] = self.config.api_key
        return headers

    def _build_body(self, request: LLMRequest, system_prompt: str) -> Dict[str, Any]:
        body: Dict[str, Any] = {
            "model": request.model or self.config.default_model,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "system": system_prompt,
            "messages": [{"role": "user", "content": request.user_prompt}],
        }
        body.update(request.extra.get("body_overrides", {}))
        return body

    def generate_text(self, request: LLMRequest) -> LLMResponse:
        return self._call(request, request.system_prompt, parse=False)

    def generate_structured(self, request: LLMRequest, schema: Mapping[str, Any]) -> LLMResponse:
        return self._call(
            request,
            request.system_prompt.rstrip() + "\n\n" + _schema_instruction(schema),
            parse=True,
        )

    def _call(self, request: LLMRequest, system_prompt: str, *, parse: bool) -> LLMResponse:
        body = self._build_body(request, system_prompt)
        url = f"{self.config.base_url}/v1/messages"
        try:
            status, payload = self.transport.post_json(
                url, body, headers=self._headers(), timeout=self.timeout
            )
        except ProviderError as exc:
            raise ProviderError(str(exc), provider=self.name, status=exc.status) from exc

        text = "".join(
            block.get("text", "")
            for block in (payload.get("content") or [])
            if isinstance(block, Mapping) and block.get("type") == "text"
        )
        usage = payload.get("usage") or {}
        response = LLMResponse(
            provider=self.name,
            model=str(payload.get("model") or body.get("model") or ""),
            text=text,
            usage={
                k: usage[k]
                for k in ("input_tokens", "output_tokens")
                if k in usage
            },
            raw=dict(payload),
        )
        if parse:
            try:
                response.structured = extract_json(response.text)
            except ValueError as exc:
                raise StructuredOutputError(
                    f"{self.name}: could not parse structured output: {exc}",
                    provider=self.name,
                ) from exc
        return response

    def health_check(self) -> bool:
        # Anthropic has no cheap unauthenticated probe; a model listing call
        # with credentials is the lightest meaningful check.
        try:
            status, _ = self.transport.get_json(
                f"{self.config.base_url}/v1/models", headers=self._headers(), timeout=HEALTH_TIMEOUT
            )
            return 200 <= status < 300
        except ProviderError:
            return False


class OllamaProvider:
    """Adapter for Ollama — local server or Ollama Cloud (PRD §10.12)."""

    def __init__(
        self,
        config: ProviderConfig,
        transport: Optional[HttpJsonTransport] = None,
        *,
        timeout: float = DEFAULT_TIMEOUT,
    ):
        self.config = config
        self.name = config.name
        self.is_local = config.is_local
        self.transport = transport or HttpJsonTransport()
        self.timeout = timeout

    def _headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

    def _build_body(self, request: LLMRequest, system_prompt: str) -> Dict[str, Any]:
        return {
            "model": request.model or self.config.default_model,
            "stream": False,
            "options": {"temperature": request.temperature, "num_predict": request.max_tokens},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.user_prompt},
            ],
        }

    def generate_text(self, request: LLMRequest) -> LLMResponse:
        return self._call(request, request.system_prompt, parse=False)

    def generate_structured(self, request: LLMRequest, schema: Mapping[str, Any]) -> LLMResponse:
        return self._call(
            request,
            request.system_prompt.rstrip() + "\n\n" + _schema_instruction(schema),
            parse=True,
        )

    def _call(self, request: LLMRequest, system_prompt: str, *, parse: bool) -> LLMResponse:
        body = self._build_body(request, system_prompt)
        url = f"{self.config.base_url}/api/chat"
        try:
            status, payload = self.transport.post_json(
                url, body, headers=self._headers(), timeout=self.timeout
            )
        except ProviderError as exc:
            raise ProviderError(str(exc), provider=self.name, status=exc.status) from exc
        message = payload.get("message") or {}
        response = LLMResponse(
            provider=self.name,
            model=str(payload.get("model") or body.get("model") or ""),
            text=message.get("content") or "",
            usage={
                k: payload[k]
                for k in ("prompt_eval_count", "eval_count")
                if k in payload
            },
            raw=dict(payload),
        )
        if parse:
            try:
                response.structured = extract_json(response.text)
            except ValueError as exc:
                raise StructuredOutputError(
                    f"{self.name}: could not parse structured output: {exc}",
                    provider=self.name,
                ) from exc
        return response

    def health_check(self) -> bool:
        try:
            status, _ = self.transport.get_json(
                f"{self.config.base_url}/api/tags", headers=self._headers(), timeout=HEALTH_TIMEOUT
            )
            return 200 <= status < 300
        except ProviderError:
            return False


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class ProviderRegistry:
    """Ordered collection of live provider adapters keyed by name."""

    def __init__(self, providers: Optional[Mapping[str, LLMProvider]] = None):
        self._providers: Dict[str, LLMProvider] = dict(providers or {})

    def register(self, provider: LLMProvider) -> None:
        self._providers[provider.name] = provider

    def get(self, name: str) -> Optional[LLMProvider]:
        return self._providers.get(name)

    def names(self) -> Tuple[str, ...]:
        return tuple(self._providers)

    def items(self):
        return self._providers.items()

    def __contains__(self, name: str) -> bool:
        return name in self._providers

    def __len__(self) -> int:
        return len(self._providers)


_ADAPTER_FACTORIES: Dict[str, Callable[[ProviderConfig, Optional[HttpJsonTransport]], Any]] = {
    FAMILY_OPENAI_COMPATIBLE: lambda cfg, transport: OpenAICompatibleProvider(cfg, transport),
    FAMILY_ANTHROPIC: lambda cfg, transport: AnthropicProvider(cfg, transport),
    FAMILY_OLLAMA: lambda cfg, transport: OllamaProvider(cfg, transport),
}


def build_registry(
    configs: Optional[Mapping[str, ProviderConfig]] = None,
    transport: Optional[HttpJsonTransport] = None,
) -> ProviderRegistry:
    """Instantiate adapters for every configured provider."""
    from .config import configured_providers  # local import: avoid cycle at module load

    configs = configs if configs is not None else configured_providers()
    registry = ProviderRegistry()
    for name, config in configs.items():
        factory = _ADAPTER_FACTORIES.get(config.family)
        if factory is None:
            continue
        registry.register(factory(config, transport))
    return registry


# ---------------------------------------------------------------------------
# Provider selection under sharing policy
# ---------------------------------------------------------------------------


def select_provider(
    registry: ProviderRegistry,
    policy: SharingPolicy,
    preferred_name: Optional[str] = None,
) -> LLMProvider:
    """Pick a provider respecting the sharing guardrails (Spec §12.5).

    - `no_ai`            -> always PolicyViolation
    - `local_only`       -> only local providers may be used
    - otherwise          -> preferred provider (if named) or first registered
    """
    if policy == SharingPolicy.NO_AI:
        raise PolicyViolation(
            "AI use is disabled for this scope (sharing policy: no_ai)",
            policy=policy,
            provider=preferred_name or "",
        )

    if preferred_name:
        provider = registry.get(preferred_name.lower())
        if provider is None:
            raise ProviderError(
                f"provider {preferred_name!r} is not configured or enabled",
                provider=preferred_name,
            )
        if policy == SharingPolicy.LOCAL_ONLY and not provider.is_local:
            raise PolicyViolation(
                f"sharing policy local_only forbids external provider {preferred_name!r}",
                policy=policy,
                provider=preferred_name,
            )
        return provider

    candidates = [p for _, p in registry.items()]
    if policy == SharingPolicy.LOCAL_ONLY:
        candidates = [p for p in candidates if p.is_local]
    if not candidates:
        raise PolicyViolation(
            "no provider satisfies the current sharing policy"
            if policy == SharingPolicy.LOCAL_ONLY
            else "no AI providers are configured",
            policy=policy,
        )
    return candidates[0]
