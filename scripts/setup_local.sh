#!/usr/bin/env bash
# CaseVault local setup (Linux/macOS). Idempotent — safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Checking prerequisites"
missing=0
for tool in python3 node npm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "    MISSING: $tool"; missing=1
  fi
done
command -v docker >/dev/null 2>&1 || echo "    NOTE: docker not found — needed for 'make infra-up' (postgres/redis)"
[ "$missing" -eq 0 ] || { echo "Install missing tools and re-run."; exit 1; }

echo "==> Creating local data directories (git-ignored)"
mkdir -p data/{uploads,processed,ocr,thumbnails,exports,diagnostics,logs,vector,backups,temp}

echo "==> Creating .env.local from .env.example (if missing)"
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "    created .env.local — review it before running the app"
else
  echo "    .env.local already exists, leaving as-is"
fi

echo "==> Creating python virtualenv (.venv)"
if [ ! -d .venv ]; then python3 -m venv .venv; fi
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements-dev.txt

echo "==> Installing web dependencies (npm workspaces)"
npm install

cat <<'DONE'

Setup complete. Next steps:
  1. Review .env.local
  2. make infra-up     # starts postgres + redis (needs docker)
  3. make api          # FastAPI on :8000  -> curl localhost:8000/health
  4. make web          # Next.js on :3000
  5. make worker       # RQ worker (needs redis); or: make ping-job (no redis)
DONE
