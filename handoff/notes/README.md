# `handoff/notes/` — per-workstream notes

Parallel agents write **one file per workstream** here
(`handoff/notes/WS-A.md`, `WS-B.md`, …) instead of appending to
`handoff/WORKLOG.md`, so concurrent branches never conflict on the worklog.

Each note states, in this order:

1. workstream id + contract version implemented
2. what changed (files, endpoints, tables)
3. proof — exact commands run and their results
4. risks / follow-ups
5. what the next agent (or the integrator) must know

The integrator consolidates these into `handoff/WORKLOG.md`, updates
`BACKLOG.md` / `KNOWN_ISSUES.md` / `TESTING.md` once per wave, and moves the
notices to `handoff/notes/archive/<wave>/` when the wave closes.
