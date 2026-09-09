#!/usr/bin/env python3
"""Validate the local environment: .env.local exists, required values set,
secret placeholders flagged, AI provider keys reported (redacted), optional
TCP reachability check for postgres/redis.

Usage:
    python scripts/check_env.py [--check-ports]
"""
import argparse
import os
import socket
import sys
from urllib.parse import urlparse

REQUIRED = ["DATABASE_URL", "REDIS_URL", "LOCAL_STORAGE_ROOT"]
PLACEHOLDER_MARKERS = ("change-me", "changeme", "your-", "TODO")
AI_KEYS = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "XAI_API_KEY",
    "OPENROUTER_API_KEY",
]


def load_env() -> dict:
    values = {}
    for path in (".env", ".env.local"):
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, _, val = line.partition("=")
                    values[key.strip()] = val.strip()
    return values


def check_port(name: str, url: str) -> bool:
    parsed = urlparse(url)
    host, port = parsed.hostname or "localhost", parsed.port
    if port is None:
        print(f"  [skip] {name}: no port parsed from URL")
        return True
    try:
        with socket.create_connection((host, port), timeout=2):
            print(f"  [ok]   {name} reachable at {host}:{port}")
            return True
    except OSError as exc:
        print(f"  [DOWN] {name} not reachable at {host}:{port} ({exc})")
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-ports", action="store_true",
                        help="attempt TCP connections to DATABASE_URL/REDIS_URL")
    args = parser.parse_args()

    ok = True
    if not os.path.exists(".env.local"):
        print("[warn] .env.local missing — using defaults/.env. Run: make env-create")

    env = load_env()
    for key in REQUIRED:
        value = env.get(key) or os.environ.get(key)
        if value:
            print(f"[ok]   {key} is set")
        else:
            print(f"[FAIL] {key} is not set (.env.local or environment)")
            ok = False

    for key in ("APP_SECRET_KEY", "SESSION_SECRET"):
        value = env.get(key, "")
        if any(m in value for m in PLACEHOLDER_MARKERS):
            print(f"[warn] {key} uses a placeholder value — fine for local dev only")

    print("\nAI providers (values redacted):")
    for key in AI_KEYS:
        value = env.get(key) or os.environ.get(key) or ""
        print(f"  {'[set]' if value else '[---]'} {key}")
    print("  Effective default AI-sharing policy: no_ai (opt-in, per spec).")

    if args.check_ports:
        print("\nPort checks:")
        ok &= check_port("postgres", env.get("DATABASE_URL", ""))
        ok &= check_port("redis", env.get("REDIS_URL", ""))

    print("\nResult:", "OK" if ok else "PROBLEMS FOUND")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
