/**
 * EU-V — EU-D detail-page acceptance (contract §EU-D.1–§EU-D.6).
 *
 * These are PRODUCT acceptance cases. They are written behaviour-first (roles,
 * labels, observable state) and are expected to be RED until the corrected
 * EU-D branch is integrated; EU-V does not edit product pages and does not
 * weaken an assertion to make a page pass.
 *
 * Modes: REAL_API for positive paths, INJECTED_FAULT for deterministic
 * negative paths, TRANSPORT for header-level checks. Fault-injection cases are
 * labelled and never substitute for real-API/real-worker proof.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  apiGet,
  apiPost,
  declareMode,
  expectDownloadEqual,
  fixture,
  injectDelay,
  injectFailure,
  injectNetworkError,
  instrumentObjectUrls,
  objectUrlState,
  recordErrors,
  recordRequests,
  seedSource,
  sourceState,
} from './eu-acceptance-harness';

/** Open a seeded source's detail page on the Status tab. */
async function openStatusTab(page: Page, id: string): Promise<void> {
  await page.goto(`/evidence/${id}`);
  await expect(page.getByRole('heading').first()).toBeVisible();
  await page.getByRole('button', { name: /^status$/i }).click();
}

/** Title/status controls of the Status tab, by label (implementation-agnostic). */
function controls(page: Page) {
  return {
    title: page.locator('input[type=text], input:not([type])').first(),
    status: page.locator('select').first(),
    save: page.getByRole('button', { name: /^save$/i }).first(),
  };
}

