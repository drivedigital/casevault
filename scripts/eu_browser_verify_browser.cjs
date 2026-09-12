#!/usr/bin/env node
/**
 * EU-V — verify that a resolved Chromium really launches and report capabilities.
 *
 * CommonJS on purpose: NODE_PATH (used to reach the scratch Playwright install)
 * only applies to `require`, not to ESM `import`.
 *
 * Usage:
 *   NODE_PATH=<tools>/node_modules node scripts/eu_browser_verify_browser.cjs \
 *       <executable> [libDir] [fontsDir]
 *
 * Prints JSON { version, text, pdfViewerEnabled, plugins, platform } on stdout.
 * Exits non-zero when the browser cannot launch or cannot render a page, so the
 * setup script never claims success on an unusable binary.
 */
const path = require('node:path');
const { chromium } = require('@playwright/test');

const [executable, libDir = '', fontsDir = ''] = process.argv.slice(2);
if (!executable) {
  process.stderr.write(
    'usage: eu_browser_verify_browser.cjs <executable> [libDir] [fontsDir]\n',
  );
  process.exit(2);
}

const env = { ...process.env };
if (libDir) env.LD_LIBRARY_PATH = libDir;
if (fontsDir) env.FONTCONFIG_PATH = fontsDir;

async function main() {
  const browser = await chromium.launch({
    executablePath: executable || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    env,
  });
  try {
    const page = await browser.newPage();
    await page.setContent('<h1 id="t">eu-v</h1>');
    const result = {
      version: browser.version(),
      text: await page.$eval('#t', (element) => element.textContent),
      pdfViewerEnabled: await page.evaluate(() => navigator.pdfViewerEnabled === true),
      plugins: await page.evaluate(() => navigator.plugins.length),
      platform: process.platform,
      executable: path.basename(executable),
      libDir: libDir || '',
    };
    if (result.text !== 'eu-v') {
      throw new Error('browser rendered an unexpected document');
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write(`EU-V browser verification failed: ${error.message}\n`);
  process.exit(1);
});
