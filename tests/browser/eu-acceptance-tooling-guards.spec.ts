/**
 * EU-V — TOOLING guard regressions (not product acceptance).
 *
 * These guard the acceptance *tooling* against the failure modes found in the
 * 2026-09-11 integration review of PR #19:
 *   1. destructive handling of paths another owner may have created,
 *   2. non-transactional stack startup (created DB left behind after a failed
 *      migration, no state file, `stop` unable to recover),
 *   3. credential leakage in logs/state, unquoted env emission,
 *   4. browser-facing servers not reachable from a preview host,
 *   5. `stop` claiming success when cleanup is incomplete.
 *
 * They deliberately run the real scripts with stubbed inputs (a throwaway
 * artifacts directory, an unreachable admin URL, a missing alembic config) —
 * no product database or queue is touched beyond the disposable ones the stack
 * script itself creates and drops.
 *
 * Modes: all TOOLING except the live-stack group, which is REAL_API plumbing.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { declareMode, PYTHON, queryDatabaseUrl, REPO_ROOT } from './eu-acceptance-harness';

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
  combined: string;
}

function run(command: string, args: string[], env: Record<string, string> = {}): RunResult {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 420_000,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    combined: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function adminUrl(): string {
  const explicit = process.env.EU_V_ADMIN_DATABASE_URL;
  if (explicit) return explicit;
  const out = run(PYTHON, ['scripts/agent_pg.py', 'env']);
  const match = /export DATABASE_URL="([^"]+)"/.exec(out.stdout);
  if (!match) {
    throw new Error(
      'no admin database URL: set EU_V_ADMIN_DATABASE_URL, or start Postgres ' +
        '(`make infra-up`, or `python scripts/agent_pg.py start`)',
    );
  }
  return match[1];
}

function databaseNames(url: string): string[] {
  const rows = queryDatabaseUrl<{ datname: string }>(
    url,
    "SELECT datname FROM pg_database WHERE datname LIKE 'casevault_euv_%'",
  );
  return rows.map((row) => row.datname);
}

function stateFile(artifacts: string): string {
  return path.join(artifacts, 'state.json');
}

function readState(artifacts: string): Record<string, any> | null {
  const file = stateFile(artifacts);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

/** Run the pinned setup script with an isolated module-link path. */
function runSetup(linkPath: string): RunResult {
  return run('bash', ['scripts/eu_browser_setup.sh'], {
    EU_V_MODULE_LINK: linkPath,
  });
}

