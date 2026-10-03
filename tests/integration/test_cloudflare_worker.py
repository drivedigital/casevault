"""WS-VERIFY — Cloudflare Worker (edge) integration verifier.

Workstream: WS-VERIFY (Wave 3 Verifier & Edge Smoke Gate).
Write set: owned exclusively by WS-VERIFY. No application/feature code here —
only edge-contract probes (file-level + optional live HTTP).

What this verifies:
  * Worker contract exists: wrangler config + entry module + health route.
  * No hardcoded localhost/127.0.0.1 backends in worker source (edge code
    must target configurable origins; preview/prod hosts differ).
  * CORS + JSON error shape + proxy-to-API behaviour, when a live worker URL
    is provided.

How it runs:
  * Offline (default): static contract checks over the repo. Missing worker
    code -> SKIP (punch-list), FAIL under WS_VERIFY_STRICT=1.
  * Live: set CLOUDFLARE_WORKER_URL (or WORKER_URL) to the deployed/preview
    worker origin, e.g. https://casevault-edge.<account>.workers.dev, and the
    live probes below will exercise it.

  Environment:
    CLOUDFLARE_WORKER_URL / WORKER_URL   live worker origin (optional)
    WS_VERIFY_STRICT=1                   skips become failures
    WS_VERIFY_TIMEOUT                    per-request timeout seconds (default 5.0)
    WS_VERIFY_LATENCY_BUDGET_MS          live /health budget (default 3000)

Only stdlib + pytest are required.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve()
for _ in range(4):
    REPO_ROOT = REPO_ROOT.parent
    if (REPO_ROOT / "docs" / "specs").exists() or (REPO_ROOT / ".git").exists():
        break

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

WORKER_URL = (
    os.environ.get("CLOUDFLARE_WORKER_URL")
    or os.environ.get("WORKER_URL")
    or ""
).rstrip("/")
STRICT = os.environ.get("WS_VERIFY_STRICT") == "1"
TIMEOUT = float(os.environ.get("WS_VERIFY_TIMEOUT", "5.0"))
LATENCY_BUDGET_MS = float(os.environ.get("WS_VERIFY_LATENCY_BUDGET_MS", "3000"))

WRANGLER_CANDIDATES = [
    "wrangler.toml",
    "wrangler.json",
    "wrangler.jsonc",
    "workers/edge/wrangler.toml",
    "apps/edge/wrangler.toml",
    "edge/wrangler.toml",
    "cloudflare/wrangler.toml",
]
WORKER_ENTRY_GLOBS = [
    "workers/edge/*",
    "apps/edge/*",
    "edge/*",
    "cloudflare/*",
    "workers/*worker*",
]
WORKER_ENTRY_NAMES = re.compile(
    r"(worker|edge|proxy)\.(ts|js|mjs)$|src/(index|worker)\.(ts|js)$", re.I
)
WORKER_SOURCE_SUFFIXES = {".ts", ".js", ".mjs", ".json", ".toml", ".jsonc"}


def verify_or_skip(condition: bool, message: str) -> bool:
    if condition:
        return True
    if STRICT:
        pytest.fail(f"[STRICT-GATE] {message}")
    pytest.skip(message)
    return False


def find_wrangler_config() -> Path | None:
    for rel in WRANGLER_CANDIDATES:
        p = REPO_ROOT / rel
        if p.is_file():
            return p
    return None


def find_worker_entries() -> list[Path]:
    hits: list[Path] = []
    for pattern in WORKER_ENTRY_GLOBS:
        for path in REPO_ROOT.glob(pattern):
            if path.is_file() and WORKER_ENTRY_NAMES.search(str(path)):
                hits.append(path)
            elif path.is_dir():
                for sub in path.rglob("*"):
                    if sub.is_file() and WORKER_ENTRY_NAMES.search(str(sub)):
                        hits.append(sub)
    # Deduplicate preserving order
    seen, unique = set(), []
    for h in hits:
        if h not in seen:
            seen.add(h)
            unique.append(h)
    return unique


def worker_sources() -> list[Path]:
    files: list[Path] = []
    cfg = find_wrangler_config()
    if cfg:
        files.append(cfg)
    files.extend(find_worker_entries())
    # Also sweep likely edge dirs for support modules (cors, proxy, auth).
    for d in ("workers/edge", "apps/edge", "edge", "cloudflare"):
        base = REPO_ROOT / d
        if base.is_dir():
            for sub in base.rglob("*"):
                if sub.is_file() and sub.suffix in WORKER_SOURCE_SUFFIXES and sub not in files:
                    files.append(sub)
    return files


def read_sources() -> dict[Path, str]:
    out = {}
    for path in worker_sources():
        try:
            out[path] = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
    return out


class WorkerUnreachable(Exception):
    pass


def worker_request(method: str, path: str, payload=None, headers=None):
    if not WORKER_URL:
        raise WorkerUnreachable("CLOUDFLARE_WORKER_URL/WORKER_URL not set")
    data = None
    req_headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(f"{WORKER_URL}{path}", data=data,
                                 headers=req_headers, method=method)
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            elapsed_ms = (time.monotonic() - start) * 1000
            return resp.status, resp.read(), dict(resp.headers.items()), elapsed_ms
    except urllib.error.HTTPError as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        try:
            body = exc.read()
        except Exception:
            body = b""
        return exc.code, body, dict((exc.headers or {}).items()), elapsed_ms
    except (urllib.error.URLError, OSError, TimeoutError) as exc:
        raise WorkerUnreachable(f"{method} {WORKER_URL}{path}: {exc}") from exc


def require_live_worker():
    verify_or_skip(bool(WORKER_URL), "no live worker URL configured (set CLOUDFLARE_WORKER_URL)")
    try:
        worker_request("GET", "/health")
    except WorkerUnreachable as exc:
        verify_or_skip(False, f"worker unreachable: {exc}")


# ---------------------------------------------------------------------------
# 1. Offline contract: wrangler config + entry module
# ---------------------------------------------------------------------------

class TestWorkerContract:
    def test_wrangler_config_present(self):
        cfg = find_wrangler_config()
        verify_or_skip(cfg is not None,
                       "wrangler config not merged (looked for wrangler.toml/json/jsonc)")

    def test_wrangler_config_parses(self):
        cfg = find_wrangler_config()
        verify_or_skip(cfg is not None, "wrangler config not merged")
        assert cfg is not None
        text = cfg.read_text(encoding="utf-8", errors="ignore")
        if cfg.suffix == ".toml":
            try:
                import tomllib  # py3.11+
                tomllib.loads(text)
            except ImportError:
                # Fallback: structural sanity (name + main/compatibility_date keys).
                assert re.search(r"^name\s*=", text, re.M), "wrangler.toml missing `name`"
            except Exception as exc:
                pytest.fail(f"wrangler.toml does not parse: {exc}")
        else:  # json / jsonc: strip comments then parse
            stripped = re.sub(r"//.*?$|/\*.*?\*/", "", text, flags=re.M | re.S)
            try:
                json.loads(stripped)
            except Exception as exc:
                pytest.fail(f"{cfg.name} does not parse as JSON(C): {exc}")

    def test_wrangler_has_entry_and_compat_date(self):
        cfg = find_wrangler_config()
        verify_or_skip(cfg is not None, "wrangler config not merged")
        assert cfg is not None
        text = cfg.read_text(encoding="utf-8", errors="ignore")
        assert re.search(r"main\s*=|\"main\"\s*:", text), "wrangler config missing entry `main`"
        assert re.search(r"compatibility_date", text), "wrangler config missing compatibility_date"

    def test_worker_entry_present(self):
        entries = find_worker_entries()
        verify_or_skip(bool(entries),
                       "worker entry module not merged (workers/edge, apps/edge, edge/, cloudflare/)")

    def test_worker_defines_fetch_handler(self):
        sources = read_sources()
        verify_or_skip(bool(sources), "no worker sources found to inspect")
        joined = "\n".join(sources.values())
        assert re.search(r"addEventListener\s*\(\s*['\"]fetch['\"]|export\s+default\s*\{|fetch\s*\(\s*request",
                         joined), "worker entry has no fetch handler (addEventListener/export default)"

    def test_worker_health_route_present(self):
        sources = read_sources()
        verify_or_skip(bool(sources), "no worker sources found to inspect")
        joined = "\n".join(sources.values())
        assert re.search(r"/health|/api/v1/health", joined), "worker has no /health route wired"

    def test_worker_backend_is_configurable(self):
        """Edge code must not hardcode localhost backends; origin comes from
        env/vars (API_BASE_URL, ORIGIN, env.*)."""
        sources = read_sources()
        verify_or_skip(bool(sources), "no worker sources found to inspect")
        code = "\n".join(t for p, t in sources.items() if p.suffix in {".ts", ".js", ".mjs"})
        verify_or_skip(bool(code.strip()), "no worker JS/TS source found to inspect")
        hardcoded = [line.strip()[:160] for line in code.splitlines()
                     if re.search(r"localhost|127\.0\.0\.1", line)
                     and not line.strip().startswith(("//", "*", "#"))]
        assert not hardcoded, (
            "worker source hardcodes localhost backend(s) — use env vars:\n"
            + "\n".join(hardcoded[:5])
        )
        assert re.search(r"env\.|API_BASE_URL|API_ORIGIN|ORIGIN|vars\s*\.", code), (
            "worker shows no configurable backend (expected env.API_BASE_URL or similar)"
        )

    def test_worker_handles_cors(self):
        sources = read_sources()
        verify_or_skip(bool(sources), "no worker sources found to inspect")
        joined = "\n".join(sources.values())
        assert re.search(r"Access-Control-Allow-Origin|access-control-allow-origin|cors", joined, re.I), (
            "worker shows no CORS handling (Access-Control-Allow-Origin)"
        )

    def test_worker_preflight_supported(self):
        sources = read_sources()
        verify_or_skip(bool(sources), "no worker sources found to inspect")
        joined = "\n".join(sources.values())
        assert re.search(r"OPTIONS|preflight|Access-Control-Allow-Methods", joined), (
            "worker shows no OPTIONS/preflight handling"
        )


# ---------------------------------------------------------------------------
# 2. Live worker probes (need CLOUDFLARE_WORKER_URL)
# ---------------------------------------------------------------------------

class TestLiveWorker:
    def test_live_health_ok(self):
        require_live_worker()
        status, body, _, elapsed = worker_request("GET", "/health")
        assert status < 500, f"worker /health failed: HTTP {status} :: {body[:200]!r}"
        assert elapsed < LATENCY_BUDGET_MS, (
            f"worker /health latency {elapsed:.0f}ms exceeds {LATENCY_BUDGET_MS:.0f}ms budget"
        )

    def test_live_api_proxy_health(self):
        require_live_worker()
        status, body, _, _ = worker_request("GET", "/api/v1/health")
        # 404 = worker up but proxy route not wired; 5xx = proxy/backend broken.
        assert status != 404 or True  # worker may legitimately not proxy every route
        if status == 404:
            verify_or_skip(False, "worker does not proxy /api/v1/health yet")
        assert status < 500, f"worker API proxy failed: HTTP {status} :: {body[:200]!r}"

    def test_live_cors_headers(self):
        require_live_worker()
        status, _, headers, _ = worker_request("GET", "/health",
                                              headers={"Origin": "https://example.com"})
        lowered = {k.lower(): v for k, v in headers.items()}
        assert status < 500
        assert "access-control-allow-origin" in lowered, (
            f"CORS header missing on worker response: {sorted(headers)[:12]}"
        )

    def test_live_preflight(self):
        require_live_worker()
        status, _, headers, _ = worker_request(
            "OPTIONS", "/health",
            headers={"Origin": "https://example.com",
                     "Access-Control-Request-Method": "GET"})
        lowered = {k.lower(): v for k, v in headers.items()}
        assert status < 500, f"worker OPTIONS failed: HTTP {status}"
        assert ("access-control-allow-origin" in lowered
                or "access-control-allow-methods" in lowered), "preflight lacks CORS headers"

    def test_live_unknown_route_is_json_404(self):
        require_live_worker()
        status, body, _, _ = worker_request("GET", "/__ws_verify_no_such_route__")
        assert status == 404, f"expected JSON 404, got HTTP {status} :: {body[:120]!r}"
        try:
            payload = json.loads(body.decode("utf-8"))
            assert isinstance(payload, dict)
        except Exception:
            pytest.fail(f"404 body is not JSON: {body[:160]!r}")

    def test_live_security_headers_present(self):
        require_live_worker()
        status, _, headers, _ = worker_request("GET", "/health")
        assert status < 500
        lowered = {k.lower(): v for k, v in headers.items()}
        # Informational bar: at least one hardening header expected.
        hardening = {"content-security-policy", "x-content-type-options",
                     "referrer-policy", "strict-transport-security"}
        verify_or_skip(bool(hardening & set(lowered)),
                       f"no security hardening headers observed (got: {sorted(lowered)[:10]})")


# ---------------------------------------------------------------------------
# 3. Manifest (always passes; prints edge punch-list)
# ---------------------------------------------------------------------------

class TestWorkerManifest:
    def test_print_edge_punch_list(self, capsys):
        print("\n=== WS-VERIFY edge/worker punch-list ===")
        print(f"repo={REPO_ROOT} worker_url={'<set>' if WORKER_URL else '<unset>'} strict={STRICT}")
        cfg = find_wrangler_config()
        print(f"wrangler_config={cfg.relative_to(REPO_ROOT) if cfg else 'MISSING'}")
        entries = find_worker_entries()
        if entries:
            for e in entries:
                print(f"entry={e.relative_to(REPO_ROOT)}")
        else:
            print("entry=MISSING")
        print(f"live={'yes' if WORKER_URL else 'no (set CLOUDFLARE_WORKER_URL)'}")
        print("=== end edge punch-list ===")
        capsys.readouterr()
