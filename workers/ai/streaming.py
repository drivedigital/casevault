"""Streaming intake for the AI proposal pipeline (WS-AI-INTEL).

Large sources must not be buffered whole before extraction starts. This
module provides:

- `chunk_source_text` — a lazy, paragraph-aware chunker producing
  `SourceChunk` values with bounded size (always <= `max_chars`) and a
  small overlap so facts spanning chunk boundaries stay visible.
- `stream_proposals` — pulls chunks from any iterable/iterator (e.g. pages
  arriving from the OCR worker as they finish) and yields `StreamEvent`s
  incrementally, so proposals surface in the review inbox while ingestion
  is still running (Technical Spec §3.2 evidence ingestion flow, steps 4-7).

Error containment: a failing chunk emits a `chunk_error` event and the
stream continues with the next chunk — one bad page must not kill a run.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, Iterator, List, Optional, Sequence

from .proposal_pipeline import ChunkExtractionResult, ProposalPipeline, SourceChunk

DEFAULT_MAX_CHARS = 6000
DEFAULT_OVERLAP = 400


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------


def _split_paragraphs(text: str) -> List[str]:
    parts = [raw.strip() for raw in text.replace("\r\n", "\n").split("\n\n")]
    return [p for p in parts if p]


def _find_sentence_end(window: str) -> int:
    best = -1
    for marker in (". ", "! ", "? ", "\n"):
        pos = window.rfind(marker)
        if pos > best:
            best = pos + 1
    return best


def _split_long_paragraph(paragraph: str, max_chars: int) -> List[str]:
    """Split an oversized paragraph at sentence boundaries when possible."""
    pieces: List[str] = []
    remaining = paragraph
    while len(remaining) > max_chars:
        window = remaining[:max_chars]
        cut = _find_sentence_end(window)
        if cut <= max_chars // 2:
            cut = max_chars  # avoid slivers when no sentence boundary found
        pieces.append(remaining[:cut].rstrip())
        remaining = remaining[cut:].lstrip()
    if remaining.strip():
        pieces.append(remaining.strip())
    return pieces


def _tail_overlap(text: str, overlap: int) -> str:
    """Overlap carried from one chunk into the next."""
    if overlap <= 0 or len(text) <= overlap:
        return ""
    return "... " + text[-overlap:]


def chunk_source_text(
    text: str,
    source_id: str,
    *,
    workspace_id: Optional[str] = None,
    matter_id: Optional[str] = None,
    source_title: Optional[str] = None,
    excerpt_ids: Sequence[str] = (),
    max_chars: int = DEFAULT_MAX_CHARS,
    overlap: int = DEFAULT_OVERLAP,
    start_index: int = 0,
) -> Iterator[SourceChunk]:
    """Lazily split source text into bounded, overlap-carrying chunks.

    Guarantees: every emitted chunk's `text` is <= `max_chars`; every
    paragraph of the input appears (in order) in at least one chunk;
    deterministic output for a given input.
    """
    if max_chars <= 0:
        raise ValueError("max_chars must be positive")
    if overlap < 0 or overlap >= max_chars:
        raise ValueError("overlap must be >= 0 and < max_chars")

    if not (text or "").strip():
        return

    # Unitize: paragraphs, with oversized paragraphs pre-split.
    units: List[str] = []
    for paragraph in _split_paragraphs(text):
        if len(paragraph) <= max_chars:
            units.append(paragraph)
        else:
            units.extend(_split_long_paragraph(paragraph, max_chars))

    carried = ""
    index = start_index
    body_parts: List[str] = []
    body_len = 0

    def emit() -> SourceChunk:
        nonlocal index, carried, body_parts, body_len
        body = "\n\n".join(body_parts)
        content = f"{carried}\n{body}" if carried else body
        chunk = SourceChunk(
            source_id=source_id,
            text=content,
            index=index,
            workspace_id=workspace_id,
            matter_id=matter_id,
            source_title=source_title,
            excerpt_ids=tuple(excerpt_ids),
        )
        index += 1
        carried = _tail_overlap(content, overlap)
        body_parts, body_len = [], 0
        return chunk

    for unit in units:
        overhead = len(carried) + 1 if carried else 0  # "\n" separator
        separator = 2 if body_parts else 0
        if body_parts and overhead + body_len + separator + len(unit) > max_chars:
            yield emit()
        if not body_parts:
            # Starting a fresh chunk: verify the unit fits under the carry.
            overhead = len(carried) + 1 if carried else 0
            if overhead + len(unit) > max_chars:
                # Pathological: carry + unit exceed the cap; drop carry.
                carried = ""
            body_parts.append(unit)
            body_len = len(unit)
        else:
            body_parts.append(unit)
            body_len += separator + len(unit)

    if body_parts:
        yield emit()


# ---------------------------------------------------------------------------
# Streaming execution
# ---------------------------------------------------------------------------


@dataclass
class StreamEvent:
    """One notification from a streamed extraction run.

    kinds:
      chunk_start — a chunk was picked up
      proposals   — proposals were stored for a chunk
      chunk_error — the chunk failed; the stream continues
      done        — terminal summary event
    """

    kind: str
    chunk_index: Optional[int] = None
    payload: Dict[str, Any] = field(default_factory=dict)


def _result_payload(result: ChunkExtractionResult) -> Dict[str, Any]:
    return {
        "chunk_index": result.chunk_index,
        "created": [p.to_record() for p in result.created],
        "skipped_duplicates": result.skipped_duplicates,
        "skipped_invalid": list(result.skipped_invalid),
        "manifest": result.manifest,
    }


def stream_proposals(
    pipeline: ProposalPipeline,
    chunks: Iterable[SourceChunk],
    *,
    resume_from: int = 0,
) -> Iterator[StreamEvent]:
    """Stream extraction over `chunks`, yielding events as work completes.

    `resume_from` supports restarting after a crash: chunks with an index
    below it are skipped (their proposals were already persisted, and the
    duplicate-fingerprint check makes replay safe anyway).
    """
    total_created = 0
    total_duplicates = 0
    errors: List[Dict[str, Any]] = []

    for chunk in chunks:
        if chunk.index < resume_from:
            continue
        yield StreamEvent(kind="chunk_start", chunk_index=chunk.index)
        try:
            result = pipeline.extract_from_chunk(chunk)
        except Exception as exc:  # noqa: BLE001 - containment is the point
            errors.append({"chunk_index": chunk.index, "error": str(exc)})
            yield StreamEvent(
                kind="chunk_error",
                chunk_index=chunk.index,
                payload={"error": str(exc)},
            )
            continue
        total_created += len(result.created)
        total_duplicates += result.skipped_duplicates
        yield StreamEvent(kind="proposals", chunk_index=chunk.index, payload=_result_payload(result))

    yield StreamEvent(
        kind="done",
        payload={
            "created": total_created,
            "skipped_duplicates": total_duplicates,
            "chunk_errors": errors,
        },
    )


def run_stream_to_completion(
    pipeline: ProposalPipeline,
    chunks: Iterable[SourceChunk],
    *,
    resume_from: int = 0,
) -> Dict[str, Any]:
    """Convenience wrapper: drain the stream and return the `done` summary."""
    summary: Dict[str, Any] = {"created": 0, "skipped_duplicates": 0, "chunk_errors": []}
    for event in stream_proposals(pipeline, chunks, resume_from=resume_from):
        if event.kind == "done":
            summary = event.payload
    return summary
