"""WS-D — end-to-end evidence pipeline verification (Sprint 3 contract §7-D).

Runs scripts/pipeline_smoke.py (real API subprocess + scratch Postgres +
scratch storage) and fails on any check failure. The smoke's full output is
always printed so CI logs show every step.

Skip behavior is deliberate: the only sanctioned skip is when NO database
server can be resolved (no DATABASE_URL/TEST_DATABASE_URL, no .env.local
DATABASE_URL, and pgserver not installed). On any normal path — CI service
container, compose, or the agent_pg harness — this test runs for real and
never skips silently.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SMOKE_SCRIPT = REPO_ROOT / "scripts" / "pipeline_smoke.py"


def _database_resolvable() -> bool:
    for var in ("DATABASE_URL", "TEST_DATABASE_URL"):
        if os.environ.get(var):
            return True
    env_local = REPO_ROOT / ".env.local"
    if env_local.exists() and "DATABASE_URL=" in env_local.read_text():
        return True
    try:
        import pgserver  # noqa: F401

        return True
    except ImportError:
        return False


def test_evidence_e2e_pipeline() -> None:
    if not _database_resolvable():
        pytest.skip(
            "no Postgres resolvable: set DATABASE_URL (compose/CI), keep .env.local, "
            "or `pip install pgserver` for the embedded harness"
        )
    proc = subprocess.run(
        [sys.executable, str(SMOKE_SCRIPT)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )
    print(proc.stdout)
    assert proc.returncode == 0, (
        f"pipeline smoke failed (exit {proc.returncode}):\n{proc.stdout}\n{proc.stderr}"
    )
