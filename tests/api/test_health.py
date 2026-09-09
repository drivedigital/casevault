"""Phase 0 API smoke tests: the scaffold boots and serves health checks."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_root():
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "casevault-api"


def test_health_v1():
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
