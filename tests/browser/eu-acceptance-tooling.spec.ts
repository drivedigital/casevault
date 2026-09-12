/**
 * EU-V — TOOLING self-check (not product acceptance).
 *
 * Purpose: prove, before EU-D/EU-L merge, that the acceptance plumbing works
 * against the real stack — real browser, real Chromium download pipeline, real
 * API, real worker, real Postgres/Redis, real Next dev server — so the final
 * acceptance run cannot fail merely because the harness is broken.
 *
 * Nothing here asserts product behaviour from the closure contract; those cases
 * live in the eu-acceptance-detail / eu-acceptance-list / eu-acceptance-ocr
 * specs and stay red until EU-D and EU-L land.
 *
 * Modes used: REAL_API, REAL_WORKER, TRANSPORT, INJECTED_FAULT.
 */
import { expect, test } from '@playwright/test';
import {
  declareMode,
  expectDownloadEqual,
  fixture,
  injectFailure,
  queryDatabase,
  recordErrors,
  sha256File,
  uploadViaInput,
  uploadViaKeyboard,
} from './eu-acceptance-harness';

test.describe('EU-V/T tooling — real stack through a real browser', () => {
  test('T1 list page loads against the real API with no page errors [REAL_API]', async ({ page }) => {
    declareMode('REAL_API', 'integrated API + Next dev server, isolated DB/storage');
    const { errors } = recordErrors(page);
    await page.goto('/evidence');
    await expect(page.getByRole('heading', { name: 'Evidence' })).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
    expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('T2 synthetic upload through the browser persists a real source [REAL_API]', async ({ page }) => {
    declareMode('REAL_API', 'browser file chooser -> POST /sources -> Postgres');
    const meta = fixture('text');
    await page.goto('/evidence');

    // Keyboard path first: the closure contract requires keyboard operability.
    const keyboard = await uploadViaKeyboard(page, 'input[type=file]', meta.path);
    if (!keyboard.chooserOpened) {
      // Pre-EU-L baseline hides the input; report, do not paper over it.
      test.info().annotations.push({
        type: 'eu-v-baseline-gap',
        description: 'input[type=file] did not open a chooser on Enter/Space (see EU-L §3)',
      });
      await uploadViaInput(page, 'input[type=file]', meta.path);
    }

    await expect(page.locator('table tbody tr', { hasText: meta.filename }).first()).toBeVisible({
      timeout: 60_000,
    });

    const rows = queryDatabase<{ original_filename: string; sha256: string; source_type: string }>(
      `SELECT original_filename, sha256, source_type FROM sources
       WHERE original_filename = '${meta.filename}'`,
    );
    // Re-uploading the same fixture is legal (the product flags duplicates
    // instead of deleting), so assert presence + integrity, never uniqueness.
    expect(rows.length, 'source row committed to the isolated database').toBeGreaterThan(0);
    expect(rows.some((row) => row.sha256 === meta.sha256), 'stored bytes match the fixture').toBe(true);
  });

  test('T3 original bytes survive the browser download path [TRANSPORT]', async ({ page }, testInfo) => {
    declareMode('TRANSPORT', 'real browser download of the same-origin file endpoint');
    const meta = fixture('text');
    await page.goto('/evidence');
    await expect(page.locator('table tbody tr', { hasText: meta.filename }).first()).toBeVisible();
    const href = await page
      .locator('table tbody tr', { hasText: meta.filename })
      .first()
      .locator('a')
      .first()
      .getAttribute('href');
    expect(href, 'row links to the source detail page').toBeTruthy();
    await page.goto(href!);

    const sourceId = href!.split('/').filter(Boolean).pop()!;
    // A real browser-initiated download of the shipped same-origin endpoint.
    // page.goto() is wrapped because a PDF/attachment navigation rejects with
    // "Download is starting" while the download event is still emitted.
    const download = await expectDownloadEqual(page, async () => {
      await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }).catch(() => null),
        page.goto(`/api/v1/sources/${sourceId}/file`).catch((error: Error) => {
          if (!/Download is starting/.test(error.message)) throw error;
        }),
      ]);
    }, meta);
    testInfo.annotations.push({
      type: 'eu-v-download',
      description: `${download.suggestedFilename()} sha256 verified`,
    });
  });

  test('T4 injected transport faults reach the page [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'route-level fault; never a substitute for real API proof');
    const restore = await injectFailure(page, /\/api\/v1\/sources(\?|$)/, { status: 500 });
    const statuses: number[] = [];
    page.on('response', (response) => {
      if (/\/api\/v1\/sources(\?|$)/.test(response.url())) statuses.push(response.status());
    });
    await page.goto('/evidence');
    await expect.poll(() => statuses, { timeout: 20_000 }).toContain(500);
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toContain('application error');
    await restore();
  });

  test('T5 report the browser PDF capability honestly (informational)', async ({ page }) => {
    declareMode('TRANSPORT', 'capability report only — no pass/fail product claim');
    await page.goto('/evidence');
    const capability = await page.evaluate(() => ({
      pdfViewerEnabled: navigator.pdfViewerEnabled === true,
      plugins: navigator.plugins.length,
      userAgent: navigator.userAgent,
    }));
    console.log('[EU-V] browser PDF capability:', JSON.stringify(capability));
    test.info().annotations.push({
      type: 'eu-v-browser-capability',
      description: JSON.stringify(capability),
    });
    if (!capability.pdfViewerEnabled) {
      test.info().annotations.push({
        type: 'eu-v-limitation',
        description:
          'No PDF viewer in this Chromium build: native PDF render checks are handed to EU-M',
      });
    }
    expect(capability.userAgent).toBeTruthy();
  });

  test('T6 failure artifacts are written outside Git', async ({ page }, testInfo) => {
    declareMode('TRANSPORT', 'artifact pipeline check');
    await page.goto('/evidence');
    const file = testInfo.outputPath('tooling-screenshot.png');
    await page.screenshot({ path: file });
    expect(sha256File(file).length).toBe(64);
    expect(file.includes('/data/diagnostics/') || file.includes('/data/temp/')).toBe(true);
  });
});