test.describe('EU-V/G tooling guards — path preservation, failure paths, credentials', () => {
  test('G1 preserves a pre-existing directory at the module-link path', async () => {
    declareMode('TOOLING', 'no browser interaction; guards scripts/eu_browser_setup.sh');
    const link = tmpDir('eu-v-link-dir-');
    const sentinel = path.join(link, 'other-owner.txt');
    fs.writeFileSync(sentinel, 'do not delete');

    const result = runSetup(link);
    expect(result.status, result.combined).toBe(0);

    expect(fs.existsSync(sentinel), 'pre-existing directory content survives').toBe(true);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('do not delete');
    expect(result.combined).toContain('preserving existing');
  });

  test('G2 preserves a foreign symlink at the module-link path', async () => {
    declareMode('TOOLING', 'no browser interaction; guards scripts/eu_browser_setup.sh');
    const target = tmpDir('eu-v-foreign-');
    const marker = path.join(target, 'someone-elses-install');
    fs.writeFileSync(marker, 'keep');
    const link = path.join(tmpDir('eu-v-link-'), 'node_modules');
    fs.symlinkSync(target, link);

    const result = runSetup(link);
    expect(result.status, result.combined).toBe(0);

    expect(fs.readlinkSync(link), 'foreign symlink is not repointed').toBe(target);
    expect(fs.existsSync(marker)).toBe(true);
    expect(result.combined).toContain('preserving foreign symlink');
  });

  test('G3 replaces only an EU-V managed symlink', async () => {
    declareMode('TOOLING', 'no browser interaction; guards scripts/eu_browser_setup.sh');
    const link = path.join(tmpDir('eu-v-link-owned-'), 'node_modules');
    const ownedTarget = path.join(REPO_ROOT, 'data', 'temp', 'eu-browser-tools', 'node_modules');
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(ownedTarget, link);

    const result = runSetup(link);
    expect(result.status, result.combined).toBe(0);

    expect(result.combined).toContain('removed EU-V managed link');
    expect(fs.existsSync(ownedTarget), 'the real install it pointed at is untouched').toBe(true);
  });

  test('G4 unreachable admin database: no database created, recovery state kept, credentials redacted', async () => {
    declareMode('TOOLING', 'stubbed unreachable admin URL; no database or process is created');
    const artifacts = tmpDir('eu-v-stack-unreachable-');
    const secret = 'eu-v-secret-not-logged';
    const before = databaseNames(adminUrl());

    const result = run(PYTHON, ['scripts/eu_browser_stack.py', 'start'], {
      EU_V_ARTIFACTS: artifacts,
      EU_V_ADMIN_DATABASE_URL: `postgresql://postgres:${secret}@127.0.0.1:1/postgres`,
    });

    expect(result.status, 'startup must fail, not silently succeed').not.toBe(0);
    expect(result.combined, 'credentials must never be printed').not.toContain(secret);
    expect(/:\/\/[^/\s]*:[^@/\s]+@/.test(result.combined), 'no userinfo in output').toBe(false);

    const state = readState(artifacts);
    expect(state, 'actionable recovery state is retained').toBeTruthy();
    expect(state?.status).toBe('failed');
    expect(state?.recovery?.length ?? 0).toBeGreaterThan(0);
    expect(databaseNames(adminUrl()), 'no throwaway database left behind')
      .toEqual(before);
  });

  test('G5 failed migration rolls back the database it created (transactional startup)', async () => {
    declareMode('TOOLING', 'injected migration failure with a real Postgres admin connection');
    const artifacts = tmpDir('eu-v-stack-migrate-');
    const url = adminUrl();
    const before = databaseNames(url);

    const result = run(PYTHON, ['scripts/eu_browser_stack.py', 'start'], {
      EU_V_ARTIFACTS: artifacts,
      EU_V_ADMIN_DATABASE_URL: url,
      EU_V_ALEMBIC_CONFIG: 'apps/api/does-not-exist.ini',
    });

    expect(result.status, 'startup must fail when migrations fail').not.toBe(0);
    const state = readState(artifacts);
    expect(state?.status).toBe('failed');
    expect(state?.step).toBe('migrate');
    expect(databaseNames(url), 'the database created during startup was rolled back')
      .toEqual(before);
    expect(
      (state?.cleanup_failures ?? []).length,
      `cleanup failures: ${JSON.stringify(state?.cleanup_failures)}`,
    ).toBe(0);

    // State files hold connection data, so they must be owner-only.
    const mode = fs.statSync(stateFile(artifacts)).mode & 0o777;
    expect(mode.toString(8), 'state file is mode 0600').toBe('600');

    // Nothing shared was removed: the admin database itself still exists.
    const adminName = (url.replace(/\?.*$/, '').match(/\/([^/@]+)$/) || [, 'postgres'])[1];
    const rows = queryDatabaseUrl<{ count: string }>(
      url,
      `SELECT count(*)::text AS count FROM pg_database WHERE datname = '${adminName}'`,
    );
    expect(rows[0]?.count, 'the admin database is untouched').toBe('1');
  });

  test('G6 redaction helper hides userinfo and credential parameters', () => {
    declareMode('TOOLING', 'unit check of scripts/eu_browser_stack.redact');
    const script = `
import importlib.util, sys
spec = importlib.util.spec_from_file_location("stack", "scripts/eu_browser_stack.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(module.redact("postgresql://postgres:sup3rs3cret@localhost:5432/casevault?sslmode=require&password=abc"))
print(module.redact("redis://:cachepw@localhost:6379/0"))
`;
    const out = execFileSync(PYTHON, ['-c', script], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(out).not.toContain('sup3rs3cret');
    expect(out).not.toContain('cachepw');
    expect(out).not.toContain('password=abc');
    expect(out).toContain('localhost:5432/casevault');
  });

  test('G7 env emission is opt-in and shell-quoted', async () => {
    declareMode('TOOLING', 'opt-in machine-readable env output');
    const artifacts = tmpDir('eu-v-stack-env-');
    const start = run(PYTHON, ['scripts/eu_browser_stack.py', 'start'], {
      EU_V_ARTIFACTS: artifacts,
      EU_V_ADMIN_DATABASE_URL: 'postgresql://postgres:eu-v-not-logged@127.0.0.1:1/postgres',
    });
    expect(start.status, 'this guard needs the failed-startup state').not.toBe(0);

    // start must not emit env assignments on its own …
    expect(start.combined).not.toContain('export EU_V_DATABASE_URL');

    // … `env` is explicit and every assignment is safely quoted.
    const envOut = run(PYTHON, ['scripts/eu_browser_stack.py', 'env'], {
      EU_V_ARTIFACTS: artifacts,
    });
    expect(envOut.status).toBe(0);
    const assignments = envOut.stdout.trim().split('\n').filter(Boolean);
    expect(assignments.length).toBeGreaterThan(0);
    for (const line of assignments) {
      expect(line, `malformed export: ${line}`).toMatch(/^export [A-Z_]+=/);
    }

    // Round-trip: whatever quoting shlex chose, `sh` must reproduce the value.
    const expected = JSON.parse(
      run(PYTHON, ['scripts/eu_browser_stack.py', 'env', '--json'], {
        EU_V_ARTIFACTS: artifacts,
      }).stdout,
    ) as Record<string, string>;
    for (const [key, value] of Object.entries(expected)) {
      const evaluated = run('sh', [
        '-c',
        `eval "$("${PYTHON}" scripts/eu_browser_stack.py env)"; printf '%s' "$${key}"`,
      ], { EU_V_ARTIFACTS: artifacts });
      expect(evaluated.stdout, `${key} survives shell evaluation`).toBe(value);
    }

    // shlex quotes when it must: values with shell metacharacters are escaped.
    const quoted = run(PYTHON, [
      '-c',
      'import shlex; print(shlex.quote("a b; rm -rf /tmp/eu-v-quote-probe"))',
    ]);
    expect(quoted.stdout.trim(), 'metacharacter values are quoted').toMatch(/^'.*'$/);
  });
});

test.describe.serial('EU-V/G live stack guards — 0.0.0.0 binding and incomplete-cleanup reporting', () => {
  let artifacts = '';
  let url = '';
  let webPort = 0;
  let apiPort = 0;

  function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as net.AddressInfo;
        server.close(() => resolve(address.port));
      });
    });
  }

  test.beforeAll(async () => {
    artifacts = tmpDir('eu-v-stack-live-');
    url = adminUrl();
    // Ephemeral ports: a guard stack must never collide with (or stop) a stack
    // the operator is already running on the default ports.
    const result = run(PYTHON, ['scripts/eu_browser_stack.py', 'start'], {
      EU_V_ARTIFACTS: artifacts,
      EU_V_ADMIN_DATABASE_URL: url,
      EU_V_API_PORT: String(await freePort()),
      EU_V_WEB_PORT: String(await freePort()),
    });
    expect(result.status, `stack failed to start: ${result.combined}`).toBe(0);
    const state = readState(artifacts);
    webPort = Number(state?.web_port);
    apiPort = Number(state?.api_port);
  });

  test.afterAll(() => {
    if (!artifacts) return;
    // Make sure the stack is really gone even if a guard left it half-stopped.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const stop = run(PYTHON, ['scripts/eu_browser_stack.py', 'stop'], {
        EU_V_ARTIFACTS: artifacts,
      });
      if (stop.status === 0) break;
    }
    const state = readState(artifacts);
    expect(state, `stack state still present after stop: ${JSON.stringify(state)}`).toBeNull();
  });

  test('G8 browser-facing servers are reachable on a non-loopback interface (Arena preview)', async () => {
    declareMode('REAL_API', 'real servers; checks the bind address used by previews');
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((iface): iface is os.NetworkInterfaceInfoIPv4 =>
        Boolean(iface) && iface!.family === 'IPv4' && !iface!.internal);
    expect(addresses.length, 'need a non-loopback IPv4 address for a preview check').toBeGreaterThan(0);

    const get = (host: string, port: number, urlPath: string): Promise<number> =>
      new Promise((resolve, reject) => {
        const request = http.get({ host, port, path: urlPath, timeout: 20_000 }, (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        });
        request.on('error', reject);
        request.on('timeout', () => {
          request.destroy(new Error('timeout'));
        });
      });

    for (const iface of addresses) {
      expect(await get(iface.address, webPort, '/evidence'), `web on ${iface.address}`).toBe(200);
      expect(await get(iface.address, apiPort, '/health'), `api on ${iface.address}`).toBe(200);
    }

    // The browser still talks to the API through the relative rewrite.
    const proxied = await get(addresses[0].address, webPort, '/api/v1/workspaces/current');
    expect(proxied, 'relative /api/v1 proxy works from a preview host').toBe(200);
  });

  test('G9 incomplete cleanup is reported as a failure with actionable state', async () => {
    declareMode('TOOLING', 'holds a connection so DROP DATABASE cannot succeed');
    const state = readState(artifacts);
    const databaseUrl = String(state?.database_url);
    expect(databaseUrl).toBeTruthy();

    // A live connection makes DROP DATABASE fail — the realistic way a stop can
    // be unable to finish.
    let databaseName = '';
    const holder = spawn(
      PYTHON,
      ['-c', 'import sys, time, psycopg2; c = psycopg2.connect(sys.argv[1]); time.sleep(120)', databaseUrl],
      { cwd: REPO_ROOT, stdio: 'ignore' },
    );
    try {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      const stop = run(PYTHON, ['scripts/eu_browser_stack.py', 'stop'], {
        EU_V_ARTIFACTS: artifacts,
      });

      expect(stop.status, 'stop must fail, not claim success').not.toBe(0);
      const kept = readState(artifacts);
      expect(kept, 'recovery state is retained').toBeTruthy();
      databaseName = String(kept?.resources?.database);
      expect(kept?.status).toBe('failed-cleanup');
      expect(kept?.recovery?.length ?? 0).toBeGreaterThan(0);
      expect(databaseNames(url), 'the database is really still there').toContain(kept?.resources?.database);
    } finally {
      holder.kill('SIGKILL');
    }

    // Once the blocker is gone, the same state must clean up completely.
    const retry = run(PYTHON, ['scripts/eu_browser_stack.py', 'stop'], {
      EU_V_ARTIFACTS: artifacts,
    });
    expect(retry.status, `retry should succeed: ${retry.combined}`).toBe(0);
    expect(readState(artifacts), 'state removed after a complete stop').toBeNull();
    expect(
      databaseNames(url),
      'the throwaway database of this run is dropped on retry',
    ).not.toContain(databaseName);
  });
});
