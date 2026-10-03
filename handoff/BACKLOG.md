# BACKLOG

## Wave 3 follow-ups (from WS-CLAIMS)
- [P1] One-click “create verification task from element gap” — needs `tasks` table (Sprint M2 collab); gap rows already expose `element_id` + stable `code`.
- [P2] Heatmap summary + stacked element-card view (UX Spec Screen 10 options B/C) — matrix table is option A, shipped.
- [P2] Element history tab (who linked/unlinked what) — needs comments/approvals infra.
- [P2] Semantic re-ranking for `support-candidates` via Wave 4 embeddings (currently lexical).
- [P3] Claim-level CSV/Markdown export (PRD: markdown export for early claim charts).

## Reconciliation (blocked on Wave 1/2 landing)
- [P1] Replace `app/routers/matters.py` bootstrap stub with real WS-MATTERS router.
- [P1] Replace frozen `alembic/versions/0001_bootstrap.py` with the migration ladder from the schema draft.
- [P2] Move dev seeding into `scripts/seed_dev_data.py`.
