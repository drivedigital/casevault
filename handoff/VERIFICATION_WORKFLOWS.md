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

## Local test release and operational tools

EU-M has a limited synthetic preview release at a040e9f via OWNER_PREVIEW.md,
subject to mandatory isolation preflight. Full acceptance/real-data work remains
held. Historical setup recipes are reference, not permission.
Never stop Homebrew/system services or change ports without ownership review.
Python3.14/native Mac behavior is not proven by Linux CI or older Phase1 results.

The integrated `collect_logs.py --push` path creates another branch and may force-add
private bundles. Do NOT use that path in Arena; review/redact individual reports
and transfer through the approved report/attachment workflow. Pattern redaction is
not complete confidentiality protection. No data/, .env*, credentials or real case
material may be committed. The webhook/backup hardening proposal is unmerged;
local LaunchAgent/ngrok setup is owner-reported, not verified by these CI jobs.
See RECOVERY.md for backup hazards and restore prerequisites.

`make handoff-finish` is an advisory scaffold: file modification checks are not
acceptance, and its generic "give tester steps" does not override the current hold.
