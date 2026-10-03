# KNOWN_ISSUES

1. **Bootstrap scaffold vs. future waves.** `matters.py` stub, `0001_bootstrap`
   migration and `app/seed_dev.py` exist only because Wave 1/2 output was absent
   from this checkout; reconciliation steps are in `handoff/notes/WS-CLAIMS.md §5`.
2. **SQLite fallback quirk.** On SQLite, `onupdate=func.now()` timestamps can be
   equal within a second; don't build UI on `updated_at` ordering precision.
3. **No auth yet.** Workspace scoping middleware is Wave 1; all routes are open
   locally (acceptable: local-first, single-user dev).
4. **`checkfirst` bootstrap migration** doesn't version enum types; Postgres enum
   evolution is handled by the real migration ladder, not here.
