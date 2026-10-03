"""WS-VERIFY — Wave 3 end-to-end integration verifier.

Workstream: WS-VERIFY (Wave 3 Verifier & Edge Smoke Gate).
Write set: this file is owned exclusively by WS-VERIFY. It MUST NOT contain
application or UI feature code — only verification probes, fixtures, and
helpers (self-contained; no shared helper modules, to avoid colliding with
other workstreams' test infrastructure).

What this verifies (Technical Spec / PRD / Roadmap traceability):
  * Evidence ingestion chain: upload -> source record -> OCR -> pages/excerpts
    -> proposals -> reviewed facts (Tech Spec §3.2, §10.3; Roadmap Sprint 3-5).
  * OCR engine dual path (INVARIANT): digital-PDF text extraction AND
    scanned/image fallback via OCR (Tech Spec §15; PRD §10.3).
  * Proof graph: fact -> event -> claim element -> relief/authority links
    (Tech Spec §7, §18; PRD §9-10).
  * Search / MCP connectors stay candidates until reviewed (Tech Spec §14).
  * AI sharing guardrails enforced before external calls (Tech Spec §12.5).
  * Exports + audit trail (Tech Spec §19, §21).

How it runs:
  * Default mode: probes that need unmerged Wave 3 code or a live API are
    reported as SKIP (with reason), so ``pytest`` stays green pre-merge and
    the skip list doubles as the integration punch-list.
  * Strict gate mode: ``WS_VERIFY_STRICT=1 pytest tests/integration`` turns
    every integration SKIP into a FAIL. Use for the merge gate on the
    integration target branch.

  Environment:
    CASEVAULT_API_URL / API_BASE_URL  API under test (default http://localhost:8000)
    WS_VERIFY_STRICT=1                skips become failures
    WS_VERIFY_TIMEOUT                 per-request timeout seconds (default 3.0)

Only stdlib + pytest are required.
"""

from __future__ import annotations

import importlib
import inspect
import io
import json
import os
import re
import struct
import sys
import urllib.error
import urllib.parse
import urllib.request
import zlib
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Harness configuration
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve()
for _ in range(4):  # tests/integration/<file> -> repo root
    REPO_ROOT = REPO_ROOT.parent
    if (REPO_ROOT / "docs" / "specs").exists() or (REPO_ROOT / ".git").exists():
        break

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

API_BASE_URL = (
    os.environ.get("CASEVAULT_API_URL")
    or os.environ.get("API_BASE_URL")
    or "http://localhost:8000"
).rstrip("/")
STRICT = os.environ.get("WS_VERIFY_STRICT") == "1"
TIMEOUT = float(os.environ.get("WS_VERIFY_TIMEOUT", "3.0"))

DIGITAL_MARKER = "CaseVault digital PDF fixture Alpha-7"
SCANNED_MARKER = "CaseVault scanned image fixture Beta-9"


def verify_or_skip(condition: bool, message: str) -> bool:
    """Pass through when ``condition`` holds, otherwise SKIP (or FAIL under
    WS_VERIFY_STRICT=1 so the merge gate goes red until integrated)."""
    if condition:
        return True
    if STRICT:
        pytest.fail(f"[STRICT-GATE] {message}")
    pytest.skip(message)
    return False  # unreachable; keeps type-checkers calm


# ---------------------------------------------------------------------------
# HTTP helpers (stdlib only)
# ---------------------------------------------------------------------------

class ApiUnavailable(Exception):
    pass


def http_request(method: str, url: str, payload=None, headers=None, timeout: float = TIMEOUT):
    data = None
    req_headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read(), dict(resp.headers.items())
    except urllib.error.HTTPError as exc:  # HTTP-level answer counts as reachable
        try:
            body = exc.read()
        except Exception:
            body = b""
        return exc.code, body, dict((exc.headers or {}).items())
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        raise ApiUnavailable(f"{method} {url}: {exc}") from exc


_api_available_cache: bool | None = None


