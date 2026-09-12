/**
 * EU-V — Playwright configuration for independent evidence browser acceptance.
 *
 * Contract: docs/contracts/evidence_ui_closure.md v1.0 FROZEN.
 * Write set: tests/browser/eu-acceptance-* (EU-V).
 *
 * The runner is installed by scripts/eu_browser_setup.sh into a git-ignored
 * scratch prefix (no manifest/lockfile/CI change). Chromium is resolved either
 * from Playwright's own browser download (developer machines, CI) or from the
 * npm-shipped build (sandboxes without CDN access) — see EU_V_CHROMIUM_SOURCE.
 *
 * A single browser project on purpose: one framework, one browser family, real
 * API/worker/DB/Redis underneath. Every spec declares its proof mode
 * (REAL_API / REAL_WORKER / INJECTED_FAULT / TRANSPORT) in its describe title.
 */
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const artifacts = process.env.EU_V_ARTIFACT_DIR || 'data/diagnostics/eu-browser';
const webBaseUrl = process.env.EU_V_WEB_BASE_URL || 'http://127.0.0.1:3101';
const chromiumPath = process.env.EU_V_CHROMIUM_PATH || '';
const libDir = process.env.EU_V_CHROMIUM_LIB_DIR || '';
const fontsDir = process.env.EU_V_CHROMIUM_FONTS_DIR || '';

// The npm-shipped Chromium needs its bundled glibc/NSS libraries on the
// loader path (extracted by scripts/eu_browser_setup.sh).
const browserEnv: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === 'string') browserEnv[key] = value;
}
if (libDir) browserEnv.LD_LIBRARY_PATH = libDir;
if (fontsDir) browserEnv.FONTCONFIG_PATH = fontsDir;

export default defineConfig({
  testDir: '.',
  testMatch: /eu-acceptance-.*\.spec\.ts$/,
  outputDir: path.resolve(artifacts, 'test-results'),
  timeout: 240_000,
  expect: { timeout: 20_000 },
  // One shared real stack and one disposable database: serialize everything.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['junit', { outputFile: path.resolve(artifacts, 'eu-acceptance-junit.xml') }],
  ],
  metadata: {
    assignment: 'EU-V independent evidence browser acceptance',
    contract: 'docs/contracts/evidence_ui_closure.md v1.0',
    webBaseUrl,
    chromiumPath: chromiumPath || '(playwright default)',
    chromiumSource: process.env.EU_V_CHROMIUM_SOURCE || '(playwright download)',
  },
  use: {
    baseURL: webBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: process.env.EU_V_HEADED !== '1',
    launchOptions: {
      ...(chromiumPath ? { executablePath: chromiumPath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      env: browserEnv,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
