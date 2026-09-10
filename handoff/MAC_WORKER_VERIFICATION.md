# Local Verification Report: macOS Worker Stability

**Date:** 2026-09-10
**Status:** Stable in the locally reported configuration; scope limited below.
**Provenance:** Local tester report committed as `04e84cf`.

## Environment
- **Reported tested short SHA:** `4672182`. Its repository-resolved full SHA is
  `4672182cbac06be265e8a019ce6e8b1eae0d575b`; the original report's full SHA
  contained a transcription error.
- **Runtime:** Python 3.12.14 (Homebrew), macOS 26.6.2 (ARM-64).
- **Infrastructure:** PostgreSQL 16 and Redis 7 (Docker).
- **Worker model:** `rq.SpawnWorker`, reportedly selected by the Darwin default.

## Reported test execution
Trigger: sequential upload of two PDF sources.
- Job 1: `f0203a2d-1213-4043-bc85-747d77708954`.
- Job 2: `949f8924-4afe-4b9a-8dde-a6cb061e323d`.

| Check | Local tester result |
|---|---|
| Process stability | No SIGABRT/OBJC crash; worker remained alive |
| Lifecycle | Both jobs moved queued → started → finished |
| Persisted OCR status | `skipped`, expected for the current OCR stub |
| Original-file preservation | Byte equality reported for one source |

The identifying source filename and checksum have been omitted from the current
report. This edit does not remove them from Git history. Future verification
must use explicitly synthetic fixtures and exclude identifying evidence metadata.

## Interpretation and remaining checks
This report supports stability of **Python 3.12 + SpawnWorker** for the tested
PDF uploads. It does not separately isolate the effect of changing Python from
3.14, establish Python 3.14 compatibility, demonstrate OCR-engine extraction,
or document the original **Reprocess OCR button** sequence.

The integrator reviewed the report but did not execute native Mac tests.
To close the exact original reproduction, the local tester should use synthetic
fixtures, record the exact tested SHA/launcher/runtime, trigger two sequential
Reprocess OCR requests, inspect actual job results and persisted states, and
verify original bytes and absence of new native crashes. No blanket GSS or
Objective-C fork-safety override should be needed for the supported worker path.