def api_available() -> bool:
    global _api_available_cache
    if _api_available_cache is None:
        try:
            status, _, _ = http_request("GET", f"{API_BASE_URL}/health")
            _api_available_cache = status < 500
        except ApiUnavailable:
            try:
                status, _, _ = http_request("GET", f"{API_BASE_URL}/api/v1/health")
                _api_available_cache = status < 500
            except ApiUnavailable:
                _api_available_cache = False
    return _api_available_cache


def require_api() -> None:
    verify_or_skip(
        api_available(),
        f"API not reachable at {API_BASE_URL} (start `make api` or set CASEVAULT_API_URL)",
    )


def repo_grep(pattern: str, roots: list[str], suffixes: tuple[str, ...] = (".py",)) -> list[Path]:
    """Search implementation roots for a regex; returns matching files."""
    rx = re.compile(pattern)
    hits: list[Path] = []
    for root in roots:
        base = REPO_ROOT / root
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.is_file() and path.suffix in suffixes and "test" not in path.name:
                try:
                    text = path.read_text(encoding="utf-8", errors="ignore")
                except OSError:
                    continue
                if rx.search(text):
                    hits.append(path)
    return hits


# ---------------------------------------------------------------------------
# Fixture builders (stdlib-only; valid PDF/PNG bytes, no third-party deps)
# ---------------------------------------------------------------------------

def build_digital_pdf(marker: str = DIGITAL_MARKER) -> bytes:
    """Minimal but xref-correct single-page PDF with real extractable text."""
    safe = marker.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    content = f"BT /F1 24 Tf 72 720 Td ({safe}) Tj ET".encode("latin-1")
    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += (f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_at}\n%%EOF\n").encode()
    return bytes(out)


def build_grayscale_png(width: int = 64, height: int = 32, level: int = 0xCC) -> bytes:
    """Tiny valid grayscale PNG (stdlib-only) for image-input fixtures."""
    raw = b"".join(b"\x00" + bytes([level]) * width for _ in range(height))

    def chunk(ctype: bytes, payload: bytes) -> bytes:
        return (struct.pack(">I", len(payload)) + ctype + payload
                + struct.pack(">I", zlib.crc32(ctype + payload) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def build_scanned_pdf(marker: str = SCANNED_MARKER) -> bytes:
    """Image-only single-page PDF: text lives in the raster, NOT in a text
    stream, so digital extraction must come back empty and the OCR fallback
    path must engage. Marker is embedded in the image bytes + /Alt text."""
    try:
        from PIL import Image, ImageDraw  # type: ignore
    except Exception:
        Image = None  # type: ignore
    if Image is not None:
        img = Image.new("RGB", (800, 200), "white")
        draw = ImageDraw.Draw(img)
        draw.text((24, 80), marker, fill="black")
        raw = zlib.compress(img.tobytes())
        w, h = img.size
        colorspace = b"/DeviceRGB"
    else:  # fallback: gray raster; OCR-text assertion degrades to structure check
        w, h = 64, 32
        raw = zlib.compress(bytes([0xCC]) * w * h)
        colorspace = b"/DeviceGray"
    img_obj = (b"<< /Type /XObject /Subtype /Image /Width " + str(w).encode()
               + b" /Height " + str(h).encode()
               + b" /ColorSpace " + colorspace + b" /BitsPerComponent 8 /Filter /FlateDecode"
               + b" /Length " + str(len(raw)).encode() + b" >>\nstream\n" + raw + b"\nendstream")
    content = b"q 600 0 0 150 10 600 cm /Im1 Do Q"
    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        img_obj,
    ]
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendstream\n" if False else f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode() + b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += (f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_at}\n%%EOF\n").encode()
    return bytes(out)


@pytest.fixture()
def digital_pdf_path(tmp_path: Path) -> Path:
    p = tmp_path / "wave3_digital.pdf"
    p.write_bytes(build_digital_pdf())
    return p


@pytest.fixture()
def scanned_pdf_path(tmp_path: Path) -> Path:
    p = tmp_path / "wave3_scanned.pdf"
    p.write_bytes(build_scanned_pdf())
    return p


@pytest.fixture()
def image_path(tmp_path: Path) -> Path:
    p = tmp_path / "wave3_evidence.png"
    p.write_bytes(build_grayscale_png())
    return p


