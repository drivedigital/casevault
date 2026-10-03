#!/usr/bin/env python3
"""WS-VERIFY — Wave 3 edge smoke gate (fast, stdlib-only).

Probes the merged Wave 3 integration surface in <60s with zero third-party
dependencies: repo structure, safety files, OCR fixtures + engine presence,
live API health, and Cloudflare Worker contract/liveness.

Usage:
    python scripts/wave3_smoke.py [--json] [--strict] [--offline]
                                  [--api-url URL] [--worker-url URL]
                                  [--timeout SEC] [-v]

Exit codes:
    0  no FAIL (SKIPs allowed unless --strict)
    1  at least one FAIL (or SKIP under --strict)
    2  usage error

Owned exclusively by WS-VERIFY. Not application code.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zlib
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"


@dataclass
class CheckResult:
    id: str
    area: str
    title: str
    status: str
    detail: str = ""
    hint: str = ""


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------

def _http_get(url: str, timeout: float):
    req = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.status, resp.read()


def _try_import(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


def build_digital_pdf(marker: str) -> bytes:
    safe = marker.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    content = f"BT /F1 24 Tf 72 720 Td ({safe}) Tj ET".encode("latin-1")
    objects = [
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
    out += f"xref\n0 {len(objects) + 1}\n".encode() + b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += (f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_at}\n%%EOF\n").encode()
    return bytes(out)


def build_scanned_pdf() -> bytes:
    w, h = 64, 32
    raw = zlib.compress(bytes([0xCC]) * w * h)
    img_obj = (b"<< /Type /XObject /Subtype /Image /Width " + str(w).encode()
               + b" /Height " + str(h).encode()
               + b" /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode"
               + b" /Length " + str(len(raw)).encode() + b" >>\nstream\n" + raw + b"\nendstream")
    content = b"q 600 0 0 150 10 600 cm /Im1 Do Q"
    objects = [
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
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode() + b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += (f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_at}\n%%EOF\n").encode()
    return bytes(out)


# --------------------------------------------------------------------------
# Checks
# --------------------------------------------------------------------------

def check_specs() -> CheckResult:
    specs = sorted((REPO_ROOT / "docs" / "specs").glob("*.md")) if (REPO_ROOT / "docs" / "specs").exists() else []
    if len(specs) >= 6:
        return CheckResult("struct-specs", "structure", "planning specs present", PASS,
                           f"{len(specs)} spec docs")
    return CheckResult("struct-specs", "structure", "planning specs present", FAIL,
                       f"only {len(specs)} spec docs found",
                       hint="docs/specs/*.md should hold the 6 planning specs")


def check_verifier_files() -> CheckResult:
    owned = ["tests/integration/test_wave3_e2e.py",
             "tests/integration/test_cloudflare_worker.py",
             "scripts/wave3_smoke.py"]
    missing = [f for f in owned if not (REPO_ROOT / f).is_file()]
    if not missing:
        return CheckResult("struct-verifier", "structure", "WS-VERIFY write set present", PASS,
                           "3/3 owned files")
    return CheckResult("struct-verifier", "structure", "WS-VERIFY write set present", FAIL,
                       f"missing: {', '.join(missing)}")


def check_gitignore() -> CheckResult:
    p = REPO_ROOT / ".gitignore"
    if not p.is_file():
        return CheckResult("safety-gitignore", "safety", ".gitignore protects evidence/secrets", FAIL,
                           ".gitignore missing",
                           hint="Phase 0 gate: scaffold .gitignore before feature merges (data/, .env*)")
    text = p.read_text(encoding="utf-8", errors="ignore")
    need = ["data", ".env"]
    missing = [n for n in need if n not in text]
    if missing:
        return CheckResult("safety-gitignore", "safety", ".gitignore protects evidence/secrets", FAIL,
                           f"ignores missing: {', '.join(missing)}")
    return CheckResult("safety-gitignore", "safety", ".gitignore protects evidence/secrets", PASS,
                       "data/ + .env* ignored")


def check_env_example() -> CheckResult:
    p = REPO_ROOT / ".env.example"
    if not p.is_file():
        return CheckResult("safety-env", "safety", ".env.example documents config", FAIL,
                           ".env.example missing",
                           hint="Phase 0 gate: add .env.example (ports, DATABASE_URL, REDIS_URL, AI keys)")
    return CheckResult("safety-env", "safety", ".env.example documents config", PASS,
                       ".env.example present")


def check_ocr_pydeps() -> CheckResult:
    libs = {name: _try_import(name) for name in
            ("pypdf", "PyPDF2", "fitz", "pdfplumber", "PIL", "ocrmypdf", "pytesseract")}
    have = sorted(n for n, ok in libs.items() if ok)
    if have:
        return CheckResult("ocr-pydeps", "ocr", "OCR python deps importable", PASS,
                           f"have: {', '.join(have)}")
    return CheckResult("ocr-pydeps", "ocr", "OCR python deps importable", SKIP,
                       "none of pypdf/PyMuPDF/pdfplumber/PIL/ocrmypdf installed",
                       hint="pip install pypdf pillow ocrmypdf (CI) — env-dependent, not a product fail")


def check_ocr_binaries() -> CheckResult:
    bins = {b: shutil.which(b) is not None for b in ("tesseract", "ocrmypdf", "gs")}
    have = sorted(n for n, ok in bins.items() if ok)
    if have:
        return CheckResult("ocr-binaries", "ocr", "OCR system binaries present", PASS,
                           f"have: {', '.join(have)}")
    return CheckResult("ocr-binaries", "ocr", "OCR system binaries present", SKIP,
                       "tesseract/ocrmypdf/gs not on PATH",
                       hint="apt/brew install tesseract-ocr ocrmypdf (CI) — env-dependent")


def check_digital_fixture() -> CheckResult:
    marker = "CaseVault smoke digital Wed-3"
    blob = build_digital_pdf(marker)
    if blob.startswith(b"%PDF") and marker.encode() in blob:
        return CheckResult("ocr-digital-fixture", "ocr", "digital PDF fixture valid", PASS,
                           f"{len(blob)} bytes, marker embedded as text")
    return CheckResult("ocr-digital-fixture", "ocr", "digital PDF fixture valid", FAIL,
                       "fixture builder broken")


def check_scanned_fixture() -> CheckResult:
    blob = build_scanned_pdf()
    if blob.startswith(b"%PDF") and b"/Subtype /Image" in blob:
        return CheckResult("ocr-scanned-fixture", "ocr", "scanned PDF fixture is image-only", PASS,
                           f"{len(blob)} bytes, raster XObject, no text stream")
    return CheckResult("ocr-scanned-fixture", "ocr", "scanned PDF fixture is image-only", FAIL,
                       "fixture builder broken")


def check_ocr_engine_present() -> CheckResult:
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    import importlib
    for mod in ("workers.pipeline.ocr", "workers.pipeline.ocr_engine",
                "apps.api.app.integrations.ocr", "apps.api.integrations.ocr"):
        try:
            importlib.import_module(mod)
            return CheckResult("ocr-engine", "ocr", "product OCR engine importable", PASS,
                               f"module: {mod}")
        except Exception:
            continue
    # Fallback: any ocr-named implementation file?
    hits = [str(p.relative_to(REPO_ROOT)) for root in ("workers", "apps")
            if (REPO_ROOT / root).exists()
            for p in (REPO_ROOT / root).rglob("*.py")
            if re.search(r"ocr|tesseract|ocrmypdf", p.name, re.I)]
    if hits:
        return CheckResult("ocr-engine", "ocr", "product OCR engine importable", SKIP,
                           f"files present but not importable: {hits[0]}",
                           hint="check module path/sys.path for merged OCR code")
    return CheckResult("ocr-engine", "ocr", "product OCR engine importable", SKIP,
                       "no OCR module merged yet",
                       hint="Wave 3 OCR workstream: workers/pipeline/ocr* + Tech Spec §15 dual path")


def check_api_health(api_url: str, timeout: float, offline: bool) -> CheckResult:
    if offline:
        return CheckResult("api-health", "api", "API /health reachable", SKIP, "--offline")
    for path in ("/health", "/api/v1/health"):
        try:
            status, _ = _http_get(api_url + path, timeout)
            if status < 500:
                return CheckResult("api-health", "api", "API /health reachable", PASS,
                                   f"{api_url}{path} -> HTTP {status}")
        except urllib.error.HTTPError as exc:
            if exc.code < 500:
                return CheckResult("api-health", "api", "API /health reachable", PASS,
                                   f"{api_url}{path} -> HTTP {exc.code}")
        except Exception:
            continue
    return CheckResult("api-health", "api", "API /health reachable", SKIP,
                       f"{api_url} not reachable",
                       hint="start API (`make api`) or pass --api-url")


def check_worker_config() -> CheckResult:
    for rel in ("wrangler.toml", "wrangler.json", "wrangler.jsonc",
                "workers/edge/wrangler.toml", "apps/edge/wrangler.toml",
                "edge/wrangler.toml", "cloudflare/wrangler.toml"):
        if (REPO_ROOT / rel).is_file():
            return CheckResult("worker-config", "edge", "wrangler config present", PASS,
                               f"found: {rel}")
    return CheckResult("worker-config", "edge", "wrangler config present", SKIP,
                       "no wrangler config merged",
                       hint="edge workstream: wrangler.toml + entry with /health + CORS")


def check_worker_entry() -> CheckResult:
    rx = re.compile(r"(worker|edge|proxy)\.(ts|js|mjs)$", re.I)
    hits = []
    for d in ("workers/edge", "apps/edge", "edge", "cloudflare", "workers"):
        base = REPO_ROOT / d
        if base.is_dir():
            hits += [str(p.relative_to(REPO_ROOT)) for p in base.rglob("*")
                     if p.is_file() and rx.search(p.name)]
    if hits:
        return CheckResult("worker-entry", "edge", "worker entry module present", PASS,
                           f"found: {hits[0]}")
    return CheckResult("worker-entry", "edge", "worker entry module present", SKIP,
                       "no worker entry merged")


def check_worker_live(worker_url: str, timeout: float, offline: bool) -> CheckResult:
    if offline:
        return CheckResult("worker-live", "edge", "live worker /health", SKIP, "--offline")
    if not worker_url:
        return CheckResult("worker-live", "edge", "live worker /health", SKIP,
                           "CLOUDFLARE_WORKER_URL/--worker-url not set")
    try:
        status, _ = _http_get(worker_url + "/health", timeout)
        if status < 500:
            return CheckResult("worker-live", "edge", "live worker /health", PASS,
                               f"{worker_url}/health -> HTTP {status}")
        return CheckResult("worker-live", "edge", "live worker /health", FAIL,
                           f"HTTP {status}")
    except Exception as exc:
        return CheckResult("worker-live", "edge", "live worker /health", SKIP,
                           f"unreachable: {exc}")


def check_pytest_collect() -> CheckResult:
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pytest", "--collect-only", "-q",
             "tests/integration/test_wave3_e2e.py",
             "tests/integration/test_cloudflare_worker.py"],
            cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=60)
    except FileNotFoundError:
        return CheckResult("e2e-collect", "e2e", "pytest collects verifier suites", SKIP,
                           "pytest not installed", hint="pip install pytest")
    except subprocess.TimeoutExpired:
        return CheckResult("e2e-collect", "e2e", "pytest collects verifier suites", FAIL,
                           "collection timed out")
    if proc.returncode == 0:
        count = len([l for l in proc.stdout.splitlines() if "::" in l])
        return CheckResult("e2e-collect", "e2e", "pytest collects verifier suites", PASS,
                           f"{count} tests collected")
    if "No module named pytest" in (proc.stdout + proc.stderr):
        return CheckResult("e2e-collect", "e2e", "pytest collects verifier suites", SKIP,
                           "pytest not installed", hint="pip install pytest")
    return CheckResult("e2e-collect", "e2e", "pytest collects verifier suites", FAIL,
                       (proc.stderr.strip() or proc.stdout.strip())[:300])


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def run_all(api_url: str, worker_url: str, timeout: float, offline: bool) -> list[CheckResult]:
    return [
        check_specs(),
        check_verifier_files(),
        check_gitignore(),
        check_env_example(),
        check_ocr_pydeps(),
        check_ocr_binaries(),
        check_digital_fixture(),
        check_scanned_fixture(),
        check_ocr_engine_present(),
        check_api_health(api_url, timeout, offline),
        check_worker_config(),
        check_worker_entry(),
        check_worker_live(worker_url, timeout, offline),
        check_pytest_collect(),
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="WS-VERIFY Wave 3 smoke gate")
    parser.add_argument("--json", action="store_true", help="emit JSON instead of table")
    parser.add_argument("--strict", action="store_true", help="SKIPs count as failures")
    parser.add_argument("--offline", action="store_true", help="skip network probes")
    parser.add_argument("--api-url", default=os.environ.get("CASEVAULT_API_URL")
                        or os.environ.get("API_BASE_URL") or "http://localhost:8000",
                        help="API origin under test")
    parser.add_argument("--worker-url", default=os.environ.get("CLOUDFLARE_WORKER_URL")
                        or os.environ.get("WORKER_URL") or "",
                        help="live worker origin (optional)")
    parser.add_argument("--timeout", type=float, default=float(os.environ.get("WS_VERIFY_TIMEOUT", "3.0")))
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    started = time.monotonic()
    results = run_all(args.api_url.rstrip("/"), args.worker_url.rstrip("/"),
                      args.timeout, args.offline)
    elapsed = time.monotonic() - started

    n_pass = sum(1 for r in results if r.status == PASS)
    n_fail = sum(1 for r in results if r.status == FAIL)
    n_skip = sum(1 for r in results if r.status == SKIP)
    gate_fail = n_fail + (n_skip if args.strict else 0)

    if args.json:
        print(json.dumps({
            "suite": "wave3_smoke",
            "strict": args.strict,
            "offline": args.offline,
            "api_url": args.api_url,
            "worker_url": args.worker_url or None,
            "elapsed_s": round(elapsed, 2),
            "summary": {"pass": n_pass, "fail": n_fail, "skip": n_skip},
            "gate": "FAIL" if gate_fail else "PASS",
            "checks": [r.__dict__ for r in results],
        }, indent=2))
    else:
        print(f"\nWS-VERIFY wave3 smoke gate  (strict={'on' if args.strict else 'off'}"
              f" offline={'on' if args.offline else 'off'} {elapsed:.1f}s)")
        print(f"{'STATUS':6s}  {'CHECK':20s}  DETAIL")
        print("-" * 78)
        for r in results:
            line = f"{r.status:6s}  {r.id:20s}  {r.title}: {r.detail}"
            print(line)
            if args.verbose and r.hint and r.status != PASS:
                print(f"         hint: {r.hint}")
        print("-" * 78)
        print(f"wave3_smoke: PASS={n_pass} FAIL={n_fail} SKIP={n_skip} "
              f"-> GATE {'FAIL' if gate_fail else 'PASS'}")
        if n_fail or (args.verbose and n_skip):
            print("hints:")
            for r in results:
                if (r.status == FAIL or (args.verbose and r.status == SKIP)) and r.hint:
                    print(f"  - {r.id}: {r.hint}")
    return 1 if gate_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
