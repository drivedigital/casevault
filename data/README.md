# `data/` — LOCAL, SENSITIVE, NEVER COMMIT

This directory is the local storage root for CaseVault. Everything under
`data/` is git-ignored by default (this README is the single exception,
whitelisted in `.gitignore`).

Subdirectories (created by `scripts/setup_local.sh`):

| Subdirectory   | Contents                                              |
|----------------|-------------------------------------------------------|
| `uploads/`     | Original uploaded evidence files                      |
| `processed/`   | Derived/normalized files                              |
| `ocr/`         | OCR output caches                                     |
| `thumbnails/`  | Page/document thumbnails                              |
| `exports/`     | Generated exports (PDFs, CSVs)                        |
| `diagnostics/` | Log/diagnostic bundles produced by `collect_logs.py`  |
| `logs/`        | Local runtime logs                                    |
| `vector/`      | Local vector index artifacts                          |
| `backups/`     | Output of `scripts/backup_workspace.py`               |
| `temp/`        | Scratch space                                         |

Rules:

1. **Never force-add (`git add -f`) anything under `data/`** to a normal
   branch. The only sanctioned exception is a diagnostics bundle on a
   `feature/<topic>-logs` branch, created by `scripts/collect_logs.py`
   after redaction checks.
2. Real evidence stored here may be legally sensitive. Treat this machine
   accordingly.
3. To rotate or wipe local evidence, stop the app and delete the contents
   of this directory (keep this README).