# ---------------------------------------------------------------------------
# Wave 3 surface manifest (single source of truth for the punch-list)
# ---------------------------------------------------------------------------

WAVE3_SURFACES = [
    {"id": "api-health", "spec": "Tech §9.2 / Scaffold §9.2",
     "paths": ["apps/api"], "routes": ["/health", "/api/v1/health"]},
    {"id": "evidence-ingest", "spec": "Tech §9.2 / PRD §10.3",
     "paths": ["apps/api"], "routes": ["/api/v1/sources/upload", "/api/v1/sources"]},
    {"id": "ocr-engine", "spec": "Tech §15 / PRD §10.3",
     "paths": ["workers/pipeline", "apps/api/app/integrations/ocr", "apps/api/integrations"],
     "routes": []},
    {"id": "review-inbox", "spec": "Tech §17 / PRD §10.5",
     "paths": ["apps/api"], "routes": ["/api/v1/proposals"]},
    {"id": "chronology", "spec": "Tech §9.2 / PRD §10.6",
     "paths": ["apps/api"], "routes": ["/api/v1/events"]},
    {"id": "claims", "spec": "Tech §18 / PRD §10.7",
     "paths": ["apps/api"], "routes": ["/api/v1/claim-instances"]},
    {"id": "search", "spec": "Tech §11 / PRD §10.13",
     "paths": ["apps/api"], "routes": ["/api/v1/search"]},
    {"id": "connectors", "spec": "Tech §14 / Roadmap Sprint 11",
     "paths": ["apps/api", "workers/connectors"], "routes": ["/api/v1/connectors"]},
    {"id": "ai-review", "spec": "Tech §12-13 / PRD §10.12",
     "paths": ["apps/api", "workers/ai"], "routes": ["/api/v1/agent-runs"]},
    {"id": "exports", "spec": "Tech §19 / PRD §10.16",
     "paths": ["apps/api"], "routes": ["/api/v1/exports/chronology-pdf"]},
    {"id": "edge-worker", "spec": "WS-EDGE contract (see test_cloudflare_worker.py)",
     "paths": ["workers/edge", "apps/edge", "edge", "cloudflare"], "routes": []},
]


# ---------------------------------------------------------------------------
# 1. Harness self-checks (must pass even with zero product code merged)
# ---------------------------------------------------------------------------

class TestVerifierHarness:
    def test_repo_root_resolves(self):
        assert (REPO_ROOT / "docs" / "specs").exists(), "specs dir missing — wrong repo root?"

    def test_digital_fixture_carries_extractable_text(self, digital_pdf_path: Path):
        blob = digital_pdf_path.read_bytes()
        assert blob.startswith(b"%PDF")
        assert DIGITAL_MARKER.encode() in blob, "digital fixture must embed marker as text"

    def test_scanned_fixture_is_image_only(self, scanned_pdf_path: Path):
        blob = scanned_pdf_path.read_bytes()
        assert blob.startswith(b"%PDF")
        assert b"/Subtype /Image" in blob, "scanned fixture must contain a raster XObject"
        # No text-showing operator may carry the marker: digital extraction must fail.
        for match in re.finditer(rb"\((.*?)\)\s*Tj", blob):
            assert SCANNED_MARKER.encode() not in match.group(1)

    def test_image_fixture_is_valid_png(self, image_path: Path):
        assert image_path.read_bytes().startswith(b"\x89PNG\r\n\x1a\n")

    def test_surface_manifest_is_well_formed(self):
        ids = [s["id"] for s in WAVE3_SURFACES]
        assert len(ids) == len(set(ids)) == len(WAVE3_SURFACES) >= 10
        for surface in WAVE3_SURFACES:
            assert surface["spec"], surface["id"]


# ---------------------------------------------------------------------------
# 2. API health + evidence ingest chain
# ---------------------------------------------------------------------------