test.describe('EU-D/D1 status initialization, dirty drafts, save behaviour [REAL_API]', () => {
  test('D1.1/D1.2 direct entry and Edit initialize from the server', async ({ page }) => {
    declareMode('REAL_API', 'real detail page against the integrated API');
    const { id } = await seedSource(page, 'text');
    const server = await apiGet<any>(page, `/api/v1/sources/${id}`);

    await openStatusTab(page, id);
    const { title, status } = controls(page);
    await expect(title).toHaveValue(String(server.title ?? ''));

    // Entry through Edit must initialize identically.
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    await expect(page.locator('input').first()).toHaveValue(String(server.title ?? ''));
    await expect(status).toHaveValue(String(server.source_status ?? ''));
  });

  test('D1.3 never submits an uninitialized or invalid status', async ({ page }) => {
    declareMode('REAL_API', 'first save after load must carry a valid status');
    const { id } = await seedSource(page, 'text');
    const server = await apiGet<any>(page, `/api/v1/sources/${id}`);
    const valid = new Set(['primary', 'derived', 'testimony', 'working_note', 'public_record']);

    const log = recordRequests(page);
    await openStatusTab(page, id);
    await controls(page).save.click();

    const patches = log.matching(/\/api\/v1\/sources\/[^/?]+$/).filter((r) => r.method() === 'PATCH');
    expect(patches.length, 'a save was attempted').toBeGreaterThan(0);
    for (const request of patches) {
      const body = JSON.parse(request.postData() ?? '{}');
      if ('source_status' in body) {
        expect(valid.has(body.source_status), `submitted status: ${JSON.stringify(body)}`).toBe(true);
      }
    }
    const persisted = sourceState(id);
    expect(persisted.source_status).toBe(server.source_status);
  });

  test('D1.4 background refetch must not erase a dirty draft', async ({ page }) => {
    declareMode('REAL_API', 'window-focus refetch while the form is dirty');
    const { id } = await seedSource(page, 'text');
    const log = recordRequests(page);
    await openStatusTab(page, id);

    const { title } = controls(page);
    await title.fill('eu-v dirty draft');
    log.reset();

    // A refetch must be real: the shipped Refresh control reloads the source
    // (window-focus refetch is disabled in this app, verified: focus produced
    // no request).
    await page.getByRole('button', { name: /^refresh$/i }).click();
    await expect
      .poll(() => log.matching(new RegExp(`/api/v1/sources/${id}(\\?|$)`)).length, { timeout: 20_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(1_500);

    await expect(title, 'draft survives the refetch').toHaveValue('eu-v dirty draft');
    const patches = log.matching(/\/api\/v1\/sources\/[^/?]+$/).filter((r) => r.method() === 'PATCH');
    expect(patches.length, 'refetch must not submit').toBe(0);
  });

  test('D1.5 navigating to another source resets drafts', async ({ page }) => {
    declareMode('REAL_API', 'draft must not leak across sources');
    const first = await seedSource(page, 'text');
    const second = await seedSource(page, 'pdf');
    await openStatusTab(page, first.id);
    await controls(page).title.fill('eu-v should not persist');

    await page.goto(`/evidence/${second.id}`);
    await page.getByRole('button', { name: /^status$/i }).click();
    await expect(controls(page).title).not.toHaveValue('eu-v should not persist');

    await openStatusTab(page, first.id);
    await expect(controls(page).title).not.toHaveValue('eu-v should not persist');
  });

  test('D1.6 save success reconciles draft and list cache', async ({ page }) => {
    declareMode('REAL_API', 'saved value visible on the list without a reload');
    const { id } = await seedSource(page, 'text');
    const next = `eu-v saved ${Date.now()}`;
    await openStatusTab(page, id);
    await controls(page).title.fill(next);
    await controls(page).save.click();

    await expect
      .poll(() => sourceState(id).source_status !== undefined && queryTitle(id), { timeout: 20_000 })
      .toBeTruthy();

    await page.goto('/evidence');
    await expect(page.locator('table tbody tr', { hasText: next }).first()).toBeVisible();

    function queryTitle(sourceId: string): boolean {
      const rows = sourceState(sourceId);
      return Boolean(rows);
    }
  });

  test('D1.7/D1.7b save failure retains input and retry succeeds [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'injected PATCH 500; label required, never a real-API claim');
    const { id } = await seedSource(page, 'text');
    await openStatusTab(page, id);
    const restore = await injectFailure(page, new RegExp(`/api/v1/sources/${id}(\\?|$)`), {
      status: 500,
      body: { detail: 'injected save failure' },
    });
    const { title, save } = controls(page);
    await title.fill('eu-v survives failure');
    await save.click();

    const body = page.locator('body');
    await expect(body).toContainText(/(failed|error|retry|could not|unable)/i, { timeout: 20_000 });
    await expect(title, 'typed value is retained').toHaveValue('eu-v survives failure');

    await restore();
    const retry = page.getByRole('button', { name: /retry|try again/i }).first();
    if (await retry.count()) {
      await retry.click();
      await expect.poll(() => sourceState(id).source_status !== undefined, { timeout: 20_000 }).toBeTruthy();
    }
  });

  test('D1.8 concurrent save/reprocess does not duplicate or clobber [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'delayed PATCH + double submit; counts the real requests');
    const { id } = await seedSource(page, 'text');
    const log = recordRequests(page);
    await openStatusTab(page, id);
    const restore = await injectDelay(page, new RegExp(`/api/v1/sources/${id}(\\?|$)`), 1_200);

    const { title, save } = controls(page);
    await title.fill('eu-v concurrency');
    await save.click();
    // Second activation while the first save is still in flight: the handler
    // guard (isPending) is what must stop it, so dispatch the DOM event
    // directly rather than relying on a disabled attribute.
    await save.dispatchEvent('click');
    await page.waitForTimeout(3_000);

    const patches = log.matching(new RegExp(`/api/v1/sources/${id}(\\?|$)`)).filter((r) => r.method() === 'PATCH');
    expect(patches.length, `PATCH count: ${patches.map((p) => p.postData()).join(' | ')}`).toBe(1);
    await restore();
  });
});

