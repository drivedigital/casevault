#!/usr/bin/env python3
"""Back up the local workspace: Postgres dump + data/ archive.

Output goes to data/backups/<timestamp>/ (git-ignored like everything else
under data/). Backups contain real evidence — handle them accordingly.

    python scripts/backup_workspace.py           # dry run: print the plan
    python scripts/backup_workspace.py --yes     # actually run

Status: Phase 0 scaffold. TODOs: verify dump integrity (pg_restore --list),
retention/pruning policy, optional encrypted destination.
"""
import argparse
import os
import shutil
import subprocess
import sys
import tarfile
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_database_url() -> str:
    for path in (ROOT / ".env.local", ROOT / ".env"):
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                if line.strip().startswith("DATABASE_URL="):
                    return line.split("=", 1)[1].strip()
    return os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/casevault")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--yes", action="store_true", help="actually perform the backup")
    args = parser.parse_args()

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    backup_dir = ROOT / "data" / "backups" / timestamp
    database_url = load_database_url()
    pg_dump = shutil.which("pg_dump")

    plan = [
        f"1. pg_dump {database_url} -> {backup_dir}/db.dump (custom format)",
        f"2. tar.gz data/ (excluding data/backups) -> {backup_dir}/data_archive.tar.gz",
        "3. write manifest",
    ]
    print("Backup plan:")
    print("\n".join(plan))
    if not args.yes:
        print("\nDry run. Re-run with --yes to execute.")
        return 0

    backup_dir.mkdir(parents=True, exist_ok=True)

    # 1. database dump
    if pg_dump:
        print("Running pg_dump ...")
        result = subprocess.run(
            [pg_dump, database_url, "--format=custom", "--file", str(backup_dir / "db.dump")],
            capture_output=True, text=True, check=False,
        )
        if result.returncode != 0:
            print(f"pg_dump FAILED:\n{result.stderr}")
            return 1
    else:
        print("WARNING: pg_dump not found — skipping database dump (TODO: document install requirement)")

    # 2. data archive (never recurse into backups themselves)
    print("Archiving data/ ...")
    archive_path = backup_dir / "data_archive.tar.gz"
    with tarfile.open(archive_path, "w:gz") as tar:
        for item in sorted((ROOT / "data").iterdir()):
            if item.name == "backups":
                continue
            tar.add(item, arcname=f"data/{item.name}")

    # 3. manifest
    (backup_dir / "MANIFEST.txt").write_text(
        f"backup_utc: {timestamp}\ndatabase_url: {database_url}\n"
        f"db_dump: {'db.dump' if pg_dump else 'SKIPPED (pg_dump missing)'}\n"
        f"data_archive: data_archive.tar.gz\n",
        encoding="utf-8",
    )
    print(f"\nBackup complete: {backup_dir}")
    print("WARNING: this backup contains real evidence. Store/delete it accordingly.")
    time.sleep(0)  # no-op; keeps linters calm about imports used above
    return 0


if __name__ == "__main__":
    sys.exit(main())
