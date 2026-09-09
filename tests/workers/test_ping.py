"""Phase 0 worker smoke test: the ping job runs without redis/rq."""
from workers.pipeline.jobs import health_check, ping


def test_ping_returns_ok():
    assert ping()["status"] == "ok"


def test_health_check_registered():
    assert health_check()["registered"] is True
