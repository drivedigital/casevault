Here's a paste-ready instruction block for your local agent. It's written to be self-contained — they don't need any prior context beyond repo access:

---

# CaseVault — Local Agent Instructions (Wave 3 Acceleration & Parallel Operations)

You are an agent operating in the CaseVault legal evidence workspace. Your job: safely develop, verify, or review assigned components in an isolated worktree. **The app handles sensitive legal evidence — safety rules below are non-negotiable.**

## Safety rules (read first)

1. **Never commit anything under `data/`, `.env.local`, or any `.env*` file.** Run `git status` before any commit and confirm none of those paths appear.
2. **Worktree Isolation:** Always operate inside your assigned git worktree (e.g. `../casevault-<ws>`), never directly in another agent's worktree or the shared workspace root without coordination.
3. Real evidence must never leave this machine except as a redacted diagnostics bundle on a `*-logs` branch.
4. Do not push to `main`. Do not create tags or releases without integrator approval.
5. Do not paste secrets, API keys, or raw evidence text into chat or issue trackers.
6. Adhere strictly to the disjoint write set defined in `handoff/AGENT_POLICY.md`.

## 1. Development Accelerators & Shared Secrets

The workspace has configured local and cloud accelerators that can be used during testing and execution:

- **OCR.space Engine:** `https://api.ocr.space/parse/image` (configured via `OCR_SPACE_API_KEY=K88494079788957`). Used automatically by `workers/pipeline/ocr_engine.py` when documents require OCR.
- **Cloudflare Worker Edge Gateway:** `https://casevault-worker.dan-2eb.workers.dev` (Source: `infra/cloudflare-worker/`). Handles HMAC-verified GitHub webhooks (`/webhooks/github`) and proxies Supabase REST requests.
- **AI Models:** Access to NVIDIA AI endpoints, Ollama Cloud, and OpenAI/Anthropic keys via `.env.local` for fact extraction, VLM evidence processing, and proposal generation.
- **Supabase Integration:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured in `.env.local` for remote persistence and vector storage.

## 2. Setting Up an Isolated Git Worktree (Subagents)

When assigned a workstream (e.g. `feat/chronology-ui`), create and enter your own worktree:

```bash
git worktree add ../casevault-chrono -b feat/chronology-ui
cd ../casevault-chrono
npm ci
```

When work is finished and merged:
```bash
cd /Users/dangeorge/Documents/GitHub/casevault
git worktree remove ../casevault-chrono
```

## 3. Running Services Locally

```bash
# Infrastructure
docker compose up -d postgres redis

# Terminal 1: FastAPI Backend (:8100)
.venv/bin/python -m uvicorn app.main:app --app-dir apps/api --reload --host 0.0.0.0 --port 8100

# Terminal 2: Next.js Frontend (:3000)
npm run dev --workspace=web

# Terminal 3: RQ Worker (Background queue)
.venv/bin/python -m workers.run_worker
```


## 5. Verification checklist

Mark each PASS/FAIL:

| # | Check | Command / action | Expected |
|---|-------|------------------|----------|
| 1 | API health | `curl http://localhost:8000/health` | `"status": "ok"` |
| 2 | API v1 health | `curl http://localhost:8000/api/v1/health` | `"status": "ok"` |
| 3 | Web shell | open `http://localhost:3000` | CaseVault nav sidebar + "Phase 0 scaffold" badge |
| 4 | All 11 routes | click every nav item (Matters → Settings) | each renders a "Planned — not built yet" placeholder, no errors |
| 5 | Proxy | `curl http://localhost:3000/api/v1/health` | same JSON as check 2 |
| 6 | Env validation | `make check-env` | `Result: OK` |
| 7 | Worker without redis | `make ping-job` | JSON with `"status": "ok"` |
| 8 | Python tests | `make test` | `4 passed` |
| 9 | Lint | `make lint` | ruff + ESLint clean |
| 10 | Web build | `npm run build --workspace=web` | builds, 14 routes listed |
| 11 | Backup (dry run) | `.venv/bin/python scripts/backup_workspace.py` | prints plan, exits "Dry run" |
| 12 | Backup (real) | `.venv/bin/python scripts/backup_workspace.py --yes` | creates `data/backups/<ts>/` with `db.dump` + `data_archive.tar.gz` |

## 6. If anything fails

Capture and package diagnostics:

```bash
# reproduce with logs
make api 2>&1 | tee data/logs/api.log

# collect a redacted bundle
python scripts/collect_logs.py --feature arena/01a08429-casevault --note "<what broke + exact steps>"

# review the printed bundle path, then push it
python scripts/collect_logs.py --feature arena/01a08429-casevault --note "<same note>" --push
```

This creates branch `arena/01a08429-casevault-logs` with the redacted bundle. Secrets are auto-redacted, but **open the bundle and eyeball it before pushing**.

## 7. Report back

Paste this template with your results:

```
OS / Python / Node / Docker versions:
Checklist results (1–12 PASS/FAIL, with notes):
Worker queue list as printed:
Any warnings from check-env or collect_logs:
Logs branch pushed (if any): 
Unexpected behavior not covered by the checklist:
```

**Expected outcome:** all 12 checks pass. The only known untested area is Docker connectivity itself — if `make infra-up` fails, that's the report.

---

One note: I've kept the session work on `arena/01a08429-casevault`; when your local agent runs `collect_logs.py --push`, it will create the companion `arena/01a08429-casevault-logs` branch, which is exactly the `-logs` convention the blueprint calls for. When you get the report back, paste it here and I'll triage whatever failed (or kick off Phase 1 — workspace/matter CRUD — if it's clean).
