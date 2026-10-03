# TESTING — local loop

## API
```bash
python3 -m venv .venv && .venv/bin/pip install -r apps/api/requirements.txt
.venv/bin/pytest tests/api -q        # 23 WS-CLAIMS tests; SQLite in-memory, no Docker
```

## Web
```bash
npm install
npm run build --workspace=web        # strict TS + prod build must stay green
```

## Manual smoke (claims matrix)
```bash
cd apps/api && ../../.venv/bin/uvicorn app.main:app --port 8000 &
cd apps/api && ../../.venv/bin/python -m app.seed_dev     # first run only
npm run start --workspace=web                             # or dev
open http://localhost:3000/claims
```
Expect: C1 partially supported (E3 conflicted / E4 unanchored), C2 unsupported,
C3 proven. Click C1 → E3: inspector must explain “adverse facts weigh against…”;
unlinking the adverse fact should flip E3 to proven (auto-recompute).

## What feedback to log if broken
API trace + browser console + `data/logs/` (none wired yet) via
`python scripts/collect_logs.py --feature feat/claims-matrix --note "…"` (script
lands with Wave 1; until then paste console/network output into a `-logs` branch).
