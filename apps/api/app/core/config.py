"""Core configuration (Phase 0 plan §6: config loader)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_API_ROOT = Path(__file__).resolve().parents[2]
_REPO_ROOT = _API_ROOT.parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_REPO_ROOT / ".env.local", _REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    # When empty, falls back to a local SQLite file so the app can run
    # without Docker (native-first convenience, Tech Spec §5.3).
    database_url: str = ""
    local_storage_root: Path = _REPO_ROOT / "data"
    default_workspace_slug: str = "default"
    default_workspace_name: str = "Default Workspace"

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        self.local_storage_root.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{self.local_storage_root / 'dev.sqlite'}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
