"""Storage service contract (docs/contracts/sprint3_evidence.md §4.1).

Every backend — the local filesystem today, an S3-compatible adapter later
(Technical Spec §8.1) — implements :class:`StorageService`. Callers (the
sources API and the worker pipeline) import only
``from app.integrations.storage import get_storage, StoredObject`` and
address objects by their RELATIVE key. The relative key is what
``sources.storage_path`` stores, so the database never sees an absolute or
machine-specific path.

This module also owns the two backend-agnostic pieces of §4: the deterministic
key layout (§4.2) and the extension → ``SourceType`` classification map (§4.3).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import BinaryIO

from app.models.enums import SourceType


class StorageKeyError(ValueError):
    """A storage key is malformed or escapes the storage root (§4.1).

    Every ``StorageService`` implementation must raise this (a ``ValueError``
    subclass) for keys that are absolute, non-posix, or that resolve outside
    the backend's root — path traversal never reaches the disk.
    """


class StorageLimitError(ValueError):
    """An upload stream exceeds ``settings.max_upload_mb`` (§4.4).

    Additive defense-in-depth: §4.4 assigns the 413 response to the API layer
    (WS-A), but the storage service is the component doing the streaming, so
    it refuses to buffer more than the configured limit either way.
    """


@dataclass(frozen=True)
class StoredObject:
    """Result of a successful :meth:`StorageService.save_upload`."""

    key: str  # relative key, also stored in sources.storage_path
    size_bytes: int
    sha256: str


class StorageService(ABC):
    """Backend-agnostic evidence storage (contract §4.1)."""

    @abstractmethod
    def save_upload(self, stream: BinaryIO, *, key: str) -> StoredObject:
        """Stream ``stream`` into ``key`` and return key/size/sha256.

        Implementations must stream (never buffer a whole upload in memory),
        compute the sha256 and size while writing, and land the bytes at the
        final key atomically (temp file + rename) so a crashed write can never
        leave a partial evidence file behind.
        """

    @abstractmethod
    def get_path(self, key: str) -> Path:
        """Absolute path for ``key`` — traversal-guarded (local backend)."""

    @abstractmethod
    def read_bytes(self, key: str) -> bytes:
        """Return the stored bytes for ``key``."""

    @abstractmethod
    def write_derived(self, key: str, content: bytes) -> Path:
        """Write a derived artifact (OCR page JSON, thumbnail) atomically."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Delete ``key`` if present (idempotent; missing keys are fine)."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        """True when ``key`` is stored."""


# ---------------------------------------------------------------------------
# §4.2 key layout (deterministic — schema draft §8.2)
# ---------------------------------------------------------------------------
def _normalize_ext(ext: str) -> str:
    ext = (ext or "").strip().lower()
    if ext and not ext.startswith("."):
        ext = f".{ext}"
    return ext


def original_key(workspace_id: object, source_id: object, ext: str = "") -> str:
    """``uploads/{workspace_id}/{source_id}/original{ext}`` — the stored original."""
    return f"uploads/{workspace_id}/{source_id}/original{_normalize_ext(ext)}"


def processed_key(workspace_id: object, source_id: object, name: str) -> str:
    """``processed/{workspace_id}/{source_id}/<derived-name>``."""
    return f"processed/{workspace_id}/{source_id}/{name}"


def ocr_page_key(workspace_id: object, source_id: object, page_number: int) -> str:
    """``ocr/{workspace_id}/{source_id}/pages/{page_number}.json``."""
    return f"ocr/{workspace_id}/{source_id}/pages/{int(page_number)}.json"


def thumbnail_key(workspace_id: object, source_id: object, page_number: int) -> str:
    """``thumbnails/{workspace_id}/{source_id}/page-{page_number}.png``."""
    return f"thumbnails/{workspace_id}/{source_id}/page-{int(page_number)}.png"


# ---------------------------------------------------------------------------
# §4.3 classification map (extension → SourceType, lower-cased)
# ---------------------------------------------------------------------------
_EXTENSION_SOURCE_TYPES: dict[str, SourceType] = {
    ".pdf": SourceType.pdf,
    ".png": SourceType.image,
    ".jpg": SourceType.image,
    ".jpeg": SourceType.image,
    ".tif": SourceType.image,
    ".tiff": SourceType.image,
    ".webp": SourceType.image,
    ".heic": SourceType.image,
    ".eml": SourceType.email,
    ".msg": SourceType.email,
    ".txt": SourceType.text,
    ".log": SourceType.text,
    ".rtf": SourceType.text,
    ".md": SourceType.markdown,
    ".markdown": SourceType.markdown,
    ".csv": SourceType.spreadsheet,
    ".xlsx": SourceType.spreadsheet,
    ".xls": SourceType.spreadsheet,
    # .docx/.doc/.pages map to `other` in v1 (contract §4.3)
    ".docx": SourceType.other,
    ".doc": SourceType.other,
    ".pages": SourceType.other,
}


def classify_source_type(filename: str) -> SourceType:
    """Classify by lower-cased extension; anything unmapped is ``other`` (§4.3)."""
    ext = PurePosixPath(filename.replace("\\", "/")).suffix.lower()
    return _EXTENSION_SOURCE_TYPES.get(ext, SourceType.other)
