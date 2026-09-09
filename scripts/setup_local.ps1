# CaseVault local setup (Windows PowerShell). Idempotent — safe to re-run.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/setup_local.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "==> Checking prerequisites"
foreach ($tool in @("python", "node", "npm")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Write-Host "    MISSING: $tool"; exit 1
  }
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "    NOTE: docker not found — needed for 'make infra-up' (postgres/redis)"
}

Write-Host "==> Creating local data directories (git-ignored)"
foreach ($d in @("uploads","processed","ocr","thumbnails","exports","diagnostics","logs","vector","backups","temp")) {
  New-Item -ItemType Directory -Force -Path (Join-Path "data" $d) | Out-Null
}

Write-Host "==> Creating .env.local from .env.example (if missing)"
if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
  Write-Host "    created .env.local — review it before running the app"
} else {
  Write-Host "    .env.local already exists, leaving as-is"
}

Write-Host "==> Creating python virtualenv (.venv)"
if (-not (Test-Path ".venv")) { python -m venv .venv }
& .venv\Scripts\pip.exe install --quiet --upgrade pip
& .venv\Scripts\pip.exe install --quiet -r requirements-dev.txt

Write-Host "==> Installing web dependencies (npm workspaces)"
npm install

Write-Host ""
Write-Host "Setup complete. Next steps:"
Write-Host "  1. Review .env.local"
Write-Host "  2. docker compose up -d postgres redis"
Write-Host "  3. .venv\Scripts\python -m uvicorn app.main:app --app-dir apps/api --reload --port 8000"
Write-Host "  4. npm run dev --workspace=web"
Write-Host "  5. .venv\Scripts\python -m workers.run_worker"