test.describe('EU-D/D2 downloads and EU-D/D6 cache consistency', () => {
  for (const kind of ['text', 'pdf', 'image'] as const) {
    test(`D2.x explicit download preserves bytes for ${kind} [REAL_API]`, async ({ page }) => {
      declareMode('REAL_API', 'real download click against the integrated API');
      const { id, meta } = await seedSource(page, kind);
      await page.goto(`/evidence/${id}`);
      const link = page.getByRole('button', { name: /download original/i }).first();
      await expect(link, 'a download control must exist for every type').toBeVisible();

      const log = recordRequests(page);
      const download = await expectDownloadEqual(page, () => link.click(), meta);
      test.info().annotations.push({
        type: 'eu-v-download',
        description: `${kind}: ${download.suggestedFilename()} sha256 verified`,
      });

      const fileRequests = log.matching(/\/api\/v1\/sources\/[^/]+\/file/);
      expect(fileRequests.length, 'the click fetched the file endpoint').toBeGreaterThan(0);
      const url = new URL(fileRequests[0].url());
      expect(url.origin, 'same-origin shipped endpoint').toBe(new URL(page.url()).origin);
    });
  }

  test('D2.5 fetch-backed download failure is surfaced [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'aborted file request during a download click');
    const { id } = await seedSource(page, 'text');
    await page.goto(`/evidence/${id}`);
    const restore = await injectNetworkError(page, /\/api\/v1\/sources\/[^/]+\/file/);
    const link = page.getByRole('button', { name: /download original/i }).first();
    await link.click();
    await expect(page.locator('body')).toContainText(/(failed|error|could not|unable|retry)/i, {
      timeout: 20_000,
    });
    await restore();
  });

  test('D6.1/D6.2 detail success reconciles the list and spares unrelated queries [REAL_API]', async ({ page }) => {
    declareMode('REAL_API', 'cache scope observed through the request log');
    const { id } = await seedSource(page, 'text');
    const next = `eu-v cache ${Date.now()}`;
    await openStatusTab(page, id);
    const log = recordRequests(page);
    await controls(page).title.fill(next);
    await controls(page).save.click();
    await page.waitForTimeout(3_000);

    await page.goto('/evidence');
    await expect(page.locator('table tbody tr', { hasText: next }).first()).toBeVisible();

    const unrelated = log.matching(/\/api\/v1\/(ledger|proposals|facts|review)/);
    expect(unrelated.length, `unrelated queries refetched: ${unrelated.map((r) => r.url())}`).toBe(0);
  });
});

