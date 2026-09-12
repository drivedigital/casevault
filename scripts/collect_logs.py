#!/usr/bin/env python3
"""Collect a diagnostic bundle for handoff to the remote coding agent.

Creates data/diagnostics/<timestamp>/ containing runtime logs (if present),
version info, git state, a redacted config summary, your note, and optional
screenshots. Secrets are redacted; you will be warned if a file looks like
it may contain sensitive evidence text.

The bundle directory is git-ignored. To send it, use --push to create/update
the feature/<topic>-logs branch and force-add the bundle there — the ONLY
sanctioned way evidence-adjacent files leave the local machine.

Usage:
    python scripts/collect_logs.py --feature feature/claim-chart \
        --note "Claim element panel errors after fact approval"
    python scripts/collect_logs.py --note "api fails to start" --push

Status: v0.1 (Phase 0 scaffold). TODOs: structured log parsers, automatic
web/api/worker log capture from running processes, bundle pruning.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SECRET_PATTERNS = [
    re.compile(r"(sk-[A-Za-z0-9_\-]{8,})"),
    re.compile(r"(AIza[0-9A-Za-z_\-]{8,})"),
    re.compile(r"(xai-[A-Za-z0-9_\-]{8,})"),
    re.compile(r"((?:api[_-]?key|secret|token|password)[=:]\s*)\S+", re.IGNORECASE),
]
EVIDENCE_SIZE_WARNING = 100_000  # bytes


def run(cmd: list[str]) -> str:
    try:
        return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, check=False, timeout=15).stdout.strip()
    except Exception as exc:  # noqa: BLE001 - diagnostics must never crash collection
        return f"<unavailable: {exc}>"


def redact(text: str) -> str:
    text = re.sub(r"([a-zA-Z][a-zA-Z0-9+.-]*://)[^\s/@]+@", r"\1<REDACTED>@", text)
    # patterns 0-2 match full secret tokens: replace the whole match
    for pattern in SECRET_PATTERNS[:3]:
        text = pattern.sub("<REDACTED>", text)
    # pattern 3 matches "key=value" style lines: keep the key name, redact the value
    text = SECRET_PATTERNS[3].sub(lambda m: m.group(1) + "<REDACTED>", text)
    return text


def gather_logs(bundle: Path) -> list[str]:
    warnings: list[str] = []
    collected = bundle / "logs"
    collected.mkdir(exist_ok=True)
    found = 0
    for source_dir in (ROOT / "data" / "logs", ROOT / "logs"):
        if not source_dir.exists():
            continue
        for log_file in sorted(source_dir.rglob("*")):
            if log_file.is_symlink() or log_file.suffix.lower() not in {".log", ".txt"}:
                continue
            if any(word in log_file.name.lower() for word in ("secret", "credential", ".env", "token", "password")):
                continue
            if not log_file.is_file():
                continue
            found += 1
            content = log_file.read_text(encoding="utf-8", errors="replace")
            if log_file.stat().st_size > EVIDENCE_SIZE_WARNING:
                warnings.append(
                    f"{log_file.name} is {log_file.stat().st_size} bytes — large log files "
                    "may contain evidence text. Review before pushing."
                )
            (collected / log_file.name).write_text(redact(content), encoding="utf-8")
    if found == 0:
        (collected / "NO_LOGS_FOUND.txt").write_text(
            "No runtime logs found under data/logs or logs/.\n"
            "Capture output manually, e.g.: make api 2>&1 | tee data/logs/api.log\n",
            encoding="utf-8",
        )
    return warnings


def write_config_summary(bundle: Path) -> None:
    summary = {}
    env_path = ROOT / ".env.local"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            sensitive = any(m in key.upper() for m in ("KEY", "SECRET", "TOKEN", "PASSWORD"))
            summary[key] = "<REDACTED>" if (sensitive and val.strip()) else redact(val.strip())
    (bundle / "config_summary_redacted.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--feature", default="feature/phase0",
                        help="feature branch context; bundle goes to <feature>-logs when --push is used")
    parser.add_argument("--note", default="", help="short description of the problem for the remote agent")
    parser.add_argument("--include-screenshot", action="append", default=[],
                        help="path to a screenshot file to include (repeatable)")
    parser.add_argument("--push", action="store_true",
                        help="create/switch to the -logs branch, force-add the bundle, commit and push")
    args = parser.parse_args()

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    bundle = ROOT / "data" / "diagnostics" / timestamp
    bundle.mkdir(parents=True, exist_ok=True)
    print(f"Collecting diagnostics into {bundle}")

    (bundle / "note.txt").write_text(args.note or "(no note provided)\n", encoding="utf-8")
    (bundle / "versions.txt").write_text(
        "python: " + run(["python3", "--version"]) + "\n"
        + "pip freeze (relevant):\n"
        + run([".venv/bin/pip", "freeze"]) + "\n"
        + "node: " + run(["node", "--version"]) + "\n"
        + "npm: " + run(["npm", "--version"]) + "\n"
        + "os: " + run(["uname", "-a"]) + "\n",
        encoding="utf-8",
    )
    (bundle / "git_status.txt").write_text(
        "branch: " + run(["git", "branch", "--show-current"]) + "\n"
        + "commit: " + run(["git", "rev-parse", "HEAD"]) + "\n\n"
        + run(["git", "status", "--short"]) + "\n",
        encoding="utf-8",
    )

    warnings = gather_logs(bundle)
    write_config_summary(bundle)

    screenshots = bundle / "screenshots"
    for shot in args.include_screenshot:
        src = Path(shot)
        if src.is_file():
            screenshots.mkdir(exist_ok=True)
            shutil.copy(src, screenshots / src.name)
            warnings.append(f"screenshot {src.name} included — confirm it shows no sensitive evidence")

    manifest = {
        "timestamp_utc": timestamp,
        "branch": run(["git", "branch", "--show-current"]),
        "commit": run(["git", "rev-parse", "HEAD"]),
        "feature": args.feature,
        "note": args.note,
        "redaction_warnings": warnings,
        "files": sorted(p.name for p in bundle.iterdir()),
    }
    (bundle / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    for warning in warnings:
        print(f"WARNING: {warning}")
    print(f"\nBundle ready: {bundle}")

    if args.push:
        logs_branch = f"{args.feature.rstrip('/')}-logs"
        print(f"\nPushing to logs branch: {logs_branch}")
        commands = [
            ["git", "checkout", "-B", logs_branch],
            ["git", "add", "-f", str(bundle.relative_to(ROOT))],
            ["git", "commit", "-m", f"diagnostics: {args.note or timestamp}"],
            ["git", "push", "-u", "origin", logs_branch],
            ["git", "checkout", "-"],
        ]
        for cmd in commands:
            result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, check=False)
            if result.returncode != 0:
                print(f"FAILED: {' '.join(cmd)}\n{result.stderr}")
                return 1
        print("Pushed. Tell the remote agent the logs branch name:", logs_branch)
    else:
        print("\nNot pushed. To send: re-run with --push,")
        print("or copy the bundle path above into your reply to the remote agent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
