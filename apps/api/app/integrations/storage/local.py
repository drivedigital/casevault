"""Local filesystem implementation of the storage contract (§4.1).

Layout under ``settings.local_storage_root`` (default ``./data``) follows the
deterministic keys of §4.2 (``uploads/{workspace_id}/{source_id}/original{ext}``,
``processed/…``, ``ocr/…/pages/{n}.json``, ``thumbnails/…/page-{n}.png``).

Guarantees:

- **Streaming writes** — uploads are copied in chunks (never buffered whole),
  with sha256 and size computed as bytes flow.
- **Atomic move from ``data/temp/``** — bytes land in ``<root>/temp/`` first
  and are ``os.replace``\\ d into the final key, so a failure mid-write can
  never leave a partial evidence file at the final key.
- **Traversal guard** — every key is resolved against the root and must stay
  inside it; violations raise :class:`StorageKeyError` before any I/O.
- **Size limit** — streams larger than ``settings.max_upload_mb``
  (§4.4, default 200 MB) abort mid-stream and clean the temp file.
"""
from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path
from typing import BinaryIO

from app.config import get_settings
from app.integrations.storage.base import (
    StorageKeyError,
    StorageLimitError,
    StorageService,
    StoredObject,
)

_CHUNK_BYTES = 1024 * 1024
_TEMP_DIRNAME = "temp"


class LocalFileStorage(StorageService):
    """StorageService over the local filesystem, rooted at ``root``."""

    def __init__(
        self,
        root: str | Path | None = None,
        *,
        max_upload_mb: int | None = None,
    ) -> None:
        settings = get_settings()
        self.root = Path(root if root is not None else settings.local_storage_root).resolve()
        limit_mb = settings.max_upload_mb if max_upload_mb is None else max_upload_mb
        self.max_upload_bytes = max(int(limit_mb), 0) * 1024 * 1024
        self._temp_dir = self.root / _TEMP_DIRNAME

    # -- key safety ----------------------------------------------------------
    def _resolve(self, key: str) -> Path:
        """Resolve ``key`` inside the root; raise StorageKeyError otherwise."""
        if not key or key.startswith("/") or "\\" in key or key in {".", ".."}:
            raise StorageKeyError(
                f"storage keys must be non-empty relative posix paths, got {key!r}"
            )
        candidate = (self.root / key).resolve()
        if candidate == self.root or self.root not in candidate.parents:
            raise StorageKeyError(f"storage key escapes the storage root: {key!r}")
        return candidate

    def _new_temp_file(self) -> Path:
        """A unique staging file under ``<root>/temp`` (same filesystem)."""
        self._temp_dir.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(prefix="upload-", suffix=".part", dir=self._temp_dir)
        os.close(fd)
        return Path(name)

    def _move_into_place(self, tmp_path: Path, final_path: Path) -> None:
        final_path.parent.mkdir(parents=True, exist_ok=True)
        os.replace(tmp_path, final_path)  # atomic: data/temp -> final key

    # -- StorageService --------------------------------------------------------
    def save_upload(self, stream: BinaryIO, *, key: str) -> StoredObject:
        final_path = self._resolve(key)  # guard before any bytes hit the disk
        tmp_path = self._new_temp_file()
        digest = hashlib.sha256()
        size = 0
        try:
            with open(tmp_path, "wb") as out:
                while chunk := stream.read(_CHUNK_BYTES):
                    size += len(chunk)
                    if size > self.max_upload_bytes:
                        raise StorageLimitError(
                            f"upload for {key!r} exceeds MAX_UPLOAD_MB="
                            f"{self.max_upload_bytes // (1024 * 1024)}"
                        )
                    digest.update(chunk)
                    out.write(chunk)
            self._move_into_place(tmp_path, final_path)
        except BaseException:
            tmp_path.unlink(missing_ok=True)  # never leave staging debris
            raise
        return StoredObject(key=key, size_bytes=size, sha256=digest.hexdigest())

    def get_path(self, key: str) -> Path:
        """Absolute, traversal-guarded path (need not exist yet)."""
        return self._resolve(key)

    def read_bytes(self, key: str) -> bytes:
        return self._resolve(key).read_bytes()

    def write_derived(self, key: str, content: bytes) -> Path:
        final_path = self._resolve(key)
        tmp_path = self._new_temp_file()
        try:
            with open(tmp_path, "wb") as out:
                out.write(content)
            self._move_into_place(tmp_path, final_path)
        except BaseException:
            tmp_path.unlink(missing_ok=True)
            raise
        return final_path

    def delete(self, key: str) -> None:
        path = self._resolve(key)
        if path.is_file():
            path.unlink()

    def exists(self, key: str) -> bool:
        return self._resolve(key).is_file()
