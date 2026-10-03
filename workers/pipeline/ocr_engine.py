"""OCR extraction engine implementations (Local pypdf / Apple Vision / OCR.space)."""
from __future__ import annotations

import io
import logging
import os
from typing import NamedTuple

logger = logging.getLogger("casevault.ocr")


class PageExtraction(NamedTuple):
    page_number: int
    page_label: str
    text: str


def extract_local_pdf(file_bytes: bytes) -> list[PageExtraction]:
    """Extract digital text from a PDF file using pypdf.

    Returns a list of PageExtraction objects. If pages contain no embedded text,
    text will be empty string.
    """
    import pypdf

    reader = pypdf.PdfReader(io.BytesIO(file_bytes))
    pages: list[PageExtraction] = []
    for idx, page in enumerate(reader.pages, start=1):
        extracted = page.extract_text() or ""
        pages.append(PageExtraction(page_number=idx, page_label=str(idx), text=extracted.strip()))
    return pages


def extract_ocr_space(
    file_bytes: bytes,
    filename: str,
    api_key: str | None = None,
    api_url: str | None = None,
    language: str = "eng",
    is_table: bool = False,
    timeout: float = 60.0,
) -> list[PageExtraction]:
    """Extract text from an image or PDF using the OCR.space REST API.

    API docs: https://ocr.space/OCRAPI
    """
    import httpx

    key = api_key or os.environ.get("OCR_SPACE_API_KEY", "")
    url = api_url or os.environ.get("OCR_SPACE_API_URL", "https://api.ocr.space/parse/image")

    if not key:
        raise ValueError("OCR_SPACE_API_KEY is not configured.")

    # Determine mime-type or fallback
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".pdf":
        content_type = "application/pdf"
    elif ext in (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"):
        content_type = f"image/{ext.lstrip('.')}"
    else:
        content_type = "application/octet-stream"

    files = {"file": (filename, file_bytes, content_type)}
    data = {
        "apikey": key,
        "language": language,
        "isTable": "true" if is_table else "false",
        "OCREngine": "2",  # Engine 2 is faster and excels with numbers/special chars
        "scale": "true",
    }

    response = httpx.post(url, files=files, data=data, timeout=timeout)
    if response.status_code != 200:
        raise RuntimeError(f"OCR.space HTTP {response.status_code}: {response.text[:300]}")

    payload = response.json()
    if payload.get("IsErroredOnProcessing"):
        error_msg = payload.get("ErrorMessage") or payload.get("ErrorDetails") or "OCR.space processing error"
        raise RuntimeError(f"OCR.space error: {error_msg}")

    parsed_results = payload.get("ParsedResults") or []
    pages: list[PageExtraction] = []

    for idx, result in enumerate(parsed_results, start=1):
        text = (result.get("ParsedText") or "").strip()
        pages.append(PageExtraction(page_number=idx, page_label=str(idx), text=text))

    return pages


def extract_source_pages(
    file_bytes: bytes,
    filename: str,
    source_type: str,
    engine: str = "hybrid",
    ocr_space_key: str | None = None,
    ocr_space_url: str | None = None,
) -> tuple[list[PageExtraction], str]:
    """Unified extractor supporting 'local', 'ocr_space', and 'hybrid' mode.

    Returns:
        (pages, used_engine_description)
    """
    key = ocr_space_key or os.environ.get("OCR_SPACE_API_KEY")
    url = ocr_space_url or os.environ.get("OCR_SPACE_API_URL")

    # 1. If PDF and local or hybrid: try local extraction first
    if source_type == "pdf" and engine in ("local", "hybrid"):
        try:
            local_pages = extract_local_pdf(file_bytes)
            # Check if we got meaningful text (any page with > 20 characters)
            total_chars = sum(len(p.text) for p in local_pages)
            if total_chars > 20:
                logger.info("Extracted %d pages from PDF using local pypdf", len(local_pages))
                return local_pages, "local_pypdf"
            elif engine == "local":
                # Local only requested, return what we have (even if scanned/empty)
                return local_pages, "local_pypdf"
            # In hybrid mode: embedded text was empty or sparse -> fallback to OCR.space
            logger.info("Local PDF extraction had sparse text (%d chars). Falling back to OCR.space", total_chars)
        except Exception as exc:
            logger.warning("Local PDF extraction failed: %s", exc)
            if engine == "local":
                raise

    # 2. OCR.space for images, scanned PDFs, or explicit ocr_space engine
    if key and (engine in ("ocr_space", "hybrid")):
        try:
            remote_pages = extract_ocr_space(
                file_bytes=file_bytes,
                filename=filename,
                api_key=key,
                api_url=url,
            )
            logger.info("Extracted %d pages using OCR.space", len(remote_pages))
            return remote_pages, "ocr_space"
        except Exception as exc:
            logger.error("OCR.space extraction failed: %s", exc)
            # If hybrid and we had local_pages, fallback to local_pages
            if source_type == "pdf":
                try:
                    fallback_pages = extract_local_pdf(file_bytes)
                    return fallback_pages, "local_pypdf_fallback"
                except Exception as fallback_exc:  # noqa: BLE001
                    logger.warning("Local PDF fallback also failed: %s", fallback_exc)
            raise

    # 3. Fallback for local-only image or missing key
    if source_type == "pdf":
        local_pages = extract_local_pdf(file_bytes)
        return local_pages, "local_pypdf"

    raise RuntimeError(
        f"No suitable OCR engine available for {source_type} (engine={engine}, OCR.space key configured: {bool(key)})"
    )
