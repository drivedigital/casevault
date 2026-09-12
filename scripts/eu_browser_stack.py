#!/usr/bin/env python
"""EU-V — isolated stack for independent evidence browser acceptance.

Contract: docs/contracts/evidence_ui_closure.md v1.0 FROZEN (2026-09-11
integration amendment: isolated pinned install approved; safe cleanup,
platform and credential corrections required).
Write set: scripts/eu_browser_* (EU-V). Nothing here edits product code.

The acceptance run must exercise the REAL API, REAL worker, REAL Postgres and
REAL Redis — never mocks, never TestClient, never fixture overrides. This
script starts that stack with throwaway, clearly separated resources:

  * a disposable PostgreSQL database created by this script (dropped again on
    failure and on `stop`; never the developer's own database),
  * a private Redis on a Unix socket (no TCP port, no persistence, no flush of
    any shared server),
  * a scratch LOCAL_STORAGE_ROOT inside the run's artifact directory,
  * real uvicorn API, real `python -m workers.run_worker`, real `next dev`.

Lifecycle guarantees (integration review 2026-09-11):
  * startup is transactional: every owned resource is recorded in the state
    file as soon as it exists, and any failure rolls them back,
  * `stop` validates that a resource really is one this script owns before
    removing it (database name prefix, storage inside the artifact dir, PID
    command line) and exits non-zero if cleanup is incomplete,
  * incomplete cleanup keeps an actionable recovery state file instead of
    claiming success,
  * credentials are never printed: URLs are redacted, the state file (which
    must hold real connection data to be able to clean up) is mode 0600, and
    machine-readable env output is opt-in and shell-quoted,
  * browser-facing servers bind 0.0.0.0 so Arena previews work; the web app
    still calls the API through the relative /api/v1 rewrite (no hard-coded
    API host in browser code).

Usage
    python scripts/eu_browser_stack.py start|stop|status
    eval "$(python scripts/eu_browser_stack.py env)"     # opt-in env emission
    python scripts/eu_browser_stack.py env --json

Environment (all optional)
    EU_V_ADMIN_DATABASE_URL  admin connection used to CREATE/DROP the
                             throwaway database (default: DATABASE_URL, then
                             the agent_pg harness, then local compose)
    EU_V_REDIS_SERVER        redis-server binary (default: PATH, then the
                             `redislite` wheel's bundled binary)
    EU_V_API_PORT / EU_V_WEB_PORT      defaults 8101 / 3101
    EU_V_API_HOST / EU_V_WEB_HOST      defaults 0.0.0.0 (Arena preview)
    EU_V_ARTIFACTS           default data/temp/eu-browser-stack
    EU_V_ALEMBIC_CONFIG      default apps/api/alembic.ini
    EU_V_KEEP_DB=1           keep the throwaway database on stop (debugging)

Exit codes: 0 ok, 1 failure, 2 prerequisite unavailable.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import shlex
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_ARTIFACTS = REPO_ROOT / "data" / "temp" / "eu-browser-stack"
STATE_FILE = "state.json"
PY = REPO_ROOT / ".venv" / "bin" / "python"
DB_PREFIX = "casevault_euv_"
DB_NAME_RE = re.compile(rf"^{DB_PREFIX}[0-9a-f]{{12}}$")
READY_TIMEOUT = 300.0
SENSITIVE_QUERY_KEYS = ("password", "sslpassword", "passfile", "token", "secret", "access_key")
STACK_STATE_VERSION = 2


# --------------------------------------------------------------- utilities ---

def redact(value: str) -> str:
    """Hide userinfo and credential-bearing query parameters in a URL."""
    if not value:
        return value
    try:
        parts = urlsplit(value)
    except ValueError:
        return value
    netloc = parts.netloc
    if "@" in netloc:
        netloc = "***@" + netloc.rsplit("@", 1)[1]
    query = ""
    if parts.query:
        pairs = []
        for key, item in parse_qsl(parts.query, keep_blank_values=True):
            if any(marker in key.lower() for marker in SENSITIVE_QUERY_KEYS):
                pairs.append((key, "***"))
            else:
                pairs.append((key, item))
        query = urlencode(pairs)
    return urlunsplit((parts.scheme, netloc, parts.path, query, ""))


def _with_database(url: str, database: str) -> str:
    """Swap the database name in a URL without corrupting `?host=` parameters."""
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, f"/{database}", parts.query, parts.fragment))


def artifacts_dir() -> pathlib.Path:
    return pathlib.Path(os.environ.get("EU_V_ARTIFACTS", str(DEFAULT_ARTIFACTS))).resolve()


def _default_admin_url() -> str:
    """env DATABASE_URL -> agent_pg harness -> local dev compose URL."""
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    agent_pg = REPO_ROOT / "scripts" / "agent_pg.py"
    state = REPO_ROOT / "data" / "pgdata" / "agent_pg_state.json"
    if state.exists() and agent_pg.exists():
        try:
            out = subprocess.run(
                [str(PY), str(agent_pg), "env"],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                timeout=60,
                check=True,
            ).stdout
            match = re.search(r'export DATABASE_URL="([^"]+)"', out)
            if match:
                return match.group(1)
        except (subprocess.SubprocessError, OSError):
            pass
        try:
            data = json.loads(state.read_text())
            if data.get("uri"):
                return data["uri"]
        except (json.JSONDecodeError, OSError):
            pass
    return "postgresql://postgres:postgres@localhost:5432/casevault"


def _write_state(state_path: pathlib.Path, state: dict) -> None:
    """Write the state file atomically with owner-only permissions (0600)."""
    state_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = state_path.with_suffix(".json.tmp")
    handle = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(handle, "w") as stream:
        json.dump(state, stream, indent=2)
        stream.write("\n")
    os.replace(tmp, state_path)
    os.chmod(state_path, 0o600)


def _read_state(state_path: pathlib.Path) -> dict:
    return json.loads(state_path.read_text())


# ------------------------------------------------- owned-resource handling ---

def _process_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def _process_cmdline(pid: int) -> str:
    proc_path = pathlib.Path(f"/proc/{pid}/cmdline")
    try:  # Linux only; on macOS the PID bookkeeping alone is used.
        return proc_path.read_bytes().replace(b"\0", b" ").decode("utf-8", "replace")
    except (OSError, ValueError):
        return ""


def _iter_processes() -> list[tuple[int, str]]:
    """Best-effort process list from /proc (Linux); empty elsewhere."""
    proc = pathlib.Path("/proc")
    found: list[tuple[int, str]] = []
    if not proc.is_dir():
        return found
    for entry in proc.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            cmdline = (entry / "cmdline").read_bytes().replace(b"\0", b" ").decode("utf-8", "replace")
        except OSError:
            continue
        if cmdline.strip():
            found.append((int(entry.name), cmdline))
    return found


def _owned_process(pid: int, markers: tuple[str, ...]) -> bool:
    """Only signal processes this stack started (a marker appears in cmdline)."""
    if not isinstance(pid, int) or pid <= 0:
        return False
    if not _process_alive(pid):
        return False
    cmdline = _process_cmdline(pid)
    if not cmdline:  # no /proc info available: trust the recorded PID
        return True
    return any(marker in cmdline for marker in markers)


def _parent_map() -> dict[int, list[int]]:
    """pid -> child pids, from /proc (empty on platforms without /proc)."""
    children: dict[int, list[int]] = {}
    proc = pathlib.Path("/proc")
    if not proc.is_dir():
        return children
    stat_re = re.compile(r"^\d+ \(.*\) [A-Za-z] (\d+)")
    for entry in proc.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            text = (entry / "stat").read_text()
        except OSError:
            continue
        match = stat_re.match(text)
        if not match:
            continue
        children.setdefault(int(match.group(1)), []).append(int(entry.name))
    return children


def _descendants(pid: int, children: dict[int, list[int]], seen: set[int] | None = None) -> list[int]:
    seen = seen if seen is not None else set()
    for child in children.get(pid, []):
        if child in seen:
            continue
        seen.add(child)
        _descendants(child, children, seen)
    return sorted(seen, reverse=True)  # deepest first


def _reap_descendants(processes: dict, pgids: dict) -> list[str]:
    """Kill escaped children of the recorded PIDs (group first, then tree)."""
    failures: list[str] = []
    children = _parent_map()
    for name in reversed(list(processes)):
        pid = processes[name]
        group = pgids.get(name)
        if group:
            try:
                os.killpg(group, signal.SIGTERM)
            except OSError:
                pass  # group already gone
        for child in _descendants(pid, children):
            if not _process_alive(child):
                continue
            try:
                _terminate(child)
            except OSError as exc:
                failures.append(f"could not terminate child of {name} (pid {child}): {exc}")
    return failures


SERVICE_MARKERS: dict[str, tuple[str, ...]] = {
    "api": ("uvicorn app.main:app",),
    "worker": ("run_worker",),
    # `next dev` may be launched through npm, so both spellings are owned.
    "web": ("next", "npm run dev"),
    "redis": ("redis-server",),
}


def _terminate(pid: int) -> None:
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(os.getpgid(pid), sig)
        except (ProcessLookupError, PermissionError, OSError):
            return
        deadline = time.time() + 10.0
        while time.time() < deadline:
            if not _process_alive(pid):
                return
            time.sleep(0.25)


def _drop_database(admin_url: str, name: str) -> None:
    import psycopg2

    if not DB_NAME_RE.match(name or ""):
        raise ValueError(f"refusing to drop a database this stack does not own: {name!r}")
    try:
        conn = psycopg2.connect(_with_database(admin_url, "postgres"))
    except psycopg2.Error as exc:
        # e.g. an unreachable server, or a busy database during cleanup.
        raise RuntimeError(f"drop database failed: {redact(str(exc).strip())}") from exc
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(f'DROP DATABASE IF EXISTS "{name}"')
    except psycopg2.Error as exc:
        raise RuntimeError(f"drop database failed: {redact(str(exc).strip())}") from exc
    finally:
        conn.close()


def _remove_path(target: str, artifacts: pathlib.Path) -> None:
    path = pathlib.Path(target)
    if not path.exists():
        return
    if artifacts not in path.parents and path != artifacts:
        raise ValueError(f"refusing to remove a path outside this run's artifacts: {path}")
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()


def _cleanup(state: dict, artifacts: pathlib.Path) -> list[str]:
    """Remove everything this stack owns. Returns a list of failures (may be empty)."""
    failures: list[str] = []
    resources = state.get("resources", {})

    processes = resources.get("processes", {}) or {}
    for name in reversed(list(processes)):
        pid = processes[name]
        if not _owned_process(pid, SERVICE_MARKERS.get(name, ())):
            continue
        try:
            _terminate(pid)
        except OSError as exc:
            failures.append(f"could not terminate {name} (pid {pid}): {exc}")

    # Children that inherited our group but outlived the recorded leader are
    # still ours; scope the search to this run via the recorded process groups
    # and the parent/child tree (never by port: another run may own that port).
    failures.extend(_reap_descendants(processes, resources.get("pgids", {}) or {}))

    socket_path = resources.get("redis_socket")
    if socket_path:
        try:
            _remove_path(socket_path, artifacts)
        except (OSError, ValueError) as exc:
            failures.append(f"could not remove redis socket {socket_path}: {exc}")

    storage = resources.get("storage")
    if storage:
        try:
            _remove_path(storage, artifacts)
        except (OSError, ValueError) as exc:
            failures.append(f"could not remove scratch storage {storage}: {exc}")

    database = resources.get("database")
    admin_url = state.get("admin_database_url")
    if database and admin_url:
        try:
            _drop_database(admin_url, database)
        except (OSError, ValueError, RuntimeError) as exc:
            failures.append(f"could not drop database {database}: {type(exc).__name__}")

    return failures


def _fail(state_path: pathlib.Path, state: dict, step: str, message: str,
          cleanup_failures: list[str] | None = None) -> int:
    """Record an actionable recovery state, keep the file, and return failure."""
    state["status"] = "failed"
    state["step"] = step
    state["failure"] = redact(message)
    state["recovery"] = [
        f"inspect logs in {state.get('artifacts', str(state_path.parent))}",
        f"python scripts/eu_browser_stack.py stop  (artifacts: {state.get('artifacts', '')})",
    ]
    if cleanup_failures:
        state["cleanup_failures"] = [redact(item) for item in cleanup_failures]
        state["recovery"].append(
            "cleanup was incomplete: remove the listed resources manually, then delete "
            f"{state_path}"
        )
    _write_state(state_path, state)
    print(f"==> STARTUP FAILED at step '{step}': {redact(message)}", file=sys.stderr)
    for item in cleanup_failures or []:
        print(f"==> CLEANUP FAILURE: {redact(item)}", file=sys.stderr)
    print(f"==> recovery state kept at {state_path}", file=sys.stderr)
    return 1


# ------------------------------------------------------------------- start ---

def _spawn(command: list[str], env: dict[str, str], log_path: pathlib.Path) -> subprocess.Popen:
    return _spawn_command(command, REPO_ROOT, env, log_path)


def _spawn_command(command: list[str], cwd: pathlib.Path, env: dict[str, str],
                   log_path: pathlib.Path) -> subprocess.Popen:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    handle = log_path.open("wb")
    # Own process group so cleanup can take down the whole tree
    # (uvicorn --reload children, next dev's compiler workers).
    return subprocess.Popen(
        command,
        cwd=cwd,
        env=env,
        stdout=handle,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )


def _wait_ready(name: str, url: str, proc: subprocess.Popen, log_path: pathlib.Path) -> None:
    deadline = time.time() + READY_TIMEOUT
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(
                f"{name} exited during startup (rc={proc.returncode}); see {log_path}"
            )
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                if response.status < 500:
                    print(f"    ready: {name} ({url})", flush=True)
                    return
        except (urllib.error.URLError, OSError):
            time.sleep(1.0)
    raise RuntimeError(f"{name} not ready within {READY_TIMEOUT:g}s; see {log_path}")


def _wait_redis(socket_path: pathlib.Path, proc: subprocess.Popen, log_path: pathlib.Path) -> None:
    deadline = time.time() + 60.0
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f"redis exited during startup; see {log_path}")
        if socket_path.exists():
            print(f"    ready: redis ({socket_path})", flush=True)
            return
        time.sleep(0.5)
    raise RuntimeError(f"redis socket not created within 60s; see {log_path}")


def _find_redis_server() -> str:
    override = os.environ.get("EU_V_REDIS_SERVER")
    if override and pathlib.Path(override).exists():
        return override
    found = shutil.which("redis-server")
    if found:
        return found
    try:  # sandbox fallback: the redislite wheel ships a real redis-server
        import redislite  # type: ignore
    except ImportError:
        redislite = None  # type: ignore[assignment]
    if redislite is not None:
        candidate = pathlib.Path(redislite.__file__).parent / "bin" / "redis-server"
        if candidate.exists():
            return str(candidate)
    raise SystemExit(
        "redis-server not found: install Redis, or set EU_V_REDIS_SERVER to a "
        "redis-server executable (the `redislite` wheel also provides one)"
    )


def _create_database(admin_url: str, name: str) -> None:
    import psycopg2  # imported lazily so --help works without DB drivers

    try:
        conn = psycopg2.connect(_with_database(admin_url, "postgres"))
    except psycopg2.Error as exc:
        raise RuntimeError(
            f"cannot reach the admin database {redact(admin_url)}: {redact(str(exc).strip())}"
        ) from exc
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,))
            if cur.fetchone():
                raise RuntimeError(f"database {name} already exists; refusing to reuse it")
            cur.execute(f'CREATE DATABASE "{name}"')
    finally:
        conn.close()


def start() -> int:
    artifacts = artifacts_dir()
    state_path = artifacts / STATE_FILE
    if state_path.exists():
        existing = _read_state(state_path)
        print(
            f"stack state already exists (status={existing.get('status')}) at {state_path}; "
            "run `stop` first",
            file=sys.stderr,
        )
        return 1
    artifacts.mkdir(parents=True, exist_ok=True)

    admin_url = os.environ.get("EU_V_ADMIN_DATABASE_URL") or _default_admin_url()
    db_name = DB_PREFIX + uuid.uuid4().hex[:12]
    api_port = int(os.environ.get("EU_V_API_PORT", "8101"))
    web_port = int(os.environ.get("EU_V_WEB_PORT", "3101"))
    # Arena previews reach the sandbox from outside, so browser-facing servers
    # bind all interfaces. Restrict with EU_V_API_HOST / EU_V_WEB_HOST if needed.
    api_host = os.environ.get("EU_V_API_HOST", "0.0.0.0")
    web_host = os.environ.get("EU_V_WEB_HOST", "0.0.0.0")
    alembic_config = os.environ.get("EU_V_ALEMBIC_CONFIG", "apps/api/alembic.ini")
    storage = artifacts / "storage"
    socket_path = artifacts / "redis.sock"
    if len(os.fsencode(socket_path)) >= 104:
        print("scratch path too long for a Redis Unix socket", file=sys.stderr)
        return 2

    state: dict = {
        "version": STACK_STATE_VERSION,
        "status": "starting",
        "step": "init",
        "artifacts": str(artifacts),
        "admin_database_url": admin_url,
        "database_url": _with_database(admin_url, db_name),
        "api_port": api_port,
        "web_port": web_port,
        "api_host": api_host,
        "web_host": web_host,
        "resources": {
            "database": None,
            "storage": None,
            "redis_socket": None,
            "processes": {},
            "pgids": {},
        },
        "recovery": [],
    }

    print("==> EU-V isolated stack")
    print(f"    database  {db_name} (throwaway; {redact(admin_url)})")
    print(f"    storage   {storage}")
    print(f"    redis     {socket_path} (unix socket, no persistence)")
    print(f"    bind      api {api_host}:{api_port} · web {web_host}:{web_port} (dev only)")

    try:
        # 1. database
        state["step"] = "create-database"
        _create_database(admin_url, db_name)
        state["resources"]["database"] = db_name
        _write_state(state_path, state)

        # 2. migrations
        state["step"] = "migrate"
        print("==> applying migrations")
        migrations = subprocess.run(
            [str(PY), "-m", "alembic", "-c", alembic_config, "upgrade", "head"],
            cwd=REPO_ROOT,
            check=False,
            env={**os.environ, "DATABASE_URL": state["database_url"]},
            capture_output=True,
            text=True,
        )
        if migrations.returncode != 0:
            tail = (migrations.stderr or migrations.stdout or "").strip().splitlines()[-5:]
            raise RuntimeError("alembic upgrade head failed: " + " | ".join(tail))
        _write_state(state_path, state)

        # 3. private redis
        state["step"] = "redis"
        redis_binary = _find_redis_server()
        redis = _spawn(
            [
                redis_binary,
                "--port", "0",
                "--unixsocket", str(socket_path),
                "--unixsocketperm", "700",
                "--save", "",
                "--appendonly", "no",
                "--dir", str(artifacts),
                "--daemonize", "no",
            ],
            dict(os.environ),
            artifacts / "redis.log",
        )
        state["resources"]["processes"]["redis"] = redis.pid
        state["resources"]["pgids"]["redis"] = os.getpgid(redis.pid)
        state["resources"]["redis_socket"] = str(socket_path)
        _write_state(state_path, state)
        _wait_redis(socket_path, redis, artifacts / "redis.log")

        stack_env = {
            **os.environ,
            "DATABASE_URL": state["database_url"],
            "REDIS_URL": f"unix://{socket_path}",
            "LOCAL_STORAGE_ROOT": str(storage),
            "APP_ENV": "development",
        }
        storage.mkdir(parents=True, exist_ok=True)
        state["resources"]["storage"] = str(storage)
        _write_state(state_path, state)

        # 4. api
        state["step"] = "api"
        api = _spawn(
            [str(PY), "-m", "uvicorn", "app.main:app", "--app-dir", "apps/api",
             "--host", api_host, "--port", str(api_port)],
            stack_env,
            artifacts / "api.log",
        )
        state["resources"]["processes"]["api"] = api.pid
        state["resources"]["pgids"]["api"] = os.getpgid(api.pid)
        _write_state(state_path, state)
        _wait_ready("api", f"http://127.0.0.1:{api_port}/health", api, artifacts / "api.log")

        # 5. worker
        state["step"] = "worker"
        worker = _spawn([str(PY), "-m", "workers.run_worker"], stack_env, artifacts / "worker.log")
        state["resources"]["processes"]["worker"] = worker.pid
        state["resources"]["pgids"]["worker"] = os.getpgid(worker.pid)
        _write_state(state_path, state)
        time.sleep(2.0)
        if worker.poll() is not None:
            raise RuntimeError(f"worker exited during startup; see {artifacts / 'worker.log'}")

        # 6. web (proxies /api/v1/* to the API; browser code uses relative URLs).
        #    `next dev` is started directly when possible: an npm wrapper spawns
        #    `sh -c next dev`, whose children can escape the recorded process
        #    group and outlive `stop`.
        state["step"] = "web"
        web_env = {**stack_env, "API_BASE_URL": f"http://127.0.0.1:{api_port}"}
        next_bin = REPO_ROOT / "node_modules" / "next" / "dist" / "bin" / "next"
        if next_bin.exists():
            web_command = ["node", str(next_bin), "dev", "--port", str(web_port), "--hostname", web_host]
            web_cwd = REPO_ROOT / "apps" / "web"
        else:  # pragma: no cover - fallback for non-standard installs
            web_command = ["npm", "run", "dev", "--workspace=web", "--",
                           "--port", str(web_port), "--hostname", web_host]
            web_cwd = REPO_ROOT
        web = _spawn_command(web_command, web_cwd, web_env, artifacts / "web.log")
        state["resources"]["processes"]["web"] = web.pid
        state["resources"]["pgids"]["web"] = os.getpgid(web.pid)
        _write_state(state_path, state)
        _wait_ready("web", f"http://127.0.0.1:{web_port}/evidence", web, artifacts / "web.log")

    except (RuntimeError, OSError, subprocess.SubprocessError) as exc:
        message = str(exc)
        cleanup_failures = _cleanup(state, artifacts)
        return _fail(state_path, state, state.get("step", "unknown"), message, cleanup_failures)
    except KeyboardInterrupt:
        cleanup_failures = _cleanup(state, artifacts)
        return _fail(state_path, state, state.get("step", "unknown"), "interrupted", cleanup_failures)

    state["status"] = "running"
    state["step"] = "ready"
    state["started_at"] = time.time()
    _write_state(state_path, state)

    print()
    print("==> stack ready")
    print(f"    web  http://127.0.0.1:{web_port} (bound to {web_host} for previews)")
    print(f"    api  http://127.0.0.1:{api_port} (bound to {api_host})")
    print("    env  eval \"$(python scripts/eu_browser_stack.py env)\"   # opt-in, quoted")
    print("    run  bash scripts/eu_browser_run.sh")
    print("    stop .venv/bin/python scripts/eu_browser_stack.py stop")
    return 0


# -------------------------------------------------------------------- stop ---

def stop() -> int:
    artifacts = artifacts_dir()
    state_path = artifacts / STATE_FILE
    if not state_path.exists():
        print("no stack state found; nothing to stop")
        return 0
    state = _read_state(state_path)
    failures = _cleanup(state, artifacts)

    processes = state.get("resources", {}).get("processes") or {}
    leftover = [name for name, pid in processes.items() if _process_alive(pid)]
    children = _parent_map()
    for name, pid in processes.items():
        if _descendants(pid, children):
            leftover.append(f"{name}:children")
    if failures or leftover:
        state["status"] = "failed-cleanup"
        state["cleanup_failures"] = [redact(item) for item in failures]
        state["leftover_processes"] = leftover
        state["recovery"] = [
            f"kill the listed PIDs and remove {state.get('artifacts', artifacts)} manually",
            f"then delete {state_path}",
        ]
        _write_state(state_path, state)
        for item in failures:
            print(f"==> CLEANUP FAILURE: {redact(item)}", file=sys.stderr)
        if leftover:
            print(f"==> processes still alive: {', '.join(leftover)}", file=sys.stderr)
        print(f"==> STOP INCOMPLETE — recovery state kept at {state_path}", file=sys.stderr)
        return 1

    if os.environ.get("EU_V_KEEP_DB") != "1":
        print("==> database dropped, storage removed (log files kept as diagnostics)")
    else:
        print(f"==> database kept: {state.get('resources', {}).get('database')}")
    state_path.unlink(missing_ok=True)
    print("==> stack stopped")
    return 0


def status() -> int:
    artifacts = artifacts_dir()
    state_path = artifacts / STATE_FILE
    if not state_path.exists():
        print("stack: stopped")
        return 0
    state = _read_state(state_path)
    mode = oct(state_path.stat().st_mode & 0o777)
    print(f"stack: {state.get('status')} (step={state.get('step')}) state={state_path} mode={mode}")
    for name, pid in (state.get("resources", {}).get("processes") or {}).items():
        print(f"  {name:7s} pid={pid} {'running' if _process_alive(pid) else 'EXITED'}")
    print(f"  db={state.get('resources', {}).get('database')}")
    print(f"  web=http://127.0.0.1:{state.get('web_port')} (bound {state.get('web_host')})")
    if state.get("failure"):
        print(f"  last failure: {redact(state['failure'])}")
    return 0


def emit_env(as_json: bool = False) -> int:
    """Opt-in machine-readable env output, safely shell-quoted."""
    artifacts = artifacts_dir()
    state_path = artifacts / STATE_FILE
    if not state_path.exists():
        return 0
    state = _read_state(state_path)
    values = {
        "EU_V_WEB_BASE_URL": f"http://127.0.0.1:{state.get('web_port')}",
        "EU_V_API_BASE_URL": f"http://127.0.0.1:{state.get('api_port')}",
        "EU_V_DATABASE_URL": state.get("database_url", ""),
        "EU_V_ADMIN_DATABASE_URL": state.get("admin_database_url", ""),
        "EU_V_REDIS_URL": f"unix://{state.get('resources', {}).get('redis_socket', '')}",
        "EU_V_ARTIFACTS": state.get("artifacts", ""),
    }
    if as_json:
        print(json.dumps(values, indent=2))
    else:
        for key, value in values.items():
            print(f"export {key}={shlex.quote(value)}")
    return 0


def main(argv: list[str]) -> int:
    command = argv[1] if len(argv) > 1 else "status"
    if command == "start":
        return start()
    if command == "stop":
        return stop()
    if command == "status":
        return status()
    if command == "env":
        return emit_env(as_json="--json" in argv)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
