# Testing

Concrete local test instructions. Updated every turn by the remote agent.

## Prerequisites

- python 3.11+, node 18.17+ / npm 9+, docker + docker compose
- `bash scripts/setup_local.sh` (idempotent)

## Start the stack

```bash
make infra-up     # postgres :5432, redis :6379 (localhost-only)
make api          # FastAPI  :8000
make web          # Next.js  :3000
make worker       # RQ worker (or: make ping-job — no redis needed)
```

## Phase 0 test checklist

- [ ] `curl http://localhost:8000/health` returns `"status": "ok"`
- [ ] `curl http://localhost:8000/api/v1/health` returns `"status": "ok"`
- [ ] http://localhost:3000 shows the CaseVault nav shell
- [ ] All 11 nav routes render their placeholder screens
- [ ] `make ping-job` prints `{"job": "ping", "status": "ok", ...}`
- [ ] `make worker` connects to redis and lists the 7 queues
- [ ] `make test` passes (API + worker smoke tests)
- [ ] `make check-env` reports OK; `make lint` clean
- [ ] `git check-ignore data/uploads .env.local` confirms both are ignored

## Capturing failures

1. Reproduce the problem, capturing output:
   `make api 2>&1 | tee data/logs/api.log`
2. Run the collector:
   `python scripts/collect_logs.py --feature feature/<topic> --note "what broke + steps"`
3. Review the bundle path it prints (it is git-ignored).
4. Send it via re-run with `--push` (creates the `<feature>-logs` branch)
   or paste the path/manifest to the remote agent in chat.
