#!/usr/bin/env bash
# CaseVault — full integration gate (Wave gate).
#
# Runs everything CI runs, plus the migration downgrade/re-upgrade check, on a
# FRESH database. Works with docker compose (local tester) and, when Docker is
# absent, with the embedded Postgres harness in scripts/agent_pg.py.
#
# Usage:
#   bash scripts/verify_all.sh            # full gate (python + web)
#   bash scripts/verify_all.sh --no-web   # python only (fast)
#
# Exit code 0 = wave is green and safe to merge.
set -euo pipefail
cd "$(dirname "$0")/.."

PY=".venv/bin/python"
RUN_WEB=1
[[ "${1:-}" == "--no-web" ]] && RUN_WEB=0

fail() { echo; echo "GATE FAILED: $*"; exit 1; }

[ -x "$PY" ] || fail "no venv — run: bash scripts/setup_local.sh"

echo "==> Database"
if [ -n "${DATABASE_URL:-}" ] && [ "${DATABASE_URL}" != *"pgdata"* ]; then
  echo "    using provided DATABASE_URL (compose path)"
  TEST_URL="${TEST_DATABASE_URL:-$DATABASE_URL}"
else
  if ! $PY scripts/agent_pg.py status >/dev/null 2>&1; then
    echo "    starting embedded postgres (no docker available)"
    $PY scripts/agent_pg.py start >/dev/null
  fi
  eval "$($PY scripts/agent_pg.py env)"
  TEST_URL="$TEST_DATABASE_URL"
  # Fresh schema every run so migrations are verified from zero, not from a
  # database some earlier branch already mutated. Output is kept visible on
  # failure: a swallowed DROP/CREATE error here would silently test the wrong
  # database.
  $PY scripts/agent_pg.py psql "DROP DATABASE IF EXISTS casevault_test;" >/tmp/cv_drop.log 2>&1 \
    || { cat /tmp/cv_drop.log; fail "could not drop casevault_test"; }
  $PY scripts/agent_pg.py psql "CREATE DATABASE casevault_test;" >/tmp/cv_create.log 2>&1 \
    || { cat /tmp/cv_create.log; fail "could not create casevault_test"; }
  echo "    fresh casevault_test created"
fi
export DATABASE_URL="$TEST_URL"
export TEST_DATABASE_URL="$TEST_URL"

echo "==> Migrations (upgrade head -> downgrade base -> upgrade head)"
$PY -m alembic -c apps/api/alembic.ini upgrade head
$PY -m alembic -c apps/api/alembic.ini downgrade base
$PY -m alembic -c apps/api/alembic.ini upgrade head

echo "==> pytest (real Postgres)"
$PY -m pytest -q

echo "==> ruff"
$PY -m ruff check apps workers scripts tests

if [ "$RUN_WEB" -eq 1 ]; then
  echo "==> web: lint / typecheck / build"
  npm run lint --workspace=web
  npm run typecheck --workspace=web
  npm run build --workspace=web
fi

echo
echo "GATE GREEN — python, migrations, lint${RUN_WEB:+ and web} all pass."
