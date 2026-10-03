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
- **D-005 (Wave 3/WS-AI-INTEL, resolves WS-VERIFY F2 — "D1"):** AI router adopts
  the `/api/v1` namespace (option a). Router keeps internal prefix `/ai` and is
  mounted in `app/main.py` with `prefix="/api/v1"` alongside claims/matters;
  live surface is `/api/v1/ai/*`. Old `/api/ai/*` removed (verified 404 live).
- **D-006 (resolves WS-VERIFY "D2"):** Endpoint inventory stays as merged:
  `POST /ai/proposals/runs` (202), `GET /ai/proposals`,
  `POST /ai/agent-runs` (201), `GET /ai/agent-runs/{id}`,
  `POST /ai/agent-runs/{id}/steps/{step_id}/proposals` (201),
  `GET /ai/providers[/health]`. No `/proposals/generate`, no `/stream` —
  neither exists in Tech Spec §9.2; streaming intake is served inside
  `POST /proposals/runs` (StreamEvent pipeline). Verifier cannot invent
  surface; owner declines the rename.
- **D-007 (resolves WS-VERIFY "D3"):** Success-code bar is **2xx** — 202 for
  the async extraction run, 201 for resource creation. Literal-200 demand
  rejected as REST-incorrect.
