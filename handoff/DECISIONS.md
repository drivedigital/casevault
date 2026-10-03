# DECISIONS

- **D-001 (Wave 3/WS-CLAIMS):** Burden-of-proof = 3-step vocabulary (`unsupported`,
  `partially_supported`, `proven`) derived live from the proof graph; `proven`
  *requires* an accepted fact + primary/public-record evidence anchor — attorney
  notes alone can never mark a claim proven. Stored 6-state
  `claim_support_status_enum` remains the persisted analysis field, refreshed by
  recompute. Rationale: invariants 1–2 + “explain the badge” UX requirement.
- **D-002:** Claim-level rollup computed at read time (no new columns) to honour
  “Migration: none” and avoid drift with the existing-table contract.
- **D-003:** Bootstrap Phase-0 scaffold was created inside this wave (models,
  config, health, alembic `0001`, matters read-stub) instead of pausing for
  Wave 1/2 — the workstream is unverifiable without it; all of it is explicitly
  marked for replacement in the handoff notes.
- **D-004:** Portable `sa.Uuid` + check-constrained enums keep one model set
  valid on both Postgres and SQLite; tests never require Docker.
