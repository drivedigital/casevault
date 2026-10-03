.PHONY: setup dev-api dev-web build test seed

setup:
	npm install
	python3 -m venv .venv
	.venv/bin/pip install -r apps/api/requirements.txt

dev-api:
	cd apps/api && ../../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

dev-web:
	npm run dev --workspace=web

build:
	npm run build --workspace=web

seed:
	cd apps/api && ../../.venv/bin/python -m app.seed_dev

test:
	.venv/bin/pytest tests/api -q
