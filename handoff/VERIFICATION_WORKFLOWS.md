# Verification workflows and safety boundaries

Audited 2026-09-12 at product a040e9f / documentation0788ccc. This document
explains shipped automation; it does not modify scripts or release EU-M's hold.

## Shipped GitHub Actions

`.github/workflows/ci.yml` runs on push, pull_request and workflow_dispatch.

| Job | Environment / scope | Does NOT prove |
|---|---|---|
| python | Python3.12, PG16 casevault_ci; Ruff, upgrade head, pytest | Migration downgrade, native Mac, browser clicks |
| web | Node20, npm ci, lint/typecheck/build | Browser interactions |
| secrets | Gitleaks, contents:read + pull-requests:read, automatic token | Absolute absence of sensitive data in all artifacts |
| intake | PG16, fail-closed intake guards/E2E + headless smoke | Evidence UI behavior |
| evidence | PG16 + private Redis binary, required HTTP/worker/storage E2E;15-min job limit | Native PDF, final browser acceptance |

Run34720445577 at0788ccc passed all five jobs; see STATUS.md. Do not transfer
that result to future commits or claim browser CI exists. EU-V tooling/specs are
still PR19, not installed on integration; no browser CI job is approved.
CI evidence log/JUnit artifacts have seven-day retention and are not durable forever.

## Full integrator gate

`scripts/verify_all.sh` runs migration upgrade/downgrade/upgrade, pytest, Ruff,
web lint/typecheck/build. `--no-web` is partial proof only. Tests delete data;
migration downgrade base is destructive. This is never a command for a working
case database. No local execution is requested while EU-M is held.

**Important shipped hazard:** when DATABASE_URL is supplied, the script uses
TEST_DATABASE_URL or FALLS BACK to DATABASE_URL. API fixtures also have fallback
behavior. The local-ops explicit-target guard is NOT merged. A docs warning is
not an enforced guard; never rely on the script to protect a real database.

Prerequisites for an authorized run: own disposable database/storage/queues,
requirements-dev installed, npm ci, working PG and redis-server binary. Stop
review web/API/workers using the same test schema or .next before the gate;
never stop another owner's services. Background workers consuming test jobs can
change intended inline-test behavior. Strict flags require dependencies, not skips.

For a fresh, verified disposable **sandbox-only embedded-PG** run, after installing
approved pgserver and ensuring the default harness cluster is owned and disposable:

```bash
# Suppress inherited DB targets so the script uses its embedded casevault_test.
# It DROPS and recreates that database. Do not use an existing shared harness.
set -o pipefail
env -u DATABASE_URL -u TEST_DATABASE_URL \
  EVIDENCE_REQUIRE_DEPS=1 INTAKE_REQUIRE=1 INTAKE_ALLOW_APP_DB=1 \
  bash scripts/verify_all.sh 2>&1 | tee /home/user/verification-gate.log
```

Use a unique private run-log path in actual runs; the example is not a persistence
guarantee. INTAKE_ALLOW_APP_DB=1 acknowledges ONLY the disposable schema selected
by this gate, never an application DB. redis-server must be on PATH, or set
REDIS_SERVER to the explicitly verified private binary (e.g. the approved
redislite installation). Optional sandbox packages stay out of product manifests.
For compose/TCP use explicit reviewed disposable DATABASE_URL and TEST_DATABASE_URL;
never publish either URL or infer disposable ownership from its name alone.

Gate exit0 with skips is not the strict119/no-skip baseline. Capture commands,
counts, warnings and actual exit code. Do not change expected counts to hide a
failure; new test counts may legitimately grow with reviewed changes.

## Browser acceptance

- EU-D/L author suites exist under tests/browser; integrator measured43 pass/2
  worker-only skips on combined tree, plus earlier separate D-only worker proof.
- EU-V owns independent eu-acceptance-* specs in PR19. Its saved partial/full
  counts remain distinct; harness/fixture corrections still need review/reruns.
- Success must correlate actual uploaded IDs, requests, real RQ result payloads,
  committed SQL state and UI. Explicit OCR reprocess uses ocr_source; TXT upload
  itself is inline. RQ FINISHED may contain status=failed in the returned payload.
- Label transport/capability/clock injections. HTTP, builds, manual UI observation
  and real browser automation are distinct proof classes. Stub PDF skipped is
  expected, not successful extraction. No native PDF claim from forced capability.
- Bounded diagnostics and current case authorization: STATUS.md and PR19. Do not
  run all specs merely to recover counts. Keep separate per-run outputs and push
  redacted ledgers because scratch files may disappear on reset.

## Edge Gateway & Cloudflare Worker Verification

The edge gateway at `https://casevault-worker.dan-2eb.workers.dev` handles webhook receipt, HMAC validation, and Supabase REST requests.

1. **Health Verification:**
   ```bash
   curl -s https://casevault-worker.dan-2eb.workers.dev/
   # Expected: {"service":"casevault-worker","status":"healthy"}
   ```

2. **Supabase Health Verification:**
   ```bash
   curl -s https://casevault-worker.dan-2eb.workers.dev/supabase/health
   # Expected: {"service":"supabase-rest","status":"ok"|"accessible"}
   ```

3. **GitHub Webhook Verification (HMAC Signature):**
   ```bash
   python scripts/webhook_listener.py
   # Or send test ping with X-Hub-Signature-256 header computed via GITHUB_WEBHOOK_SECRET
   ```

## Hybrid OCR Engine Verification (Local pypdf + OCR.space Cloud)

OCR pipeline verification tests both local text-based extraction and remote cloud OCR:

1. **Unit / Inline Verification:**
   ```bash
   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/casevault_test pytest tests/workers/test_ocr_engine.py
   ```

2. **End-to-End OCR Worker Job:**
   Enqueue an image/PDF source through FastAPI (`POST /api/v1/workspaces/{id}/sources/{id}/reprocess`) with payload `{"engine":"auto"}`.
   Verify RQ worker job log indicates `OCR.space API HTTP 200` and creates text pages in `source_pages`.

