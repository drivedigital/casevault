"""Environment and provider configuration for the AI pipeline (WS-AI-INTEL).

Loads AI provider credentials from the process environment merged with an
optional dotenv file (``.env.local`` by default; override with ``AI_ENV_FILE``).
Process environment always wins over file values, and no secret ever leaves
this module except as a masked string.

Spec references:
- Technical Spec §6.1 (env groups), §12 (AI provider abstraction), §12.5 (sharing guardrails)
- PRD §10.12 (provider-agnostic connector layer; local model connectors)
- Repo Scaffold Plan §6 (env strategy: `.env.example` committed, `.env.local` ignored)
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Dict, Mapping, Optional

#: Repository root (workers/ai/config.py -> ../../..)
REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_ENV_FILE = ".env.local"


class SharingPolicy(str, Enum):
    """Per-matter/workspace AI sharing guardrail (PRD §10.12 guardrails)."""

    NO_AI = "no_ai"
    LOCAL_ONLY = "local_only"
    EXTERNAL_EXCERPTS_ONLY = "external_excerpts_only"
    EXTERNAL_SELECTED_FULL_DOCS = "external_selected_full_docs"


# ---------------------------------------------------------------------------
# dotenv-lite
# ---------------------------------------------------------------------------

def parse_env_text(text: str) -> Dict[str, str]:
    """Parse dotenv-style content. Supports comments, blank lines, optional
    single/double quotes, and an optional `export ` prefix. Later keys win."""
    values: Dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):].lstrip()
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if not key:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        # strip trailing inline comments on unquoted values
        elif " #" in value:
            value = value.split(" #", 1)[0].strip()
        values[key] = value
    return values


def load_env_file(path: os.PathLike | str) -> Dict[str, str]:
    """Load a dotenv file; missing file yields an empty mapping."""
    p = Path(path)
    if not p.is_file():
        return {}
    return parse_env_text(p.read_text(encoding="utf-8"))


def merged_environ(env_file: Optional[os.PathLike | str] = None) -> Dict[str, str]:
    """Process environment merged over the dotenv file (process env wins)."""
    if env_file is None:
        env_file = os.environ.get("AI_ENV_FILE") or (REPO_ROOT / DEFAULT_ENV_FILE)
    file_vars = load_env_file(env_file)
    merged = {**file_vars, **{k: v for k, v in os.environ.items()}}
    return merged


def _clean(env: Mapping[str, str], key: str) -> Optional[str]:
    value = (env.get(key) or "").strip()
    return value or None


def mask_secret(value: Optional[str]) -> str:
    """Safe, log-friendly representation of a secret."""
    if not value:
        return ""
    if len(value) <= 4:
        return "****"
    return f"****{value[-4:]}"


# ---------------------------------------------------------------------------
# Provider configuration
# ---------------------------------------------------------------------------

#: Adapter families understood by ``workers.ai.providers``.
FAMILY_OPENAI_COMPATIBLE = "openai_compatible"
FAMILY_ANTHROPIC = "anthropic"
FAMILY_OLLAMA = "ollama"


@dataclass(frozen=True)
class ProviderSpec:
    """Static description of a known provider and its env contract."""

    name: str
    display_name: str
    family: str
    key_var: Optional[str]
    base_var: Optional[str]
    model_var: Optional[str]
    default_base: Optional[str]
    default_model: str
    is_local: bool = False


#: Declared in resolution-priority order. The set mirrors Technical Spec
#: §12.3 adapters; NVIDIA rides the OpenAI-compatible NIM endpoint.
PROVIDER_SPECS: Dict[str, ProviderSpec] = {
    "openai": ProviderSpec(
        name="openai",
        display_name="OpenAI",
        family=FAMILY_OPENAI_COMPATIBLE,
        key_var="OPENAI_API_KEY",
        base_var="OPENAI_BASE_URL",
        model_var="OPENAI_MODEL",
        default_base="https://api.openai.com/v1",
        default_model="gpt-4o-mini",
    ),
    "anthropic": ProviderSpec(
        name="anthropic",
        display_name="Anthropic",
        family=FAMILY_ANTHROPIC,
        key_var="ANTHROPIC_API_KEY",
        base_var="ANTHROPIC_BASE_URL",
        model_var="ANTHROPIC_MODEL",
        default_base="https://api.antropic.com",
        default_model="claude-sonnet-4-20250514",
    ),
    "nvidia": ProviderSpec(
        name="nvidia",
        display_name="NVIDIA NIM",
        family=FAMILY_OPENAI_COMPATIBLE,
        key_var="NVIDIA_API_KEY",
        base_var="NVIDIA_BASE_URL",
        model_var="NVIDIA_MODEL",
        default_base="https://integrate.api.nvidia.com/v1",
        default_model="meta/llama-3.1-70b-instruct",
    ),
    "ollama": ProviderSpec(
        name="ollama",
        display_name="Ollama",
        family=FAMILY_OLLAMA,
        key_var="OLLAMA_API_KEY",
        base_var="OLLAMA_BASE_URL",
        model_var="OLLAMA_MODEL",
        default_base="http://localhost:11434",
        default_model="llama3.1",
        is_local=True,
    ),
    "gemini": ProviderSpec(
        name="gemini",
        display_name="Google Gemini",
        family=FAMILY_OPENAI_COMPATIBLE,
        key_var="GEMINI_API_KEY",
        base_var="GEMINI_BASE_URL",
        model_var="GEMINI_MODEL",
        default_base="https://generativelanguage.googleapis.com/v1beta/openai",
        default_model="gemini-1.5-pro",
    ),
    "xai": ProviderSpec(
        name="xai",
        display_name="xAI Grok",
        family=FAMILY_OPENAI_COMPATIBLE,
        key_var="XAI_API_KEY",
        base_var="XAI_BASE_URL",
        model_var="XAI_MODEL",
        default_base="https://api.x.ai/v1",
        default_model="grok-2-latest",
    ),
    "openrouter": ProviderSpec(
        name="openrouter",
        display_name="OpenRouter",
        family=FAMILY_OPENAI_COMPATIBLE,
        key_var="OPENROUTER_API_KEY",
        base_var="OPENROUTER_BASE_URL",
        model_var="OPENROUTER_MODEL",
        default_base="https://openrouter.ai/api/v1",
        default_model="openrouter/auto",
    ),
}


@dataclass(frozen=True)
class ProviderConfig:
    """Resolved, ready-to-use configuration for one provider instance."""

    name: str
    display_name: str
    family: str
    base_url: str
    api_key: Optional[str]
    default_model: str
    is_local: bool
    key_var: Optional[str]

    @property
    def masked_key(self) -> str:
        return mask_secret(self.api_key)


def _provider_enabled(spec: ProviderSpec, env: Mapping[str, str]) -> bool:
    name_upper = spec.name.upper()
    if _clean(env, f"{name_upper}_ENABLED") in ("0", "false", "no"):
        return False
    if _clean(env, spec.key_var):
        return True
    # Ollama needs no key; an explicit base URL (or ENABLED=1) opts it in.
    if spec.base_var and _clean(env, spec.base_var):
        return True
    return _clean(env, f"{name_upper}_ENABLED") in ("1", "true", "yes")


def configured_providers(env: Optional[Mapping[str, str]] = None) -> Dict[str, ProviderConfig]:
    """Resolve every configured provider from the environment.

    A provider is *configured* when its credential env var is set (or, for
    keyless local providers like Ollama, its base URL is set / it is explicitly
    enabled). Providers listed in ``AI_DISABLED_PROVIDERS`` are force-disabled.
    """
    env = merged_environ() if env is None else env
    disabled = {
        part.strip().lower()
        for part in (_clean(env, "AI_DISABLED_PROVIDERS") or "").split(",")
        if part.strip()
    }
    result: Dict[str, ProviderConfig] = {}
    for name, spec in PROVIDER_SPECS.items():
        if name in disabled or not _provider_enabled(spec, env):
            continue
        base_url = (
            _clean(env, spec.base_var) if spec.base_var else None
        ) or spec.default_base or ""
        result[name] = ProviderConfig(
            name=spec.name,
            display_name=spec.display_name,
            family=spec.family,
            base_url=base_url.rstrip("/"),
            api_key=_clean(env, spec.key_var) if spec.key_var else None,
            default_model=_clean(env, spec.model_var) or spec.default_model,
            is_local=spec.is_local,
            key_var=spec.key_var,
        )
    return result


def default_provider_name(env: Optional[Mapping[str, str]] = None) -> Optional[str]:
    """Name of the provider used when a job does not pick one explicitly."""
    env = merged_environ() if env is None else env
    configs = configured_providers(env)
    if not configs:
        return None
    preferred = _clean(env, "AI_DEFAULT_PROVIDER")
    if preferred and preferred.lower() in configs:
        return preferred.lower()
    return next(iter(configs))


def sharing_policy_from_env(env: Optional[Mapping[str, str]] = None) -> SharingPolicy:
    env = merged_environ() if env is None else env
    raw = (_clean(env, "AI_SHARING_POLICY") or SharingPolicy.EXTERNAL_EXCERPTS_ONLY.value).lower()
    try:
        return SharingPolicy(raw)
    except ValueError:
        return SharingPolicy.EXTERNAL_EXCERPTS_ONLY
