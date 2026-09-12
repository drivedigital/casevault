#!/usr/bin/env node
/**
 * EU-V — resolve a Chromium executable for the acceptance browser.
 *
 * Contract: docs/contracts/evidence_ui_closure.md v1.0 FROZEN (2026-09-11
 * integration amendment: EU-V's isolated pinned install is approved; platform,
 * cleanup and credential safety corrections required).
 * Write set: scripts/eu_browser_* (EU-V).
 *
 * Resolution order (mode `auto`):
 *   1. explicit override  EU_V_CHROMIUM_EXECUTABLE (validated, never guessed)
 *   2. Playwright-managed browser, looked up per-platform in the Playwright
 *      browsers directory (PLAYWRIGHT_BROWSERS_PATH or the OS default). A full
 *      Chromium is preferred over `headless_shell` because only the full build
 *      ships the PDF viewer (native PDF preview cases).
 *   3. npm-shipped Linux build (@sparticuz/chromium) — **Linux x64 only**.
 *      Never used on macOS/Windows: it is an x86_64 Linux binary.
 *
 * Modes:
 *   auto                (default) override -> managed -> npm-linux (linux only)
 *   managed             override -> managed -> fail with instructions
 *   playwright-download install a managed browser, then use it (never falls
 *                       back to the Linux npm build; fails loudly instead)
 *   npm-linux           npm-shipped build only (linux x64 only)
 *
 * Output (stdout): JSON { executable, source, platform, arch, libDir, fonts,
 * managedRoot }. Failures go to stderr with an actionable message; exit 1.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith('--')) continue;
  const value = process.argv[index + 1] && !process.argv[index + 1].startsWith('--')
    ? process.argv[++index]
    : 'true';
  args.set(key.slice(2), value);
}

const mode = args.get('mode') || 'auto';
const toolsDir = args.get('tools') || '';
const platform = process.platform;
const arch = process.arch;

function defaultBrowsersRoot() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;
  const home = os.homedir();
  if (platform === 'darwin') return path.join(home, 'Library', 'Caches', 'ms-playwright');
  if (platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'ms-playwright');
  }
  return path.join(process.env.XDG_CACHE_HOME || path.join(home, '.cache'), 'ms-playwright');
}

/** Candidate executables inside one Playwright browser directory, best first. */
function candidatesFor(dir) {
  if (platform === 'darwin') {
    return [
      path.join(dir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      path.join(dir, 'chrome-mac', 'Chromium'),
      path.join(dir, 'chrome-mac', 'headless_shell'),
    ];
  }
  if (platform === 'win32') {
    return [
      path.join(dir, 'chrome-win', 'chrome.exe'),
      path.join(dir, 'chrome-win', 'headless_shell.exe'),
    ];
  }
  return [
    path.join(dir, 'chrome-linux', 'chrome'),
    path.join(dir, 'chrome-linux', 'headless_shell'),
    path.join(dir, 'chromium-linux', 'chrome'),
  ];
}

function findManaged(root) {
  if (!root || !fs.existsSync(root)) return null;
  let dirs = [];
  try {
    dirs = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name));
  } catch (error) {
    throw new Error(`cannot read Playwright browsers directory ${root}: ${error.message}`);
  }
  // Prefer a full Chromium build over the headless shell (PDF viewer support).
  const ordered = dirs.sort((a, b) => {
    const shellA = path.basename(a).includes('headless_shell') ? 1 : 0;
    const shellB = path.basename(b).includes('headless_shell') ? 1 : 0;
    return shellA - shellB || path.basename(b).localeCompare(path.basename(a));
  });
  for (const dir of ordered) {
    for (const candidate of candidatesFor(dir)) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

async function npmLinuxBuild() {
  if (platform !== 'linux') {
    throw new Error(
      `the npm-shipped Chromium is an x86_64 Linux binary and cannot run on ${platform}; ` +
        'install a managed browser with `bash scripts/eu_browser_setup.sh playwright-download` ' +
        '(or `npx playwright install chromium`), or set EU_V_CHROMIUM_EXECUTABLE to a local Chromium/Chrome',
    );
  }
  if (arch !== 'x64' && arch !== 'arm64') {
    throw new Error(`unsupported architecture for the npm-shipped Chromium: ${arch}`);
  }
  if (!toolsDir || !fs.existsSync(toolsDir)) {
    throw new Error(`tools directory not found (${toolsDir}); run scripts/eu_browser_setup.sh first`);
  }
  // Sandbox-only workaround: the package extracts its bundled glibc/NSS libraries
  // only when it believes it runs on Amazon Linux 2023.
  process.env.AWS_EXECUTION_ENV = process.env.AWS_EXECUTION_ENV || 'AWS_Lambda_nodejs22.x';
  const entry = path.join(toolsDir, 'node_modules', '@sparticuz', 'chromium', 'build', 'index.js');
  if (!fs.existsSync(entry)) {
    throw new Error(`@sparticuz/chromium not installed in ${toolsDir}`);
  }
  const module = await import(`file://${entry}`);
  const chromium = module.default;
  const bin = path.join(toolsDir, 'node_modules', '@sparticuz', 'chromium', 'bin');
  const executable = await chromium.executablePath(bin);
  const libDir = path.join(os.tmpdir(), 'al2023', 'lib');
  const fonts = path.join(os.tmpdir(), 'fonts');
  return {
    executable,
    source: 'npm:@sparticuz/chromium',
    libDir: fs.existsSync(libDir) ? libDir : '',
    fonts: fs.existsSync(fonts) ? fonts : '',
    managedRoot: '',
  };
}

function fromOverride() {
  const override = process.env.EU_V_CHROMIUM_EXECUTABLE;
  if (!override) return null;
  if (!fs.existsSync(override)) {
    throw new Error(`EU_V_CHROMIUM_EXECUTABLE does not exist: ${override}`);
  }
  if (!fs.statSync(override).isFile()) {
    throw new Error(`EU_V_CHROMIUM_EXECUTABLE is not a file: ${override}`);
  }
  return {
    executable: override,
    source: 'override:EU_V_CHROMIUM_EXECUTABLE',
    // Optional companions for overrides that need bundled loader paths (e.g. a
    // self-extracted Linux build). Normally left empty for a system Chrome.
    libDir: process.env.EU_V_CHROMIUM_LIB_DIR || '',
    fonts: process.env.EU_V_CHROMIUM_FONTS_DIR || '',
    managedRoot: '',
  };
}

function managedOrNull() {
  const root = defaultBrowsersRoot();
  const executable = findManaged(root);
  if (!executable) return null;
  return {
    executable,
    source: 'playwright-managed',
    libDir: '',
    fonts: '',
    managedRoot: root,
  };
}

function fail(message) {
  process.stderr.write(`EU-V browser resolution failed: ${message}\n`);
  process.exit(1);
}

async function main() {
  const override = fromOverride();
  if (override) {
    process.stdout.write(`${JSON.stringify({ ...override, platform, arch }, null, 2)}\n`);
    return;
  }
  if (mode === 'npm-linux') {
    process.stdout.write(`${JSON.stringify({ ...(await npmLinuxBuild()), platform, arch }, null, 2)}\n`);
    return;
  }
  const managed = managedOrNull();
  if (managed && mode !== 'npm-linux') {
    process.stdout.write(`${JSON.stringify({ ...managed, platform, arch }, null, 2)}\n`);
    return;
  }
  if (mode === 'playwright-download') {
    fail(
      'playwright-download was requested but no managed browser was found after the install step. ' +
        `Checked ${defaultBrowsersRoot()}. Re-run the install and inspect its output.`,
    );
  }
  if (mode === 'managed') {
    fail(
      `no Playwright-managed browser found in ${defaultBrowsersRoot()}. Install one with:\n` +
        '  npx playwright install chromium\n' +
        'or set EU_V_CHROMIUM_EXECUTABLE to a Chromium/Chrome binary.',
    );
  }
  try {
    const npm = await npmLinuxBuild();
    process.stdout.write(`${JSON.stringify({ ...npm, platform, arch }, null, 2)}\n`);
  } catch (error) {
    fail(error.message);
  }
}

main().catch((error) => fail(error.message));
