#!/usr/bin/env python3
"""End-of-turn checklist for the remote coding agent (Phase 0 scaffold).

Advisory by default; --strict exits non-zero when handoff files look stale.

    python scripts/handoff_finish.py [--strict]
"""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HANDOFF_FILES = ["handoff/WORKLOG.md", "handoff/BACKLOG.md", "handoff/TESTING.md"]

CHECKLIST = """\
End-of-turn protocol (PRD §15.3):
  1. handoff/WORKLOG.md updated (what changed, why, files affected, what to test)
  2. handoff/BACKLOG.md priorities updated
  3. handoff/TESTING.md updated with concrete local test instructions
  4. handoff/KNOWN_ISSUES.md updated if new defects/limitations appeared
  5. Changes committed; branch pushed
  6. Local tester given specific testing steps + logs/feedback requests
  7. STOP and wait for direction
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    print(CHECKLIST)

    stale = []
    for rel in HANDOFF_FILES:
        path = ROOT / rel
        if not path.exists():
            stale.append(f"{rel}: missing")
            continue
        result = subprocess.run(
            ["git", "log", "-1", "--format=%cd", "--date=format:%Y-%m-%d", "--", rel],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        last_commit = result.stdout.strip() or "never committed"
        print(f"  {rel}: last commit touching it: {last_commit}")

    modified = subprocess.run(
        ["git", "status", "--porcelain", "--", "handoff/"],
        cwd=ROOT, capture_output=True, text=True, check=False,
    ).stdout.strip()
    if not modified:
        msg = "NOTE: no uncommitted changes under handoff/ — did you update the logs?"
        print(f"\n{msg}")
        stale.append(msg)

    if stale and args.strict:
        print("\n--strict: failing because handoff files look stale.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
