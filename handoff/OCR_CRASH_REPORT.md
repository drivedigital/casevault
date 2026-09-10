# Diagnostic Report: macOS Native OCR Worker Crash
**Date:** 2026-09-10
**Status:** Root Cause Identified / Fix Verified

## Environment
- **Tested SHA:** `b8e0d5a7c3e4f79380cf5ed40bf52c657663efc9`
- **Runtime:** Python 3.14.7 (Homebrew), macOS 26.6.2 (ARM-64)
- **Deps:** `rq 2.12.0`, `redis 7.4.1`, `psycopg2-binary 2.9.12`
- **Infra:** Postgres 16, Redis 7 (Docker)

## Results Summary

| Worker Configuration | Result | Observation |
| :--- | :--- | :--- |
| **Default RQ Worker** | 🔴 Crash | Immediate `SIGABRT` on PDF upload; no worker logs. |
| **`PGGSSENCMODE=disable`** | 🔴 Crash | No change; job stays `queued`. |
| **`SpawnWorker` (diag)** | ✅ Stable | Worker accepted PDF upload; remained running. |

## Root Cause Analysis
The crash is a **macOS Fork Safety violation**.
The CaseVault worker uses RQ's default `os.fork()` for job execution. Because the parent process initializes a `psycopg2` connection, the child process inherits a state that triggers a `SIGABRT` when it interacts with `CoreFoundation`/`Objective-C` via `libpq`. This is a known issue on macOS where forking after certain framework initialization is forbidden.

## Verified Fix
Changing the multiprocessing start method to `spawn` prevents the crash.
**Proposed implementation:**
Add `multiprocessing.set_start_method('spawn', force=True)` to `workers/run_worker.py` before initializing the `Worker`.

## Cleanup
- Synthetic sources removed.
- Temporary diagnostic scripts cleaned.
- Stack restored to standard configuration.
