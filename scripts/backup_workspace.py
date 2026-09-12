#!/usr/bin/env python3
"""Create a complete local backup. Stop writers first for DB/file consistency.

Dry run by default; --yes writes db.dump, data_archive.tar.gz and a manifest.
A .partial directory is retained on failure and is never reported as complete.
pg_restore --list validates dump structure, not a full restore; see local ops guide.
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent


def load_database_url() -> str:
    values = {**dotenv_values(ROOT / '.env'), **dotenv_values(ROOT / '.env.local'), **os.environ}
    return values.get('DATABASE_URL') or 'postgresql://postgres:postgres@localhost:5432/casevault'


def backup(database_url: str, storage: Path, destination: Path, postgres_container: str | None = None) -> Path:
    """Back up to a new directory; never overwrite an earlier backup."""
    dump, restore = shutil.which('pg_dump'), shutil.which('pg_restore')
    if not postgres_container and (not dump or not restore):
        raise RuntimeError('pg_dump and pg_restore are required; no backup created')
    if not storage.is_dir():
        raise RuntimeError('Storage directory does not exist')
    if destination.exists():
        raise RuntimeError('Backup destination already exists')
    if destination.resolve().is_relative_to(storage.resolve()):
        relative = destination.resolve().relative_to(storage.resolve())
        if len(relative.parts) > 1 and relative.parts[0] != 'backups':
            raise RuntimeError('Nested backup destinations must be under storage/backups')
    partial = destination.with_name(destination.name + '.partial')
    partial.mkdir(parents=True, mode=0o700)
    # Keep connection credentials out of command arguments, console output and manifest.
    parsed = urlsplit(database_url)
    env = {**os.environ, 'PGDATABASE': unquote(parsed.path.lstrip('/')),
           'PGHOST': parsed.hostname or 'localhost', 'PGPORT': str(parsed.port or 5432)}
    if parsed.username is not None:
        env['PGUSER'] = unquote(parsed.username)
    if parsed.password is not None:
        env['PGPASSWORD'] = unquote(parsed.password)
    for key, value in parse_qsl(parsed.query):
        if key not in {'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'connect_timeout', 'gssencmode'}:
            raise RuntimeError('Unsupported database connection option; backup refused')
        env['PG' + key.upper()] = value

    if postgres_container:
        with (partial / 'db.dump').open('wb') as output:
            result = subprocess.run(['docker', 'exec', postgres_container, 'pg_dump',
                                     '-U', env.get('PGUSER', 'postgres'), '-d', env['PGDATABASE'],
                                     '--format=custom'], stdout=output, stderr=subprocess.PIPE, check=False)
    else:
        result = subprocess.run([dump, '--format=custom', '--file', str(partial / 'db.dump')],
                                env=env, capture_output=True, check=False)
    if result.returncode or not (partial / 'db.dump').is_file() or (partial / 'db.dump').stat().st_size == 0:
        raise RuntimeError('Database dump failed; incomplete backup retained as .partial')
    if postgres_container:
        with (partial / 'db.dump').open('rb') as source:
            result = subprocess.run(['docker', 'exec', '-i', postgres_container, 'pg_restore', '--list'],
                                    stdin=source, capture_output=True, check=False)
    else:
        result = subprocess.run([restore, '--list', str(partial / 'db.dump')],
                                capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError('Database dump validation failed; incomplete backup retained as .partial')
    archive = partial / 'data_archive.tar.gz'
    with tarfile.open(archive, 'w:gz', dereference=False) as tar:
        for item in sorted(storage.iterdir()):
            if item.name == 'backups' or item.resolve() in (partial.resolve(), destination.resolve()):
                continue
            tar.add(item, arcname=f'data/{item.name}')
    with tarfile.open(archive, 'r:gz') as tar:
        for member in tar:
            if member.isfile():
                handle = tar.extractfile(member)
                if handle:
                    while handle.read(1024 * 1024):
                        pass
    files = {}
    for name in ('db.dump', 'data_archive.tar.gz'):
        with (partial / name).open('rb') as handle:
            files[name] = hashlib.file_digest(handle, 'sha256').hexdigest()
    (partial / 'MANIFEST.json').write_text(json.dumps({
        'created_utc': datetime.now(timezone.utc).isoformat(),
        'status': 'complete', 'sha256': files,
        'validation': 'pg_restore --list and full archive read; restore drill separate',
        'consistency': 'Stop application writers before invoking backup',
    }, indent=2) + '\n')
    partial.rename(destination)
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--postgres-container', help='Use matching dump tools inside this existing Postgres container')
    parser.add_argument('--yes', action='store_true')
    parser.add_argument('--storage-root', type=Path)
    parser.add_argument('--destination', type=Path)
    args = parser.parse_args()
    values = {**dotenv_values(ROOT / '.env'), **dotenv_values(ROOT / '.env.local'), **os.environ}
    storage = args.storage_root or Path(values.get('LOCAL_STORAGE_ROOT') or ROOT / 'data')
    if not storage.is_absolute():
        storage = ROOT / storage
    destination = args.destination or storage / 'backups' / datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S.%fZ')
    print(f'Backup destination: {destination}')
    print('Plan: database dump + structural validation + file archive + checksummed manifest.')
    print('Stop application writers first; the database and files are not one atomic snapshot.')
    if not args.yes:
        print('Dry run. Re-run with --yes to execute.')
        return 0
    try:
        backup(load_database_url(), storage, destination, args.postgres_container)
    except (OSError, RuntimeError, tarfile.TarError) as exc:
        print(f'Backup FAILED: {exc}', file=sys.stderr)
        return 1
    print(f'Backup complete: {destination}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