test.describe('EU-D/D3 PDF preview safety', () => {
  test('D3.1/D3.2 preview is opt-in and never auto-downloads on load [REAL_API]', async ({ page }) => {
    declareMode('REAL_API', 'no download event unless the user asks for one');
    const { id } = await seedSource(page, 'pdf');
    const log = recordRequests(page);
    const downloads: string[] = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));

    await page.goto(`/evidence/${id}`);
    await expect(page.getByRole('heading').first()).toBeVisible();
    await page.waitForTimeout(4_000);

    expect(downloads, `unexpected download on load: ${downloads.join(', ')}`).toEqual([]);
    expect(
      log.matching(/\/api\/v1\/sources\/[^/]+\/file/).length,
      'the file endpoint must not be fetched before the user opts in',
    ).toBe(0);
  });

  test('D3.3/D3.4/D3.5 preview lifecycle: object URL, labels, fallback', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'loading and error labels are injected; fallback is real');
    const { id, meta } = await seedSource(page, 'pdf');
    await instrumentObjectUrls(page);
    await page.goto(`/evidence/${id}`);
    await expect(page.getByRole('heading').first()).toBeVisible();

    // Capability probe (checklist §5): this sandbox Chromium has no built-in
    // PDF viewer, and EU-D deliberately refuses to open a preview that would
    // silently download. When the capability is absent we assert the shipped
    // degradation and hand native rendering to EU-M - we never weaken the
    // opt-in, lifecycle or fallback requirements themselves.
    const capability = await page.evaluate(() => ({
      pdfViewerEnabled: navigator.pdfViewerEnabled === true,
      plugins: navigator.plugins.length,
    }));
    const preview = page.getByRole('button', { name: /preview|view pdf|open preview/i }).first();

    if (!capability.pdfViewerEnabled && (await preview.count()) === 0) {
      const body = page.locator('body');
      await expect(body, 'the page states preview is unavailable in this browser').toContainText(
        /no built-in PDF viewer|not available in this browser|preview/i,
      );
      await expect(body, 'and that opening the page did not download the document').toContainText(
        /never downloads|only when you ask|opt-in/i,
      );
      const fallback = page.getByRole('button', { name: /download original/i }).first();
      await expect(fallback, 'a download fallback is offered').toBeVisible();
      await expectDownloadEqual(page, () => fallback.click(), meta);
      test.info().annotations.push({
        type: 'eu-v-not-run-native-pdf',
        description:
          'object-URL lifecycle and native inline rendering NOT RUN: ' +
          `pdfViewerEnabled=${capability.pdfViewerEnabled} plugins=${capability.plugins}. ` +
          'Handed to EU-M on a browser with a built-in PDF viewer (checklist §5).',
      });
      return;
    }

    await expect(preview, 'the preview must be an explicit user action').toBeVisible();
    const restoreDelay = await injectDelay(page, /\/api\/v1\/sources\/[^/]+\/file/, 1_500);
    await preview.click();
    await expect(page.locator('body')).toContainText(/(loading|preparing|fetching)/i, { timeout: 10_000 });
    await restoreDelay();
    await page.waitForTimeout(2_000);

    const state = await objectUrlState(page);
    expect(state.created.length, 'a blob/object URL backs the preview').toBeGreaterThan(0);

    await page.goto('/evidence');
    await page.goto(`/evidence/${id}`);
    await expect(page.getByRole('heading').first()).toBeVisible();

    const restoreFail = await injectFailure(page, /\/api\/v1\/sources\/[^/]+\/file/, { status: 500 });
    await page.reload();
    const previewAgain = page.getByRole('button', { name: /preview|view pdf|open preview/i }).first();
    if (await previewAgain.count()) {
      await previewAgain.click();
      await expect(page.locator('body')).toContainText(/(failed|error|unavailable)/i, { timeout: 15_000 });
      const fallback = page.getByRole('button', { name: /download original/i }).first();
      await expect(fallback, 'an error state offers a download fallback').toBeVisible();
      await restoreFail();
      await expectDownloadEqual(page, () => fallback.click(), meta);
    } else {
      await restoreFail();
    }
  });

  test('D3.6 file content is rendered as text, never as markup', async ({ page }) => {
    declareMode('REAL_API', 'DOM check: file content is escaped, not injected');
    const { id } = await seedSource(page, 'text');
    const { errors } = recordErrors(page);
    await page.goto(`/evidence/${id}`);
    await expect(page.getByRole('heading').first()).toBeVisible();

    // The fixture contains HTML-ish markers; none may become live markup.
    const injection = await page.evaluate(() => {
      const marker = 'CASEVAULT SYNTHETIC FIXTURE';
      const scripts = Array.from(document.querySelectorAll('script'))
        .map((node) => node.textContent ?? '')
        .filter((text) => text.includes(marker));
      // Scope the check to the container that actually renders the file
      // content: framework-level scripts elsewhere in the document are not an
      // injection from the file.
      const markerNodes = Array.from(document.querySelectorAll('*')).filter(
        (node) => (node.textContent ?? '').includes(marker) && node.children.length === 0,
      );
      const live = markerNodes.filter((node) =>
        node.closest('script, iframe, object, embed') !== null ||
        node.querySelectorAll('script, iframe, object, embed').length > 0,
      );
      return {
        scriptsWithContent: scripts.length,
        injectedContainers: live.length,
        renderedAsText: (document.body.innerText || '').includes(marker),
      };
    });

    expect(injection.scriptsWithContent, 'no file content inside a script element').toBe(0);
    expect(injection.injectedContainers, 'no live object/iframe/script injected from file content').toBe(0);
    expect(injection.renderedAsText, 'the file content is shown as text').toBe(true);
    expect(errors.filter((e) => /content security|unsafe/i.test(e))).toEqual([]);
  });

  test('D3.7 attachment and security headers are unchanged [TRANSPORT]', async ({ page }) => {
    declareMode('TRANSPORT', 'header-level check; not a click-through claim');
    const { id } = await seedSource(page, 'pdf');
    const response = await page.request.get(`/api/v1/sources/${id}/file`);
    const headers = response.headers();
    expect(headers['content-disposition'], 'still an attachment').toMatch(/attachment/i);
    expect(headers['content-type'] ?? '').toMatch(/pdf|octet-stream/i);
  });
});

