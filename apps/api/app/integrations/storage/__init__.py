"""Evidence storage service (docs/contracts/sprint3_evidence.md §4).

The rest of the codebase imports only from this package:

    from app.integrations.storage import get_storage, StoredObject

``get_storage()`` is a cached factory rooted at ``settings.local_storage_root``
(default ``./data``). Only the local adapter exists in this build; an
S3-compatible adapter lands later behind the same ``StorageService`` ABC
(Technical Spec §8.1).
"""
from __future__ import annotations

from functools import lru_cache

from app.config import get_settings
from app.integrations.storage.base import (
    StorageKeyError,
    StorageLimitError,
    StorageService,
    StoredObject,
    classify_source_type,
    ocr_page_key,
    original_key,
    processed_key,
    thumbnail_key,
)
from app.integrations.storage.local import LocalFileStorage

__all__ = [
    "LocalFileStorage",
    "StorageKeyError",
    "StorageLimitError",
    "StorageService",
    "StoredObject",
    "classify_source_type",
    "get_storage",
    "ocr_page_key",
    "original_key",
    "processed_key",
    "thumbnail_key",
]


@lru_cache
def get_storage() -> StorageService:
    """Process-wide storage backend (cached), built from settings (§4.1)."""
    settings = get_settings()
    mode = (settings.storage_mode or "local").strip().lower()
    if mode != "local":
        raise ValueError(
            f"storage_mode={mode!r} has no adapter in this build; only 'local' is "
            "implemented (the S3 adapter lands behind the same StorageService ABC)"
        )
    return LocalFileStorage(root=settings.local_storage_root)
