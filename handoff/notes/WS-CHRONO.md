
### Arena Update [2026-10-03 03:47:32]
```text
tion Target: arena/01a0899f-casevault · Migration: 0005 (reserved for events schema)Paste this into the subagent session:Markdown
You are the implementer for workstream **WS-CHRONO** of CaseVault Wave 3.

Worktree: ../casevault-chrono (Branch: feat/chronology-ui).

Binding rules: handoff/AGENT_POLICY.md.



## Deliverables &amp; Write Set:

You own exclusively:

- `apps/web/app/chronology/**`

- `apps/web/components/chronology/**`

- `apps/api/alembic/versions/0005_*.py` (events, event_fact_links, event_actor_links)

- `apps/api/app/models/event.py`, `apps/api/app/schemas/event.py`, `apps/api/app/routers/events.py`

- `apps/web/lib/api.ts` (append only in your section)

- `tests/api/test_events.py`



## Invariants:

1. Chronology consumes facts in `review_state = accepted`.

2. Do not touch `apps/web/app/evidence/**` or `apps/web/app/ledger/**`.

3. Verify with `pytest tests/api/test_events.py` and `npm run build --workspace=web`.

4. When finished, write `handoff/notes/WS-CHRONO.md`.
```

### Arena Update [2026-10-03 03:50:34]
```text
Now let me check the schema draft for the events tables and the existing chronology page:
```

### Arena Update [2026-10-03 03:56:03]
```text
All conventions are clear. Now I'll write the API layer, starting with the event models:
```

### Arena Update [2026-10-03 03:57:00]
```text
Let me align the enum column style exactly with the Wave 2 models:
```

### Arena Update [2026-10-03 03:58:16]
```text
Now the events router with inline service logic (services/event_service.py is not in my write set):
```

### Arena Update [2026-10-03 03:59:29]
```text
Now the migration (0005, reserved for this workstream):
```

### Arena Update [2026-10-03 05:21:52]
```text
Please git add all modified/created files for chronology, git commit with message "WS-CHRONO: timeline events, actors, links, and migration 0005", and git push origin arena/01a100f2-casevault.
```
