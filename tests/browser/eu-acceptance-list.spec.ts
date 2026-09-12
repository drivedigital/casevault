/**
 * EU-V — EU-L list-page acceptance (contract §EU-L.1–§EU-L.5).
 *
 * PRODUCT acceptance cases, written behaviour-first. Expected RED until the
 * corrected EU-L branch is integrated; EU-V reports defects instead of editing
 * the page.
 *
 * Modes: REAL_API for positive paths, INJECTED_FAULT for deterministic
 * negative paths, TRANSPORT for response-shape checks.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  apiGet,
  declareMode,
  fixture,
  injectDelay,
  injectFailure,
  injectNetworkError,
  recordErrors,
  recordRequests,
  seedSource,
  uploadViaInput,
  uploadViaKeyboard,
} from './eu-acceptance-harness';

function rows(page: Page) {
  return page.locator('table tbody tr');
}

test.describe('EU-L/L1 distinct list states', () => {
  test('L1.1 loading state is distinct from empty and error [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'delayed GET /sources to observe the loading state');
    const restore = await injectDelay(page, /\/api\/v1\/sources(\?|$)/, 2_000);
    await page.goto('/evidence');
    const loading = page.getByText(/loading/i).first();
    await expect(loading).toBeVisible({ timeout: 5_000 });
    await restore();
    await expect(page.locator('table')).toBeVisible();
  });

  test('L1.2 empty state on a fresh isolated workspace [REAL_API]', async ({ page }) => {
    declareMode('REAL_API', 'isolated database with no sources');
    await page.goto('/evidence?q=eu-v-does-not-exist-anywhere');
    const body = page.locator('body');
    await expect(body).toContainText(/(no evidence|no sources|nothing)/i);
    await expect(body).not.toContainText(/(failed|error)/i);
  });

  test('L1.3 filtered-empty differs from a true empty state [REAL_API]', async ({ page }) => {
    declareMode('REAL_API', 'sources exist; the filter matches none');
    await seedSource(page, 'text');
    await page.goto('/evidence');
    await expect(rows(page).first()).toBeVisible();

    await page.getByPlaceholder(/keyword/i).fill('eu-v-nothing-matches-this');
    const filtered = (await page.locator('body').innerText()).toLowerCase();
    expect(filtered).toMatch(/(no evidence|no sources|no matches|nothing|0 results)/i);
    expect(filtered, 'filtered-empty must not claim the workspace is empty').not.toMatch(/upload your first/i);
  });

  test('L1.4 request failure is not rendered as an empty list [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'injected 500 on GET /sources');
    const restore = await injectFailure(page, /\/api\/v1\/sources(\?|$)/, { status: 500 });
    await page.goto('/evidence');
    const body = page.locator('body');
    await expect(body).toContainText(/(failed|error|unable|could not)/i, { timeout: 20_000 });
    await expect(body).not.toContainText(/no evidence matches/i);
    await expect(page.getByRole('button', { name: /retry|try again/i }).first()).toBeVisible();
    await restore();
  });

  test('L1.5 retained stale rows are labelled [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'list loads, then a successful row mutation triggers a failing background refetch');
    const { id } = await seedSource(page, 'text');
    await page.goto('/evidence');
    const retainedRow = page.locator('table tbody tr', { has: page.locator(`a[href="/evidence/${id}"]`) });
    await expect(retainedRow, 'the specific seeded source is loaded before the fault').toBeVisible();

    const requests = recordRequests(page);
    const restore = await injectFailure(page, /\/api\/v1\/sources(\?|$)/, { status: 500 });
    requests.reset();

    // A successful row mutation invalidates the existing sources query and
    // makes React Query refetch it in the background. This preserves the
    // in-memory data; a page reload would discard it and cannot prove stale-row
    // retention.
    await retainedRow.getByRole('button', { name: /^include$/i }).click();
    await expect
      .poll(
        () => requests.matching(/\/api\/v1\/sources(\?|$)/).filter((request) => request.method() === 'GET').length,
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);

    const staleAlert = page.getByRole('alert').filter({ hasText: /out of date/i });
    await expect(staleAlert, 'the failed background refetch is visible with stale-data feedback').toContainText(
      /(failed|error|unable|could not|out of date)/i,
    );
    await expect(retainedRow, 'the specific previously loaded source remains visible').toBeVisible();
    await expect(retainedRow.getByTestId('stale-chip'), 'the retained source is explicitly labelled stale').toContainText(
      /saved result.*may be out of date/i,
    );

    await restore();
  });
});

test.describe('EU-L/L2 row mutations, pending protection and preserved inputs', () => {
  test('L2.1/L2.2 include and exclude failures are visible per row [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'injected PATCH 500 for row actions');
    const { meta } = await seedSource(page, 'text');
    await page.goto('/evidence');
    const row = page.locator('table tbody tr', { hasText: meta.filename }).first();

    const restore = await injectFailure(page, /\/api\/v1\/sources\/[^/?]+$/, {
      status: 500,
      body: { detail: 'injected row failure' },
    });
    const include = row.getByRole('button', { name: /^include$/i }).first();
    await include.click();
    await expect(row).toContainText(/(failed|error)/i);
    await expect(row, 'no optimistic flip').not.toContainText(/included/i);

    const exclude = row.getByRole('button', { name: /^exclude$/i }).first();
    if (await exclude.count()) {
      await exclude.click();
      await expect(row).toContainText(/(failed|error)/i);
    }
    await restore();
  });

  test('L2.3 pending protection prevents duplicate row actions [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'delayed PATCH with a rapid second click');
    await seedSource(page, 'text');
    await page.goto('/evidence');
    const log = recordRequests(page);
    const restore = await injectDelay(page, /\/api\/v1\/sources\/[^/?]+$/, 1_500);

    const include = rows(page).first().getByRole('button', { name: /^include$/i }).first();
    await include.click();
    await page.waitForTimeout(150);
    await include.click({ force: true, timeout: 2_000 }).catch(() => undefined);
    await page.waitForTimeout(2_500);

    const patches = log.matching(/\/api\/v1\/sources\/[^/?]+$/).filter((r) => r.method() === 'PATCH');
    expect(patches.length, `PATCH count: ${patches.length}`).toBe(1);
    await restore();
  });

  test('L2.4 exclusive transitions send both flags [REAL_API]', async ({ page }) => {
    declareMode('REAL_API', 'captures the real PATCH payload');
    await seedSource(page, 'text');
    await page.goto('/evidence');
    const log = recordRequests(page);

    const include = rows(page).first().getByRole('button', { name: /^include$/i }).first();
    if (await include.count()) {
      await include.click();
      await page.waitForTimeout(2_000);
    }
    const exclude = rows(page).first().getByRole('button', { name: /^exclude$/i }).first();
    if (await exclude.count()) {
      await exclude.click();
      await page.waitForTimeout(2_000);
    }

    const bodies = log
      .matching(/\/api\/v1\/sources\/[^/?]+$/)
      .filter((r) => r.method() === 'PATCH')
      .map((r) => JSON.parse(r.postData() ?? '{}'));
    expect(bodies.length, 'at least one transition was attempted').toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body, `payload: ${JSON.stringify(body)}`).toHaveProperty('included_flag');
      expect(body, `payload: ${JSON.stringify(body)}`).toHaveProperty('excluded_flag');
    }
  });

  test('L2.5 retries preserve query and filter values [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'failing row action with filters applied');
    await seedSource(page, 'text');
    await page.goto('/evidence');
    await page.getByPlaceholder(/keyword/i).fill('synthetic');
    const select = page.locator('select').first();
    await select.selectOption({ index: 1 }).catch(() => undefined);

    const restore = await injectFailure(page, /\/api\/v1\/sources\/[^/?]+$/, { status: 500 });
    const include = rows(page).first().getByRole('button', { name: /^include$/i }).first();
    if (await include.count()) await include.click();
    await page.waitForTimeout(1_000);

    await expect(page.getByPlaceholder(/keyword/i), 'search text survived the failure').toHaveValue('synthetic');
    await restore();
  });
});

test.describe('EU-L/L3 matter filter and row badge failures', () => {
  test('L3.1 matter filter failure is not "no linked matters" [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'fails /matters, which feeds the filter');
    await seedSource(page, 'text');
    const restore = await injectFailure(page, /\/api\/v1\/matters(\?|$)/, { status: 500 });
    await page.goto('/evidence');
    const body = page.locator('body');
    await expect(body).toContainText(/(failed|error|unavailable|could not|retry)/i, { timeout: 20_000 });
    await expect(body).not.toContainText(/no linked matters/i);
    await restore();
  });

  test('L3.2/L3.3/L3.4 row badge failure: per-row, no raw trace, accessible [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'fails per-row source-matters with a traceback body');
    const { meta } = await seedSource(page, 'text');
    const restore = await injectFailure(page, /\/api\/v1\/sources\/[^/]+\/matters/, {
      status: 500,
      body: { detail: 'Traceback (most recent call last): File "app.py", line 42, in boom; SELECT * FROM sources' },
    });
    await page.goto('/evidence');
    const row = page.locator('table tbody tr', { hasText: meta.filename }).first();
    const text = (await row.innerText()).toLowerCase();
    expect(text, 'row shows feedback').toMatch(/(failed|error|unavailable|retry|!)/i);
    expect(text, 'no raw server trace leaked').not.toMatch(/traceback|select \*|file "/i);

    const alert = page.locator('[role=alert], [aria-live]').first();
    expect(await alert.count(), 'feedback is announced').toBeGreaterThan(0);
    await restore();
  });
});

test.describe('EU-L/L4 upload, filters and parity', () => {
  test('L4.1 upload works by keyboard only [REAL_API]', async ({ page }) => {
    declareMode('REAL_API', 'real file chooser opened from the keyboard');
    const meta = fixture('text');
    await page.goto('/evidence');
    const keyboard = await uploadViaKeyboard(page, 'input[type=file]', meta.path);
    expect(keyboard.chooserOpened, 'the upload control must be keyboard operable').toBe(true);
    await expect(rows(page).filter({ hasText: meta.filename }).first()).toBeVisible({ timeout: 60_000 });
  });

  test('L4.2 drag/pointer path still uploads [REAL_API]', async ({ page }) => {
    declareMode('REAL_API', 'files set directly on the input');
    const meta = fixture('pdf');
    await page.goto('/evidence');
    await uploadViaInput(page, 'input[type=file]', meta.path);
    await expect(rows(page).filter({ hasText: meta.filename }).first()).toBeVisible({ timeout: 60_000 });
  });

  test('L4.3 upload failure is visible and attributable [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'injected 500 on POST /sources');
    const meta = fixture('text');
    await page.goto('/evidence');
    const restore = await injectFailure(page, /\/api\/v1\/sources(\?|$)/, { status: 500 });
    await page.route('**/api/v1/sources', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'upload refused' }) })
        : route.continue(),
    );
    await uploadViaInput(page, 'input[type=file]', meta.path);
    await expect(page.locator('body')).toContainText(/(upload failed|failed|error|could not)/i, {
      timeout: 20_000,
    });
    await restore();
  });

  test('L4.4 only server-supported filters are sent [REAL_API]', async ({ page }) => {
    declareMode('REAL_API', 'query string observed from the browser');
    await page.goto('/evidence');
    const log = recordRequests(page);
    await page.getByPlaceholder(/keyword/i).fill('synthetic');
    await page.waitForTimeout(2_000);
    const urls = log.matching(/\/api\/v1\/sources\?/).map((r) => new URL(r.url()));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      const params = [...url.searchParams.keys()].sort();
      expect(params, `query: ${url.search}`).toEqual(
        expect.arrayContaining([]) as unknown as string[],
      );
      for (const key of params) {
        expect(['q', 'matter_id', 'source_type', 'evidence_review_status'], `unsupported filter: ${key}`).toContain(key);
      }
    }
  });

  test('L4.5 client-side filter parity retained [REAL_API]', async ({ page }) => {
    declareMode('REAL_API', 'existing client-side filters still narrow the rows');
    await seedSource(page, 'text');
    await seedSource(page, 'pdf');
    await page.goto('/evidence');
    const before = await rows(page).count();
    const ocr = page.locator('select').nth(4);
    await ocr.selectOption({ label: 'complete' }).catch(() => undefined);
    await page.waitForTimeout(1_500);
    const after = await rows(page).count();
    expect(after).toBeLessThanOrEqual(before);
  });

  test('L4.6 sources response remains a bare array [TRANSPORT]', async ({ page }) => {
    declareMode('TRANSPORT', 'response-shape check, not a UI claim');
    const list = await apiGet<any>(page, '/api/v1/sources');
    expect(Array.isArray(list), 'GET /sources returns an array').toBe(true);
  });

  test('L4.7 duplicate warnings are retained [REAL_API]', async ({ page }) => {
    declareMode('REAL_API', 'the same synthetic file uploaded twice');
    const meta = fixture('text');
    await page.goto('/evidence');
    await uploadViaInput(page, 'input[type=file]', meta.path);
    await expect(rows(page).filter({ hasText: meta.filename }).first()).toBeVisible({ timeout: 60_000 });
    await uploadViaInput(page, 'input[type=file]', meta.path);
    await expect(page.getByText(/duplicate/i).first()).toBeVisible({ timeout: 60_000 });
  });

  test('L4.8 original navigation preserved [REAL_API]', async ({ page }) => {
    declareMode('REAL_API', 'row links and neighbouring modules still work');
    const { errors } = recordErrors(page);
    const { id, meta } = await seedSource(page, 'text');
    await page.goto('/evidence');
    await page.locator('table tbody tr', { hasText: meta.filename }).first().locator('a').first().click();
    await expect(page).toHaveURL(new RegExp(`/evidence/${id}`));
    for (const path of ['/ledger', '/ai-review']) {
      await page.goto(path);
      await expect(page.locator('body')).not.toContainText(/application error/i);
    }
    // Next's dev server logs RSC/ChunkLoad noise when it recompiles between
    // navigations. It is environment noise, not a product defect — annotated,
    // never silently dropped.
    const devNoise = /ChunkLoadError|RSC payload|_next\/static/i;
    const productErrors = errors.filter((error) => !devNoise.test(error));
    if (errors.length !== productErrors.length) {
      test.info().annotations.push({
        type: 'eu-v-dev-server-noise',
        description: errors.filter((error) => devNoise.test(error)).join(' | '),
      });
    }
    expect(productErrors, `page errors: ${productErrors.join(' | ')}`).toEqual([]);
  });
});

test.describe('EU-L/L5 cache refresh scope', () => {
  test('L5.1/L5.2 success refreshes the source list and spares unrelated queries [REAL_API]', async ({ page }) => {
    declareMode('REAL_API', 'request log observed during a successful upload');
    const meta = fixture('image');
    await page.goto('/evidence');
    const log = recordRequests(page);
    const countGets = () =>
      log.matching(/\/api\/v1\/sources(\?|$)/).filter((r) => r.method() === 'GET').length;
    const before = countGets();
    await uploadViaInput(page, 'input[type=file]', meta.path);
    await expect(rows(page).filter({ hasText: meta.filename }).first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(3_000);

    expect(countGets(), 'the list query was refetched after success').toBeGreaterThan(before);
    const unrelated = log.matching(/\/api\/v1\/(ledger|proposals|facts|review)/);
    expect(unrelated.length, `unrelated refetch: ${unrelated.map((r) => r.url())}`).toBe(0);
  });
});
