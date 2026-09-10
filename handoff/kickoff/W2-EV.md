<!-- Brief + paste-ready prompt for one Wave 2 agent session.
     Rules: handoff/AGENT_POLICY.md · Plan: handoff/PARALLEL_PLAN.md §4a
     Contract: docs/contracts/wave2_intake_core.md v1.0 (frozen) -->

# W2-EV — Wave 2 — evidence follow-ups (excerpts API + per-source reprocess)

**Owner:** one agent session · **Branch:** base = `arena/01a0899f-casevault`
**Merge order:** parallel — merge whenever green, before W2-J if possible · **Depends on:** nothing (your own evidence module)

---

## Paste this into the agent session

```
Workstream **W2-EV** of the CaseVault parallel build — for the session
that built the evidence module. Read `handoff/AGENT_POLICY.md` and
`docs/contracts/wave2_intake_core.md` §6 and §10 first.

## Deliverable
The Sprint 3 delta-table gaps that Wave 2 depends on, **without changing any
existing response shape**:

- `POST /api/v1/sources/{id}/excerpts` — create an excerpt
  (`page_start`, `page_end`, `locator_text`, `excerpt_text`, `excerpt_type`,
  `anchor_json`); `excerpt_type ∈ quote|region|timestamp|bates|paragraph|other`.
- `GET /api/v1/sources/{id}/excerpts` — list.
- `DELETE /api/v1/source-excerpts/{id}` — 204.
- `POST /api/v1/sources/{id}/reprocess` — `{stages: ["ingest"|"ocr"]}` → 202
  `{queued, job_id, reason}`; sets the relevant status to `queued` and uses the
  existing graceful enqueue path (no redis → `queued:false` with a reason,
  still 202).
- Service/job code appended to your existing modules; excerpt schemas appended
  to `app/schemas/source.py`.
- `tests/api/test_source_excerpts.py` covering create/list/delete round-trip,
  workspace scoping, and the 202-without-redis path.

## Write set (nothing else)
`apps/api/app/schemas/source.py` (append), `app/services/source_service.py`
(append), `app/routers/sources.py` (append), `workers/pipeline/jobs.py`
(append), `tests/api/test_source_excerpts.py`.

## Proof required
`bash scripts/verify_all.sh --no-web` plus your excerpt test output; show the
`queued:false` reprocess response.

## Notes
- Waves 2's `fact_source_links.excerpt_id` is `SET NULL` and optional, so W2-G
  is not blocked by you — but do not slip past the wave without telling the
  integrator.
- Do **not** add pagination or change `GET /sources` here: response-shape
  changes are scheduled by the integrator (AGENT_POLICY §2.5). Pagination stays
  on the backlog.
- Write `handoff/notes/W2-EV.md` and report branch + sha when done.
```

---

*Read `handoff/kickoff/README.md` first: step 0 (base the branch on the
integration tip) and the environment setup are mandatory.*
