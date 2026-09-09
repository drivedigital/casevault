"""Run the Phase 0 ping job directly — no redis required.

Usage:
    python -m workers.run_ping            (or: make ping-job)
"""
import json

from workers.pipeline.jobs import ping

if __name__ == "__main__":
    print(json.dumps(ping(), indent=2))
