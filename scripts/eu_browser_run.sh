#!/usr/bin/env bash
# EU-V — run the independent browser acceptance suite.
#
# Prerequisites:
#   bash scripts/eu_browser_setup.sh                          (once; pins + verifies the browser)
#   .venv/bin/python scripts/eu_browser_stack.py start        (isolated API/worker/web/DB/Redis)
#
# Usage:
#   bash scripts/eu_browser_run.sh                            # whole suite
#   bash scripts/eu_browser_run.sh --grep "EU-D/D5"           # one checklist group
#   bash scripts/eu_browser_run.sh eu-acceptance-tooling-guards.spec.ts
#   EU_V_HEADED=1 bash scripts/eu_browser_run.sh              # watch it (local machine)
#
# Artifacts (traces/screenshots/console/junit) land in git-ignored
# data/diagnostics/; only redacted summaries are ever pasted into a handoff.
# Connection URLs are never printed — the stack's env output is opt-in and
# shell-quoted (`python scripts/eu_browser_stack.py env`).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TOOLS_ENV="data/temp/eu-browser-tools/env.sh"
[ -f "$TOOLS_ENV" ] || { echo "run scripts/eu_browser_setup.sh first" >&2; exit 1; }
# shellcheck disable=SC1090
source "$TOOLS_ENV"

# Resolve @playwright/test from the scratch install prefix (no manifest change).
export NODE_PATH="${EU_V_NODE_PATH}:${NODE_PATH:-}"

# Stack coordinates: opt in explicitly, and never echo the values.
if [ -f data/temp/eu-browser-stack/state.json ]; then
  eval "$(.venv/bin/python scripts/eu_browser_stack.py env)" >/dev/null
fi
export EU_V_WEB_BASE_URL="${EU_V_WEB_BASE_URL:-http://127.0.0.1:3101}"
export EU_V_API_BASE_URL="${EU_V_API_BASE_URL:-http://127.0.0.1:8101}"

DIAGNOSTICS="$REPO_ROOT/data/diagnostics/eu-browser"
mkdir -p "$DIAGNOSTICS"
export EU_V_ARTIFACT_DIR="$DIAGNOSTICS"

echo "==> EU-V browser acceptance"
echo "    web       $EU_V_WEB_BASE_URL"
echo "    chromium  ${EU_V_CHROMIUM_PATH:-playwright default} (${EU_V_CHROMIUM_SOURCE:-managed})"
echo "    artifacts $DIAGNOSTICS"

if ! curl -sS -o /dev/null -w "    web probe: %{http_code}\n" "$EU_V_WEB_BASE_URL/evidence"; then
  if [ "${EU_V_ALLOW_NO_STACK:-0}" = "1" ]; then
    echo "    WARNING: no stack at $EU_V_WEB_BASE_URL — running specs that start their own." >&2
  else
    echo "web server not reachable at $EU_V_WEB_BASE_URL; start it with" >&2
    echo "  .venv/bin/python scripts/eu_browser_stack.py start" >&2
    echo "(or set EU_V_ALLOW_NO_STACK=1 for guard/tooling specs that manage a stack themselves)" >&2
    exit 2
  fi
fi

node "$EU_V_PLAYWRIGHT_CLI" test \
  --config tests/browser/eu-acceptance-playwright.config.ts \
  "$@"
