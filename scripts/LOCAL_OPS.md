# Local operations

These tools do not constitute evidence-UI acceptance. Use the integrator's exact
checkpoint and checklist for acceptance; preserve the live checkout and data.

## Backup and recovery

Stop application writers (web/API/worker) before a real backup. The database dump
is consistent by itself; pairing it with files requires writers to be quiescent.
No real backup was taken during the tooling verification.

For the existing Postgres 16 Docker service:

```
.venv/bin/python scripts/backup_workspace.py --postgres-container casevault-postgres
.venv/bin/python scripts/backup_workspace.py --postgres-container casevault-postgres --yes
```

The first command only prints a plan. DATABASE_URL selects the database/user;
--postgres-container explicitly selects the server containing that database and
uses its matching pg_dump/pg_restore tools. Without that option, tools on PATH
are used. The Mac currently has version 18 tools: use the container option for
Postgres 16 recovery compatibility. --storage-root and --destination can override
paths; defaults respect LOCAL_STORAGE_ROOT and put backups under its backups/.
Process environment overrides .env.local, which overrides .env.

Completion requires a nonempty custom-format dump, successful pg_restore --list,
a readable file archive, and MANIFEST.json with SHA-256 checksums. Failure leaves
only a .partial directory, never a completed backup. Destination directories are
private to the local user. Connection URLs/passwords are not printed or saved in
the manifest. Backups still contain private data and possibly local credentials;
they are for local recovery, not for dev-logs or remote diagnostics.

A real recovery drill must restore db.dump into a NEW disposable database using
matching PostgreSQL tools, inspect expected rows, and verify archived original
bytes. Listing a dump is structural validation, not a restore drill. Never test
restoration over the working database. Verify archive checksums and inspect paths
before extraction; use an empty scratch directory for trusted backups only.

## Destructive tests

Set TEST_DATABASE_URL explicitly. API fixtures and verify_all.sh reject application
fallback and require a PostgreSQL database name with a test or ci segment (for
example casevault_test). URL query/fragment overrides are rejected. The name is a
safety convention, not proof the database is empty: use only a database you own
and may erase. CI already sets explicit disposable targets.

```
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/casevault_test make test
```

The full gate still performs downgrade base and deletes rows; use isolated
storage/queues and the contract's strict flags. Realistic manual testing should
use a controlled copy or synthetic records, separately from destructive tests.
No full gate or actual-case test was run for these local-tooling changes.

## Diagnostics

The collector redacts URL credentials and reads only .log/.txt files, excluding
symlinks and credential/secret filenames. Review bundles before relay; pattern
redaction is not a guarantee arbitrary evidence text or credentials are removed.
Never store secret material under a directory designated for collected logs.

## Webhook and monitoring

The existing endpoint forwards to 127.0.0.1:54160. The receiver requires
--secret-file and verifies HMAC-SHA256 and repository identity. Its secret lives
under ignored data/webhook-private/, outside collected logs.

Per-user LaunchAgents com.casevault.webhook and com.casevault.webhook-tunnel use
RunAtLoad + KeepAlive. They restart after login and process exit; they do not run
before login or while the Mac sleeps. Inspect status with launchctl print using
your gui UID and either label. Plists live in ~/Library/LaunchAgents; logs are in
data/logs/webhook-process.log and webhook-tunnel.log. The tunnel keeps the existing
ngrok endpoint/account. GitHub ping and push delivery responses are the end-to-end
health signal, not merely a process being present.

The five-minute Codex task is a separate notification/coordination mechanism.
It now refreshes a tab displaying the exact AI-service-busy message and requests
continuation, at most once per check. Preserve existing process results and
checkpoint work before repeating long runs. Desktop alerts alone do not wake it.

Communication uses the existing dev-logs branch, local-runs/ directory. Only
redacted reports go there; code changes are on codex/local-ops-safety for review.
Do not merge the dev-logs branch into integration.
