#!/usr/bin/env python
"""Local Postgres harness for agent/automation environments WITHOUT Docker.

The product's supported local path is `make infra-up` (docker compose,
Postgres 16). Remote coding agents and CI-like sandboxes often have no Docker
daemon, so this script spins up an embedded Postgres (the `pgserver` wheel,
Postgres 16 binaries) inside the git-ignored `data/` tree and prints the
connection URLs the rest of the toolchain already understands
(`DATABASE_URL`, `TEST_DATABASE_URL`).

It is a development convenience only — it is never imported by the app,
never used by CI's real compose path, and never needed by the local tester.

Usage
-----
    python scripts/agent_pg.py start          # init (first run) + start + create DBs
    eval "$(python scripts/agent_pg.py env)"  # export DATABASE_URL / TEST_DATABASE_URL
    python scripts/agent_pg.py status
    python scripts/agent_pg.py psql "select 1"
    python scripts/agent_pg.py stop

`pgserver` is intentionally NOT in requirements-dev.txt (it is an 11 MB
binary wheel that only agent sandboxes need). Install it on demand:

    .venv/bin/pip install pgserver
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = REPO_ROOT / "data" / "pgdata"
STATE_FILE = "agent_pg_state.json"
APP_DB = "casevault"
TEST_DB = "casevault_test"
DATABASES = (APP_DB, TEST_DB)


def _load_pgserver():
    try:
        import pgserver  # type: ignore[import-not-found]
    except ImportError:  # pragma: no cover - depends on the agent environment
        sys.exit(
            "pgserver is not installed. Install it on demand:\n"
            "    .venv/bin/pip install pgserver"
        )
    return pgserver


def _state_path(data_dir: pathlib.Path) -> pathlib.Path:
    return data_dir / STATE_FILE


def _write_state(data_dir: pathlib.Path, uri: str, pid: int | None) -> None:
    _state_path(data_dir).write_text(json.dumps({"uri": uri, "pid": pid}, indent=2))


def _read_state(data_dir: pathlib.Path) -> dict | None:
    path = _state_path(data_dir)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None


def connection_url(data_dir: pathlib.Path, database: str) -> str:
    """libpq URL over the cluster's Unix socket (no TCP port needed)."""
    return f"postgresql://postgres@/{database}?host={data_dir}"


def _connect(data_dir: pathlib.Path, cleanup_mode: str | None = None):
    pgserver = _load_pgserver()
    return pgserver.get_server(pathlib.Path(data_dir), cleanup_mode=cleanup_mode)


def cmd_start(args: argparse.Namespace) -> int:
    data_dir: pathlib.Path = args.data_dir
    data_dir.mkdir(parents=True, exist_ok=True)
    server = _connect(data_dir, cleanup_mode=None)
    uri = server.get_uri()
    pid = server.get_pid()
    _write_state(data_dir, uri, pid)
    for name in DATABASES:
        try:
            server.psql(f"CREATE DATABASE {name};")
            print(f"created database {name}")
        except Exception as exc:
            if "already exists" not in str(exc):
                raise
    print(f"postgres running (pid {pid}) data_dir={data_dir}")
    print(f"  DATABASE_URL={connection_url(data_dir, APP_DB)}")
    print(f"  TEST_DATABASE_URL={connection_url(data_dir, TEST_DB)}")
    return 0


def cmd_stop(args: argparse.Namespace) -> int:
    data_dir: pathlib.Path = args.data_dir
    try:
        server = _connect(data_dir, cleanup_mode="stop")
        server.cleanup()
        print("postgres stopped")
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 - report any stop failure, never traceback-dump
        print(f"stop: {exc}")
    state = _read_state(data_dir)
    if state:
        _write_state(data_dir, state.get("uri", ""), None)
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    data_dir: pathlib.Path = args.data_dir
    state = _read_state(data_dir)
    if not state or not (data_dir / "postmaster.pid").exists():
        print("not running")
        return 1
    server = _connect(data_dir, cleanup_mode=None)
    pid = server.get_pid()
    print(f"running pid={pid} data_dir={data_dir}")
    for name in DATABASES:
        print(f"  {name}: {connection_url(data_dir, name)}")
    return 0


def cmd_env(args: argparse.Namespace) -> int:
    data_dir: pathlib.Path = args.data_dir
    if not (data_dir / "postmaster.pid").exists():
        sys.exit("postgres is not running here — run: python scripts/agent_pg.py start")
    print(f'export DATABASE_URL="{connection_url(data_dir, APP_DB)}"')
    print(f'export TEST_DATABASE_URL="{connection_url(data_dir, TEST_DB)}"')
    return 0


def cmd_psql(args: argparse.Namespace) -> int:
    server = _connect(args.data_dir, cleanup_mode=None)
    print(server.psql(args.sql))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--data-dir",
        type=pathlib.Path,
        default=DEFAULT_DATA_DIR,
        help=f"cluster directory (git-ignored); default {DEFAULT_DATA_DIR}",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("start", help="init if needed, start, create app + test databases")
    sub.add_parser("stop", help="stop the cluster")
    sub.add_parser("status", help="report running state and URLs")
    sub.add_parser("env", help="print export lines for DATABASE_URL / TEST_DATABASE_URL")
    psql = sub.add_parser("psql", help="run a SQL string against the app database")
    psql.add_argument("sql")
    args = parser.parse_args(argv)
    return {
        "start": cmd_start,
        "stop": cmd_stop,
        "status": cmd_status,
        "env": cmd_env,
        "psql": cmd_psql,
    }[args.command](args)


if __name__ == "__main__":
    raise SystemExit(main())