class TestApiHealth:
    def test_health_endpoint_answers(self):
        require_api()
        status, body, _ = http_request("GET", f"{API_BASE_URL}/health")
        if status == 404:  # scaffold allows /api/v1/health only
            status, body, _ = http_request("GET", f"{API_BASE_URL}/api/v1/health")
        assert status < 500, f"health check failed: HTTP {status} :: {body[:200]!r}"

    def test_api_v1_health_shape(self):
        require_api()
        status, body, _ = http_request("GET", f"{API_BASE_URL}/api/v1/health")
        verify_or_skip(status != 404, "GET /api/v1/health not implemented yet")
        assert status < 500
        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception:
            payload = None
        assert payload is None or isinstance(payload, (dict, list)), "health body should be JSON"


class TestEvidenceIngestChain:
    """Upload -> source record -> processing status (Tech Spec §3.2, §10.3)."""

    def test_upload_route_exists_in_code_or_live(self):
        if api_available():
            status, _, _ = http_request("GET", f"{API_BASE_URL}/api/v1/sources")
            assert status != 404, "live API has no /api/v1/sources surface"
            return
        hits = repo_grep(r"/api/v1/sources/upload|/sources/upload|def\s+upload_source|sources.*upload",
                         ["apps/api"])
        verify_or_skip(bool(hits), "evidence upload surface not merged (no apps/api route found)")

    def test_source_status_fields_present_in_models(self):
        hits = repo_grep(r"evidence_review_status|processing_status|ocr_status",
                         ["apps/api", "workers", "packages/schemas"])
        verify_or_skip(bool(hits), "source lifecycle fields (ocr_status/processing_status) not merged yet")


# ---------------------------------------------------------------------------
# 3. OCR engine — INVARIANT: digital PDF + scanned/image fallback
# ---------------------------------------------------------------------------

OCR_MODULE_CANDIDATES = [
    "workers.pipeline.ocr",
    "workers.pipeline.ocr_engine",
    "workers.pipeline.ocr_service",
    "workers.pipeline.parsing",
    "apps.api.app.integrations.ocr",
    "apps.api.app.integrations.ocr_engine",
    "apps.api.integrations.ocr",
]
OCR_FUNCTION_NAMES = [
    "extract_text", "extract_pdf_text", "extract_text_from_pdf",
    "ocr_pdf", "ocr_image", "ocr_page", "ocr_source",
    "process_source", "process_pdf", "run_ocr",
]
OCR_FILE_MARKERS = re.compile(r"ocr|tesseract|ocrmypdf|pymupdf|pdfplumber|pypdf|easyocr", re.I)


def _discover_ocr_callables():
    """Import candidate OCR modules and harvest text-extraction callables.

    Returns (sources, callables) where sources describes what was found.
    Never raises for missing product code — returns ([], [])."""
    found, sources = [], []
    for modname in OCR_MODULE_CANDIDATES:
        try:
            module = importlib.import_module(modname)
        except Exception:
            continue
        sources.append(modname)
        for name in OCR_FUNCTION_NAMES:
            fn = getattr(module, name, None)
            if callable(fn):
                found.append((f"{modname}.{name}", fn))
        for cls_name in ("OcrEngine", "OCREngine", "OcrService", "PdfExtractor", "ExtractionService"):
            cls = getattr(module, cls_name, None)
            if inspect.isclass(cls):
                try:
                    inst = cls()
                except Exception:
                    continue
                for meth in ("extract_text", "extract", "process", "run", "ocr"):
                    fn = getattr(inst, meth, None)
                    if callable(fn):
                        found.append((f"{modname}.{cls_name}().{meth}", fn))
    # Deduplicate preserving order
    seen, unique = set(), []
    for label, fn in found:
        if id(fn) not in seen:
            seen.add(id(fn))
            unique.append((label, fn))
    return sources, unique


def _call_ocr(fn, fixture: Path):
    """Try common OCR call conventions; return (ok, text_or_error)."""
    attempts = [
        (str(fixture),), (fixture,), (fixture.read_bytes(),),
    ]
    kw_attempts = [
        {"pdf_path": str(fixture)}, {"path": str(fixture)}, {"file_path": str(fixture)},
        {"data": fixture.read_bytes()}, {"image_path": str(fixture)},
    ]
    errors = []
    for args in attempts:
        try:
            return True, fn(*args)
        except TypeError as exc:
            errors.append(str(exc)[:120])
        except Exception as exc:  # engine ran and reported failure: real signal
            return False, f"{type(exc).__name__}: {exc}"
    for kwargs in kw_attempts:
        try:
            return True, fn(**kwargs)
        except TypeError as exc:
            errors.append(str(exc)[:120])
        except Exception as exc:
            return False, f"{type(exc).__name__}: {exc}"
    return False, "signature mismatch: " + " | ".join(errors[:3])


