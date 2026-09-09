# CaseVault — Local Run Reports (logs branch)

This orphan branch archives **local-agent run reports** from the tester
machine (and diagnostics), one file per run under `local-runs/`.

Rules (see `handoff/DECISIONS.md` on the working branch):

- Machine identifiers (usernames, home-dir paths, hostnames) are
  **redacted** before committing.
- No evidence, no `.env*` contents, no credentials — ever.
- This branch is **never merged** into `arena/01a08429-casevault`
  (or `main`); it is an out-of-band archive only.

Naming: `local-runs/YYYY-MM-DD-<topic>.md`.
