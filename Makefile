SHELL := /bin/bash
PY := .venv/bin/python

.PHONY: setup infra-up infra-down migrate web api worker ping-job test test-db lint logs check-env backup handoff-finish env-create

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  make %-16s %s\n", $$1, $$2}'

setup: ## One-time local setup (venv, deps, data dirs, .env.local)
	bash scripts/setup_local.sh

env-create: ## Create .env.local from .env.example if missing
	@test -f .env.local && echo ".env.local already exists" || (cp .env.example .env.local && echo "created .env.local — review values before continuing")

infra-up: ## Start postgres + redis (docker compose)
	docker compose up -d postgres redis

infra-down: ## Stop infra containers
	docker compose down

migrate: ## Apply Alembic migrations to the configured database (DATABASE_URL from env / .env.local)
	$(PY) -m alembic -c apps/api/alembic.ini upgrade head

web: ## Run Next.js dev server (port 3000)
	npm run dev --workspace=web

api: ## Run FastAPI with reload (port 8100)
	$(PY) -m uvicorn app.main:app --app-dir apps/api --reload --host 0.0.0.0 --port $${APP_PORT_API:-8100}

worker: ## Run RQ worker (requires redis)
	$(PY) -m workers.run_worker

ping-job: ## Run the worker ping job directly (no redis required)
	$(PY) -m workers.run_ping

test-db: ## Create casevault_test in the compose Postgres (idempotent; run after make infra-up)
	@echo "SELECT 1 FROM pg_database WHERE datname = 'casevault_test'" \
		| docker compose exec -T postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -tA | grep -q 1 || createdb -U "$$POSTGRES_USER" casevault_test'
	@echo "casevault_test ready"

test: ## Run Python test suite
	$(PY) -m pytest

lint: ## Lint python (ruff) and web (next lint)
	$(PY) -m ruff check apps workers scripts tests
	npm run lint --workspace=web

logs: ## Collect diagnostics bundle (see handoff/TESTING.md)
	$(PY) scripts/collect_logs.py

check-env: ## Validate .env.local and tool prerequisites
	$(PY) scripts/check_env.py

backup: ## Backup postgres dump + data/ archive into data/backups/
	$(PY) scripts/backup_workspace.py --yes

handoff-finish: ## Print end-of-turn handoff checklist
	$(PY) scripts/handoff_finish.py
