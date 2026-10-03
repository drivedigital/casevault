"""CaseVault API configuration.

Settings are read from environment variables, with layered .env files
(.env.local overrides .env). Secrets (AI provider keys, session secrets)
must only ever live in local env files — never in the database, never in
Git. See docs/specs Technical Spec section 6.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env.local", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # app
    app_env: str = "development"
    app_port_web: int = 3000
    app_port_api: int = 8100
    app_base_url: str = "http://localhost:3000"
    api_base_url: str = "http://localhost:8100"

    # database / queue
    database_url: str = "postgresql://postgres:postgres@localhost:5432/casevault"
    redis_url: str = "redis://localhost:6379/0"

    # file storage (local-first)
    storage_mode: str = "local"
    local_storage_root: str = "./data"
    max_upload_bytes: int = 100 * 1024 * 1024  # 100 MB evidence-file guard

    # security (local dev defaults; rotate for anything shared)
    app_secret_key: str = "change-me-local-only"
    session_secret: str = "change-me-local-only"

    # AI providers — blank means the provider is unavailable. The effective
    # AI-sharing policy defaults to `no_ai` until explicitly configured.
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None
    xai_api_key: str | None = None
    openrouter_api_key: str | None = None
    ollama_base_url: str | None = "http://localhost:11434"

    # search / embeddings (later phase)
    embedding_provider: str | None = None
    embedding_model: str | None = None

    # OCR / parsing
    ocr_engine: str = "hybrid"  # "local", "ocr_space", or "hybrid" (try local text first, fallback to OCR.space)
    ocr_space_api_key: str | None = None
    ocr_space_api_url: str = "https://api.ocr.space/parse/image"

    # Cloud / Edge / Supabase integration
    cloudflare_worker_url: str | None = "https://casevault-worker.dan-2eb.workers.dev"
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None

    # MCP connectors (later phase)
    mcp_default_timeout: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()
