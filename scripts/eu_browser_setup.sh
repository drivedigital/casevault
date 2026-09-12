#!/usr/bin/env bash
# EU-V — browser test tooling setup (independent evidence browser acceptance).
#
# Contract: docs/contracts/evidence_ui_closure.md v1.0 FROZEN, including the
# 2026-09-11 integration amendment (isolated pinned install approved in
# principle; platform, cleanup and credential-safe corrections required).
# Write set: scripts/eu_browser_* (EU-V). Nothing here edits product code,
# dependency manifests, lockfiles or CI. The install target lives under
# data/temp/ (git-ignored via `data/*`).
#
# Usage:
#   bash scripts/eu_browser_setup.sh                      # auto (managed first)
#   bash scripts/eu_browser_setup.sh playwright-download  # install + use managed
#   bash scripts/eu_browser_setup.sh managed              # managed browser only
#   bash scripts/eu_browser_setup.sh npm-linux            # npm build (linux only)
#   EU_V_CHROMIUM_EXECUTABLE=/path/to/chrome bash scripts/eu_browser_setup.sh
#
# Then: source data/temp/eu-browser-tools/env.sh
#
# Exit codes: 0 ready, 1 setup/verification failure.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# --- pinned versions (bump deliberately, in a EU-V PR, never ad hoc) ---------
PLAYWRIGHT_VERSION="${EU_V_PLAYWRIGHT_VERSION:-1.63.0}"
CHROMIUM_NPM_PACKAGE="${EU_V_CHROMIUM_NPM_PACKAGE:-@sparticuz/chromium@152.0.0}"

TOOLS_DIR="${EU_V_TOOLS_DIR:-$REPO_ROOT/data/temp/eu-browser-tools}"
# Where a legacy managed symlink may live. Overridable so the guard tests can
# exercise preservation without touching the repository path.
LINK_PATH="${EU_V_MODULE_LINK:-$REPO_ROOT/tests/browser/node_modules}"
ENV_FILE="$TOOLS_DIR/env.sh"
MODE="${1:-auto}"

case "$MODE" in
  auto|managed|npm-linux|playwright-download) ;;
  *) echo "unknown mode: $MODE (auto|managed|npm-linux|playwright-download)" >&2; exit 2 ;;
esac

echo "==> EU-V browser tooling setup (mode: $MODE)"
echo "    playwright @playwright/test@$PLAYWRIGHT_VERSION"
echo "    browser    $CHROMIUM_NPM_PACKAGE (linux fallback only)"
echo "    target     $TOOLS_DIR (git-ignored)"

command -v node >/dev/null || { echo "node >= 18.17 required" >&2; exit 1; }
command -v npm  >/dev/null || { echo "npm required" >&2; exit 1; }

mkdir -p "$TOOLS_DIR" tests/browser

# 1. Install the pinned runner (and the Linux browser package) into the scratch
#    prefix. This deliberately does NOT touch apps/web/package.json, the root
#    package.json or package-lock.json.
cat > "$TOOLS_DIR/package.json" <<'JSON'
{
  "name": "eu-v-browser-tools",
  "private": true,
  "version": "1.0.0",
  "description": "Scratch, git-ignored install prefix for EU-V browser acceptance (not a product dependency)"
}
JSON

PACKAGES=("@playwright/test@$PLAYWRIGHT_VERSION")
# The npm-shipped build is an x86_64 Linux binary; installing it on macOS would
# only be dead weight, and it can never be used there (the resolver refuses).
if [ "$(uname -s)" = "Linux" ]; then
  PACKAGES+=("$CHROMIUM_NPM_PACKAGE")
fi

echo "==> npm install (scratch prefix)"
npm install --prefix "$TOOLS_DIR" --no-audit --no-fund "${PACKAGES[@]}"

PLAYWRIGHT_CLI="$TOOLS_DIR/node_modules/@playwright/test/cli.js"
[ -f "$PLAYWRIGHT_CLI" ] || { echo "playwright CLI missing at $PLAYWRIGHT_CLI" >&2; exit 1; }

# 2. Module resolution for tests/browser/*.spec.ts uses NODE_PATH (exported in
#    env.sh, set by scripts/eu_browser_run.sh). No manifest inside the repo and
#    no destructive handling of paths another owner may have created:
#      - an EU-V managed symlink (points at our tools dir) is replaced,
#      - a foreign symlink or a real directory is preserved with a warning.
if [ -L "$LINK_PATH" ]; then
  TARGET="$(readlink "$LINK_PATH")"
  case "$TARGET" in
    *"/eu-browser-tools/node_modules"|*"$TOOLS_DIR/node_modules")
      rm -f "$LINK_PATH"
      echo "==> removed EU-V managed link $LINK_PATH"
      ;;
    *)
      echo "==> WARNING: preserving foreign symlink $LINK_PATH -> $TARGET"
      ;;
  esac
