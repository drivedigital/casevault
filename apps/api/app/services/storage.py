"""Local filesystem storage adapter (local-first evidence storage).

Files are stored under LOCAL_STORAGE_ROOT (default ./data) at:
    uploads/<workspace_id>/<YYYY>/<MM>/<uuid>__<sanitized-filename>

The database stores the RELATIVE posix path in sources.storage_path; the
absolute path is always re-derived from the configured root and verified
to stay inside it (defense in depth against path traversal).

Only the local adapter exists in Phase 2; an S3-compatible adapter can be
added later behind the same interface (config.storage_mode selects it).
"""
from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings

_UPLOAD_SUBDIR = "uploads"
_UNSAFE_CHARS = re.compile(r"[^A-Za-z0-9._ -]")
_MAX_FILENAME_LEN = 80


def sanitize_filename(name: str) -> str:
    """Return a filesystem-safe rendering of an uploaded filename."""
    name = name.replace("\\", "/").rsplit("/", 1)[-1]  # drop any directories
    name = _UNSAFE_CHARS.sub("_", name).strip(". ")
    name = re.sub(r"\s+", " ", name)
    if not name:
        name = "upload"
    if len(name) > _MAX_FILENAME_LEN:
        stem, _, ext = name.partition(".")
        keep = _MAX_FILENAME_LEN - len(ext) - 1
        name = f"{stem[:keep]}.{ext}" if keep > 0 else name[:_MAX_FILENAME_LEN]
    return name


@dataclass
class StoredFile:
    relative_path: str  # posix path relative to the storage root
    absolute_path: Path
    sha256: str
    size_bytes: int


class LocalStorage:
    def __init__(self, root: str | Path | None = None):
        settings = get_settings()
        self.root = Path(root if root is not None else settings.local_storage_root).resolve()

    def _resolve(self, relative_path: str) -> Path:
        """Resolve a stored relative path, refusing escapes from the root."""
        candidate = (self.root / relative_path).resolve()
        if self.root not in candidate.parents and candidate != self.root:
            raise ValueError(f"storage path escapes the local root: {relative_path!r}")
        return candidate

    def save(
        self,
        workspace_id: uuid.UUID,
        filename: str,
        content: bytes,
        *,
        now: datetime | None = None,
    ) -> StoredFile:
        moment = now or datetime.now(timezone.utc)
        safe_name = sanitize_filename(filename)
        rel_dir = f"{_UPLOAD_SUBDIR}/{workspace_id}/{moment:%Y}/{moment:%m}"
        rel_path = f"{rel_dir}/{uuid.uuid4()}__{safe_name}"
        abs_path = self.root / rel_path
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_bytes(content)
        return StoredFile(
            relative_path=rel_path,
            absolute_path=abs_path,
            sha256=hashlib.sha256(content).hexdigest(),
            size_bytes=len(content),
        )

    def read(self, relative_path: str) -> bytes:
        return self._resolve(relative_path).read_bytes()

    def open_path(self, relative_path: str) -> Path:
        """Absolute path for serving — verified to sit inside the root."""
        path = self._resolve(relative_path)
        if not path.is_file():
            raise FileNotFoundError(relative_path)
        return path

    def delete(self, relative_path: str) -> None:
        path = self._resolve(relative_path)
        if path.is_file():
            path.unlink()