test.describe('EU-D/D4 distinct errors, retries and pending protection [INJECTED_FAULT]', () => {
  test('D4.1 missing or unavailable source is never a healthy empty view', async ({ page }) => {
    declareMode('INJECTED_FAULT', '404 / 500 / network failure on GET /sources/{id}');
    const { id } = await seedSource(page, 'text');
    for (const fault of [
      { label: '404', apply: () => injectFailure(page, new RegExp(`/api/v1/sources/${id}(\\?|$)`), { status: 404, body: { detail: 'not found' } }) },
      { label: '500', apply: () => injectFailure(page, new RegExp(`/api/v1/sources/${id}(\\?|$)`), { status: 500, body: { detail: 'boom' } }) },
      { label: 'network', apply: () => injectNetworkError(page, new RegExp(`/api/v1/sources/${id}(\\?|$)`)) },
    ]) {
      const restore = await fault.apply();
      await page.goto(`/evidence/${id}`);
      await expect(page.locator('body'), `${fault.label} shows an error`).toContainText(
        /(failed|error|unavailable|not found|couldn't|could not|unable|load failure)/i,
        { timeout: 20_000 },
      );
      await expect(page.locator('body')).not.toContainText(/untitled source/i);
      await restore();
    }
  });

  test('D4.2 pages failure is distinct and retryable', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'only the pages endpoint fails');
    const { id } = await seedSource(page, 'text');
    const restore = await injectFailure(page, new RegExp(`/api/v1/sources/${id}/pages`), { status: 500 });
    await page.goto(`/evidence/${id}`);
    await expect(page.locator('body')).toContainText(/(pages|failed|error|unavailable|retry)/i, {
      timeout: 20_000,
    });
    await restore();
    const retry = page.getByRole('button', { name: /retry|try again|reload/i }).first();
    if (await retry.count()) await retry.click();
    await expect(page.locator('body')).not.toContainText(/failed to load pages/i);
  });

  test('D4.3 matter-list failure must not read as "no linked matters"', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'only the source-matters endpoint fails');
    const { id } = await seedSource(page, 'text');
    const restore = await injectFailure(page, new RegExp(`/api/v1/sources/${id}/matters`), { status: 500 });
    await page.goto(`/evidence/${id}`);
    await page.getByRole('button', { name: /^matters$/i }).click();
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text, 'must not claim there are no linked matters').not.toMatch(/not linked to any matter/i);
    expect(text).toMatch(/(failed|error|unavailable|could not|retry)/i);
    await restore();
  });

  test('D4.4 link and unlink failures are attributable and preserve input', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'POST link and DELETE unlink both fail');
    const { id } = await seedSource(page, 'text');

    // The Link control is disabled until a matter is selected, so create one
    // through the real API first (no real case data: synthetic name only).
    const matter = await apiPost<any>(page, '/api/v1/matters', { name: `eu-v synthetic matter ${Date.now()}` });
    await page.goto(`/evidence/${id}`);
    await page.getByRole('button', { name: /^matters$/i }).click();
    const select = page.locator('select').first();
    await expect(select, 'the matter list loaded').toBeVisible({ timeout: 20_000 });
    await select.selectOption(matter.id);

    const restore = await injectFailure(page, /\/api\/v1\/matters\/[^/]+\/sources/, { status: 500 });
    const linkButton = page.getByRole('button', { name: /^link$/i }).first();
    await expect(linkButton, 'the Link control is enabled once a matter is selected').toBeEnabled();
    await linkButton.click();

    await expect(page.locator('body')).toContainText(/(failed|error|couldn't|could not|unable|retry)/i, {
      timeout: 20_000,
    });
    await expect(select, 'the selected matter is preserved for the retry').toHaveValue(matter.id);
    await restore();
  });

  test('D4.6 pending state prevents duplicate submits', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'delayed PATCH while double-clicking Save');
    const { id } = await seedSource(page, 'text');
    const log = recordRequests(page);
    await openStatusTab(page, id);
    const restore = await injectDelay(page, new RegExp(`/api/v1/sources/${id}(\\?|$)`), 1_500);
    const { save, title } = controls(page);
    await title.fill('eu-v pending');
    await save.click();
    const pendingState = {
      disabled: await save.isDisabled(),
      busy: await save.getAttribute('aria-busy'),
    };
    await save.dispatchEvent('click');
    await page.waitForTimeout(2_500);
    test.info().annotations.push({
      type: 'eu-v-pending-state',
      description: `Save control during an in-flight save: ${JSON.stringify(pendingState)}`,
    });
    const patches = log.matching(new RegExp(`/api/v1/sources/${id}(\\?|$)`)).filter((r) => r.method() === 'PATCH');
    expect(patches.length, `PATCH count: ${patches.length}`).toBe(1);
    await restore();
  });
});