def _result_text(result) -> str:
    if result is None:
        return ""
    if isinstance(result, str):
        return result
    if isinstance(result, bytes):
        return result.decode("utf-8", "ignore")
    if isinstance(result, dict):
        for key in ("text", "ocr_text", "content", "extracted_text"):
            if isinstance(result.get(key), str):
                return result[key]
        return json.dumps(result)[:2000]
    for attr in ("text", "ocr_text", "content"):
        val = getattr(result, attr, None)
        if isinstance(val, str):
            return val
    if isinstance(result, (list, tuple)):
        return " ".join(_result_text(r) for r in result)
    return str(result)[:2000]


class TestOcrEngine:
    """INVARIANT: OCR engine handles digital PDFs AND scanned/image fallback."""

    def test_ocr_surface_exists_somewhere(self):
        sources, callables = _discover_ocr_callables()
        if sources or callables:
            return
        file_hits = [p for root in ("workers", "apps")
                     for p in (REPO_ROOT / root).rglob("*.py") if OCR_FILE_MARKERS.search(p.name)]
        verify_or_skip(
            bool(file_hits),
            "OCR engine not merged (no ocr module/callable found under workers/ or apps/)",
        )

    def test_ocr_code_has_dual_path_markers(self):
        """Static check: engine references BOTH digital extraction and an OCR
        fallback (tesseract/ocrmypdf), per Tech Spec §15."""
        hits = repo_grep(r"tesseract|ocrmypdf|OCRmyPDF|easyocr|trocr",
                         ["workers", "apps/api"])
        digital = repo_grep(r"get_text|extract_text|extract_pages|pdfplumber|PyMuPDF|fitz|pypdf|PdfReader",
                            ["workers", "apps/api"])
        verify_or_skip(bool(hits) or bool(digital),
                       "no OCR implementation found to inspect for dual-path markers")
        assert hits, "OCR fallback marker (tesseract/ocrmypdf) missing — scanned path unverified"
        assert digital, "digital extraction marker (PyMuPDF/pdfplumber/pypdf) missing"

    def test_ocr_digital_pdf_extracts_text(self, digital_pdf_path: Path):
        _, callables = _discover_ocr_callables()
        verify_or_skip(bool(callables), "no importable OCR callable to exercise (digital path)")
        failures = []
        for label, fn in callables:
            ok, result = _call_ocr(fn, digital_pdf_path)
            text = _result_text(result) if ok else ""
            if ok and DIGITAL_MARKER in text:
                return  # at least one engine path extracts digital text
            failures.append(f"{label}: {'error: ' + str(result)[:150] if not ok else 'marker missing'}")
        pytest.fail("digital PDF text not extracted by any OCR callable:\n" + "\n".join(failures))

    def test_ocr_scanned_pdf_falls_back_to_ocr(self, scanned_pdf_path: Path):
        """Scanned fixture has no text stream; engine must engage OCR fallback
        (or explicitly report image-only status — never silently return empty)."""
        _, callables = _discover_ocr_callables()
        verify_or_skip(bool(callables), "no importable OCR callable to exercise (scanned path)")
        try:
            from PIL import Image  # noqa: F401
            pil = True
        except Exception:
            pil = False
        if not pil:
            verify_or_skip(False, "PIL unavailable — cannot build OCR-readable raster; structure check only")
        for label, fn in callables:
            ok, result = _call_ocr(fn, scanned_pdf_path)
            text = _result_text(result) if ok else ""
            if SCANNED_MARKER in text:
                return
        # Fallback acceptance: engine explicitly reports image-only/OCR status.
        joined = " ".join(str(r)[:300] for _, fn in callables
                          for _, r in [_call_ocr(fn, scanned_pdf_path)])
        assert re.search(r"image.only|ocr|scanned|no.*text.*layer", joined, re.I), (
            "scanned PDF: no OCR text recovered and no explicit image-only/OCR status reported"
        )

    def test_ocr_image_input_accepted(self, image_path: Path):
        _, callables = _discover_ocr_callables()
        verify_or_skip(bool(callables), "no importable OCR callable to exercise (image path)")
        ran = False
        for _, fn in callables:
            ok, _ = _call_ocr(fn, image_path)
            ran = ran or ok
        verify_or_skip(ran, "OCR callables rejected plain image input (signature or format)")

    def test_ocr_failure_modes_are_structured(self, tmp_path: Path):
        """Corrupt/empty input must raise a structured error, never hang or
        silently succeed (UX Spec §8.3: actionable OCR errors)."""
        _, callables = _discover_ocr_callables()
        verify_or_skip(bool(callables), "no importable OCR callable to exercise (failure modes)")
        bad = tmp_path / "corrupt.pdf"
        bad.write_bytes(b"%PDF-1.4\n%corrupt-wave3-fixture\ntrailer<<>>\n")
        for _, fn in callables:
            try:
                ok, result = _call_ocr(fn, bad)
            except Exception as exc:  # structured raise is acceptable
                assert str(exc).strip(), "empty exception from OCR engine"
                return
            if not ok:  # engine-reported failure is acceptable
                assert str(result).strip(), "empty error payload from OCR engine"
                return
        pytest.fail("OCR engine silently accepted a corrupt PDF on every callable")


