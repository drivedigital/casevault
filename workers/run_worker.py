"""RQ worker bootstrap for local development.

Usage:
    python -m workers.run_worker            (or: make worker)

Requires a running redis (make infra-up) and REDIS_URL in .env.local.
"""
import os

from dotenv import load_dotenv


def main() -> None:
    load_dotenv(".env.local")
    load_dotenv(".env")

    import redis  # deferred: script deps only
    from rq import Worker

    from workers.queues import QUEUES

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    conn = redis.Redis.from_url(redis_url)
    print(f"[casevault-worker] connecting to {redis_url}")
    print(f"[casevault-worker] listening on queues: {', '.join(QUEUES)}")
    # Registered Phase 0 jobs: workers.pipeline.jobs.ping / .health_check
    Worker(QUEUES, connection=conn).work(with_scheduler=False)


if __name__ == "__main__":
    main()
