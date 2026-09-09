# Known Issues

Current defects and limitations, newest first. Triage per Roadmap §9
(Critical / High / Medium / Low).

## 2026-09-08 — Phase 0 scaffold

- **[Medium] Docker untested in build sandbox.** `make infra-up`, actual
  postgres/redis connectivity, and the `--check-ports` path of
  `check_env.py` were not exercised by the builder. First local test should
  confirm these.
- **[Low] Alembic has no migrations.** Expected — the first migration set
  (schema draft Migration 001) lands in Phase 1. `alembic upgrade head`
  currently does nothing.
- **[Low] Worker requires redis for `make worker`.** By design for now;
  `make ping-job` verifies the job code without redis.
- **[Low] Web app is placeholder routes only.** No API calls yet; the
  `/api/v1` dev rewrite is configured but unused until Phase 1.
- **[Low] `collect_logs.py --push` flow untested end-to-end** (creates a
  `-logs` branch and force-adds the bundle — test with a trivial note first).