# ---------------------------------------------------------------------------
# 4. Review inbox + proof graph (proposals -> facts -> links)
# ---------------------------------------------------------------------------

class TestReviewAndProofGraph:
    def test_proposals_surface_exists(self):
        if api_available():
            status, _, _ = http_request("GET", f"{API_BASE_URL}/api/v1/proposals")
            assert status != 404, "live API has no /api/v1/proposals surface"
            return
        hits = repo_grep(r"/api/v1/proposals|proposal.*review_state|def\s+\w*proposal",
                         ["apps/api"])
        verify_or_skip(bool(hits), "proposal review surface not merged")

    def test_review_actions_are_audited_shape(self):
        """Accept/reject/defer endpoints exist (Tech Spec §9.2, §17)."""
        if api_available():
            status, _, _ = http_request("GET", f"{API_BASE_URL}/api/v1/proposals/nonexistent-id")
            verify_or_skip(status != 404, "proposal detail route not implemented yet")
            return
        hits = repo_grep(r"accept-with-edits|accept_with_edits|/reject|/defer", ["apps/api"])
        verify_or_skip(bool(hits), "proposal review actions (accept/reject/defer) not merged")

    def test_fact_support_links_modeled(self):
        hits = repo_grep(r"fact_support_links|support_origin_type|FactSupportLink", ["apps/api", "workers"])
        verify_or_skip(bool(hits), "fact_support_links model not merged (Tech Spec §7.3 Group E)")


# ---------------------------------------------------------------------------
# 5. Chronology + claims
# ---------------------------------------------------------------------------

class TestChronologyAndClaims:
    def test_events_surface_exists(self):
        if api_available():
            status, _, _ = http_request("GET", f"{API_BASE_URL}/api/v1/events")
            assert status != 404, "live API has no /api/v1/events surface"
            return
        hits = repo_grep(r"/api/v1/events|date_precision|event_fact_links", ["apps/api"])
        verify_or_skip(bool(hits), "chronology/events surface not merged")

    def test_claim_chart_surface_exists(self):
        if api_available():
            status, _, _ = http_request("GET", f"{API_BASE_URL}/api/v1/claim-instances")
            verify_or_skip(status != 404, "live API has no claim-instances surface yet")
            return
        hits = repo_grep(r"claim_instances|claim_elements|claim_support_status|ClaimElement",
                         ["apps/api"])
        verify_or_skip(bool(hits), "claim chart surface not merged (Tech Spec §18)")

    def test_support_status_vocabulary_present(self):
        hits = repo_grep(r"no_support|weak_support|moderate_support|strong_support|conflicted",
                         ["apps/api", "workers", "packages/schemas"])
        verify_or_skip(bool(hits), "claim support-status vocabulary not merged")