elif [ -e "$LINK_PATH" ]; then
  echo "==> WARNING: preserving existing $LINK_PATH (not created by EU-V; left untouched)"
else
  echo "==> no module link at $LINK_PATH (NODE_PATH is used instead)"
fi
export NODE_PATH="$TOOLS_DIR/node_modules:${NODE_PATH:-}"

# 3. Resolve a Chromium executable: explicit override -> Playwright-managed ->
#    npm-shipped Linux build. `playwright-download` really installs a managed
#    browser and never silently falls back to the Linux binary.
RESOLVER="$REPO_ROOT/scripts/eu_browser_resolve_browser.mjs"
VERIFIER="$REPO_ROOT/scripts/eu_browser_verify_browser.cjs"

if [ "$MODE" = "playwright-download" ]; then
  export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$TOOLS_DIR/browsers}"
  echo "==> installing managed Chromium into $PLAYWRIGHT_BROWSERS_PATH"
  node "$PLAYWRIGHT_CLI" install chromium
  echo "==> managed install finished"
fi

echo "==> resolving Chromium binary"
if ! BROWSER_JSON="$(node "$RESOLVER" --tools "$TOOLS_DIR" --mode "$MODE")"; then
  echo "EU-V setup: no usable Chromium. Options:" >&2
  echo "  bash scripts/eu_browser_setup.sh playwright-download" >&2
  echo "  npx playwright install chromium" >&2
  echo "  EU_V_CHROMIUM_EXECUTABLE=/path/to/chrome bash scripts/eu_browser_setup.sh" >&2
  exit 1
fi
echo "$BROWSER_JSON"

EXECUTABLE="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).executable)' "$BROWSER_JSON")"
SOURCE="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).source)' "$BROWSER_JSON")"
LIB_DIR="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).libDir ?? "")' "$BROWSER_JSON")"
FONTS_DIR="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).fonts ?? "")' "$BROWSER_JSON")"

# 4. Verify the resolved binary really launches (fail fast, never green-by-claim).
echo "==> verifying launch"
if ! VERIFY_JSON="$(node "$VERIFIER" "$EXECUTABLE" "$LIB_DIR" "$FONTS_DIR")"; then
  echo "EU-V setup: the resolved browser did not launch; nothing marked ready." >&2
  exit 1
fi
echo "$VERIFY_JSON"

# 5. Emit env file (git-ignored, mode 0600, shell-quoted).
umask 077
cat > "$ENV_FILE" <<ENV
# Generated by scripts/eu_browser_setup.sh — git-ignored; re-create any time.
# Source it, or let scripts/eu_browser_run.sh source it for you.
export EU_V_NODE_PATH="$TOOLS_DIR/node_modules"
export EU_V_TOOLS_DIR="$TOOLS_DIR"
export EU_V_PLAYWRIGHT_CLI="$PLAYWRIGHT_CLI"
export EU_V_PLAYWRIGHT_VERSION="$PLAYWRIGHT_VERSION"
export EU_V_CHROMIUM_PATH="$EXECUTABLE"
export EU_V_CHROMIUM_SOURCE="$SOURCE"
export EU_V_CHROMIUM_LIB_DIR="$LIB_DIR"
export EU_V_CHROMIUM_FONTS_DIR="$FONTS_DIR"
export PATH="$TOOLS_DIR/node_modules/.bin:\$PATH"
ENV
chmod 600 "$ENV_FILE"
umask 022

echo
echo "==> ready"
echo "    source $ENV_FILE"
echo "    .venv/bin/python scripts/eu_browser_stack.py start"
echo "    bash scripts/eu_browser_run.sh"
echo
echo "    Browser: $EXECUTABLE (source: $SOURCE)"
echo "    $(node -e 'const v = JSON.parse(process.argv[1]); console.log("Verified launch: " + v.version + " | platform=" + v.platform + " | pdfViewerEnabled=" + v.pdfViewerEnabled + " | plugins=" + v.plugins)' "$VERIFY_JSON")"
if [ "$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).pdfViewerEnabled))' "$VERIFY_JSON")" != "true" ]; then
  echo "    NOTE: this build has no PDF viewer; native PDF render cases are EU-M's"
  echo "         (see tests/browser/eu-acceptance-CHECKLIST.md §5)."
fi
