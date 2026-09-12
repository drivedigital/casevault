"""Synthetic, DB-free regression tests for local operations."""
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / f'{name}.py')
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


@pytest.mark.parametrize('url', [None, '', 'postgresql://u:p@localhost/casevault',
    'postgresql://u:p@localhost/contest', 'postgresql://u:p@localhost/test?dbname=casevault'])
def test_reject_unsafe_database(url):
    with pytest.raises(ValueError):
        module('test_database_guard').require_disposable_database(url)


@pytest.mark.parametrize('name', ['casevault_test', 'casevault_ci', 'casevault_test_restore'])
def test_accept_disposable_database(name):
    url = f'postgresql://u:p@localhost/{name}'
    assert module('test_database_guard').require_disposable_database(url) == url


def test_backup_missing_tools(tmp_path, monkeypatch):
    backup = module('backup_workspace')
    monkeypatch.setattr(backup.shutil, 'which', lambda _: None)
    with pytest.raises(RuntimeError, match='required'):
        backup.backup('postgresql://synthetic', tmp_path, tmp_path / 'result')
    assert not (tmp_path / 'result').exists()


@pytest.mark.parametrize('failure', ['dump', 'validation'])
def test_failed_backup_never_complete(tmp_path, monkeypatch, failure):
    backup = module('backup_workspace')
    monkeypatch.setattr(backup.shutil, 'which', lambda name: name)
    def run(cmd, **kwargs):
        if cmd[0] == 'pg_dump':
            Path(cmd[-1]).write_bytes(b'dump')
        return SimpleNamespace(returncode=int(cmd[0] == ('pg_dump' if failure == 'dump' else 'pg_restore')))
    monkeypatch.setattr(backup.subprocess, 'run', run)
    with pytest.raises(RuntimeError):
        backup.backup('postgresql://u:synthetic@localhost/db', tmp_path, tmp_path / 'result')
    assert not (tmp_path / 'result').exists()
    assert not (tmp_path / 'result.partial/MANIFEST.json').exists()


def test_backup_success_manifest_has_no_credentials(tmp_path, monkeypatch):
    backup = module('backup_workspace')
    storage=tmp_path/'storage'; storage.mkdir(); (storage/'fixture.txt').write_text('synthetic')
    monkeypatch.setattr(backup.shutil, 'which', lambda name: name)
    def run(cmd, **kwargs):
        assert not any('sensitive-password' in arg for arg in cmd)
        if cmd[0] == 'pg_dump':
            Path(cmd[-1]).write_bytes(b'fake dump for orchestration test')
        return SimpleNamespace(returncode=0)
    monkeypatch.setattr(backup.subprocess, 'run', run)
    result=backup.backup('postgresql://u:sensitive-password@localhost/db',storage,tmp_path/'result')
    manifest=(result/'MANIFEST.json').read_text()
    assert 'sensitive-password' not in manifest
    assert json.loads(manifest)['status']=='complete'
    assert len(json.loads(manifest)['sha256'])==2


def test_diagnostics_redact_urls_and_exclude_secret_files(tmp_path):
    collector=module('collect_logs'); collector.ROOT=tmp_path
    logs=tmp_path/'data/logs'; logs.mkdir(parents=True)
    (logs/'server.log').write_text('postgresql://user:synthetic-password@localhost/db')
    (logs/'signing.secret').write_text('bare-secret')
    (tmp_path/'.env.local').write_text('DATABASE_URL=postgresql://u:synthetic-password@localhost/db\n')
    bundle=tmp_path/'bundle'; bundle.mkdir()
    collector.gather_logs(bundle); collector.write_config_summary(bundle)
    assert not (bundle/'logs/signing.secret').exists()
    assert 'synthetic-password' not in (bundle/'logs/server.log').read_text()
    assert 'synthetic-password' not in (bundle/'config_summary_redacted.json').read_text()