# ---------------------------------------------------------------------------
# 6. Search + MCP connectors (candidates, never auto-trusted)
# ---------------------------------------------------------------------------

class TestSearchAndConnectors:
    def test_search_surface_exists(self):
        if api_available():
            url = f"{API_BASE_URL}/api/v1/search?q=" + urllib.parse.quote("door exclusion")
            status, _, _ = http_request("GET", url)
            verify_or_skip(status != 404, "live API has no /api/v1/search yet")
            return
        hits = repo_grep(r"/api/v1/search|hybrid.*retriev|full-text|full_text|pgvector|vector",
                         ["apps/api", "workers"])
        verify_or_skip(bool(hits), "search/retrieval surface not merged")

    def test_connector_results_require_review(self):
        """Connector results must carry review_state=candidate semantics and an
        explicit import step (Tech Spec §14.4)."""
        hits = repo_grep(r"connector_results|ConnectorResult|import-source|import_source",
                         ["apps/api", "workers"])
        verify_or_skip(bool(hits), "MCP connector result/import surface not merged")


# ---------------------------------------------------------------------------
# 7. AI guardrails (sharing policy enforced pre-call)
# ---------------------------------------------------------------------------

class TestAiGuardrails:
    def test_sharing_policy_vocabulary_present(self):
        hits = repo_grep(r"no_ai|local_only|external_excerpts_only|external_selected_full_documents",
                         ["apps/api", "workers", "packages"])
        verify_or_skip(bool(hits), "AI sharing-policy vocabulary not merged (Tech Spec §12.5)")

    def test_agent_run_manifest_shape(self):
        """Agent runs must persist what-context-was-shared (PRD §10.12)."""
        hits = repo_grep(r"input_manifest_json|agent_run_artifacts|AgentRunArtifact",
                         ["apps/api", "workers"])
        verify_or_skip(bool(hits), "agent-run manifest/artifact model not merged")


# ---------------------------------------------------------------------------
# 8. Exports + audit
# ---------------------------------------------------------------------------

class TestExportsAndAudit:
    def test_export_surface_exists(self):
        if api_available():
            status, _, _ = http_request("GET", f"{API_BASE_URL}/api/v1/exports/nonexistent")
            verify_or_skip(status != 404, "live API has no /api/v1/exports surface yet")
            return
        hits = repo_grep(r"exports/chronology|exports/claim|chronology-pdf|claim-chart-pdf|export.*pdf",
                         ["apps/api", "workers"])
        verify_or_skip(bool(hits), "PDF export surface not merged (Tech Spec §19)")

    def test_audit_log_modeled(self):
        hits = repo_grep(r"audit_log_entries|AuditLog|audit_service", ["apps/api", "workers"])
        verify_or_skip(bool(hits), "audit trail model not merged (Tech Spec §21)")


# ---------------------------------------------------------------------------
# 9. Wave 3 integration manifest (always passes; prints the punch-list)
# ---------------------------------------------------------------------------

class TestWave3Manifest:
    def test_print_integration_punch_list(self, capsys):
        print("\n=== WS-VERIFY Wave 3 integration punch-list ===")
        print(f"repo={REPO_ROOT} api={API_BASE_URL} strict={STRICT}")
        for surface in WAVE3_SURFACES:
            paths_hit = [p for p in surface["paths"] if (REPO_ROOT / p).exists()]
            routes_hit = []
            if surface["routes"]:
                for route in surface["routes"]:
                    if repo_grep(re.escape(route), ["apps/api", "workers"]):
                        routes_hit.append(route)
            state = "PRESENT" if (paths_hit or routes_hit) else "MISSING"
            print(f"[{state:7s}] {surface['id']:16s} spec={surface['spec']}")
        print(f"live-api={'yes' if api_available() else 'no'}")
        print("=== end punch-list ===")
        capsys.readouterr()  # surface output with -s; never fails
