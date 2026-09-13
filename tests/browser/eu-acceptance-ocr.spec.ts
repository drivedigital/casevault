/**
 * EU-V — OCR enqueue feedback, bounded polling and real-worker completion
 * (contract §EU-D.5, cases D5.1–D5.12).
 *
 * PRODUCT acceptance cases, behaviour-first. Expected RED until the corrected
 * EU-D branch is integrated.
 *
 * Mode discipline (contract §Proof and safety):
 *   - D5.10–D5.12 are REAL_WORKER: a real RQ worker run, proven by the job
 *     result payload AND the committed database state.
 *   - D5.2–D5.9 use deterministic injected status sequences / transport
 *     failures, each labelled INJECTED_FAULT. They never stand in for
 *     real-worker proof.
 */
import { expect, test, type Page, type Route } from '@playwright/test';
import {
  apiGet,
  cancelJobWaits,
  declareMode,
  injectFailure,
  injectNetworkError,
  recordErrors,
  recordRequests,
  seedSource,
  sourceState,
  waitForJobResult,
} from './eu-acceptance-harness';

const POLL_ENDPOINT = /\/api\/v1\/sources\/[^/?]+$/;

async function openStatusTab(page: Page, id: string): Promise<void> {
  await page.goto(`/evidence/${id}`);
  await expect(page.getByRole('heading').first()).toBeVisible();
  await page.getByRole('button', { name: /^status$/i }).click();
}

function reprocessButton(page: Page) {
  return page.getByRole('button', { name: /reprocess/i }).first();
}

/** Serve a scripted ocr_status sequence for the polled source endpoint. */
async function scriptOcrStatus(page: Page, id: string, real: any, sequence: string[]): Promise<() => Promise<void>> {
  let index = 0;
  await page.route(POLL_ENDPOINT, async (route: Route) => {
    const request = route.request();
    if (request.method() !== 'GET') return route.continue();
    const value = sequence[Math.min(index, sequence.length - 1)];
    index += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...real, ocr_status: value, source_status: 'processed' }),
    });
  });
  return () => page.unroute(POLL_ENDPOINT);
}

test.describe('EU-D/D5 OCR enqueue feedback and polling', () => {
  test('D5.1 a 202 response is accepted, never "completed" [REAL_API]', async ({ page }) => {
    declareMode('REAL_API', 'real POST /reprocess response and immediate UI copy');
    const { id } = await seedSource(page, 'text');
    await openStatusTab(page, id);

    const responsePromise = page.waitForResponse(
      (response) => /\/api\/v1\/sources\/[^/]+\/reprocess$/.test(response.url()) && response.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await reprocessButton(page).click();
    const response = await responsePromise;
    expect(response.status(), 'POST /reprocess returns 202').toBe(202);

    const body = (await response.json()) as { queued?: boolean; job_id?: string | null; reason?: string | null };

    // Auto-retrying: the 202 arrives before React renders the confirmation.
    await expect(page.locator('body')).toContainText(/(accept|queued|requested|submitted|pending)/i, {
      timeout: 20_000,
    });
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text, 'a 202 must not claim extraction success').not.toMatch(/(extraction complete|ocr complete|completed successfully)/i);
    if (body.queued === false) {
      await expect(
        page.locator('body'),
        `queued:false shows the reason (${body.reason})`,
      ).toContainText(/(not queued|unavailable|reason|disabled)/i, { timeout: 20_000 });
    }
  });

  test('D5.2 queued:false shows the reason and starts no polling loop [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', '202 {queued:false} injected; poll counting is the assertion');
    const { id } = await seedSource(page, 'text');
    await openStatusTab(page, id);

    await page.route(/\/api\/v1\/sources\/[^/]+\/reprocess$/, (route) =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ queued: false, job_id: null, reason: 'worker unavailable (injected)' }),
      }),
    );
    const log = recordRequests(page);
    await reprocessButton(page).click();
    await expect(page.locator('body')).toContainText(/worker unavailable \(injected\)|not queued|unavailable/i, {
      timeout: 20_000,
    });
    log.reset();
    await page.waitForTimeout(12_000);

    const polls = log.matching(POLL_ENDPOINT).filter((r) => r.method() === 'GET');
    expect(polls.length, `polling after queued:false — ${polls.length} requests`).toBeLessThanOrEqual(2);
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text).not.toMatch(/(extraction complete|ocr complete)/i);
  });

  test('D5.3 queued:true polls the source endpoint at a bounded ~2s interval [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'scripted processing sequence; measures the poll interval');
    const { id } = await seedSource(page, 'text');
    const real = await apiGet<any>(page, `/api/v1/sources/${id}`);
    await openStatusTab(page, id);

    await page.route(/\/api\/v1\/sources\/[^/]+\/reprocess$/, (route) =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ queued: true, job_id: 'injected-job', reason: null }),
      }),
    );
    const restore = await scriptOcrStatus(page, id, real, ['processing', 'processing', 'processing']);
    const log = recordRequests(page);
    await reprocessButton(page).click();

    await expect
      .poll(() => log.matching(POLL_ENDPOINT).filter((r) => r.method() === 'GET').length, { timeout: 30_000 })
      .toBeGreaterThan(2);
    await restore();

    const times = log
      .matching(POLL_ENDPOINT)
      .filter((r) => r.method() === 'GET')
      .map((request) => request.timing().startTime)
      .sort((a, b) => a - b);
    const deltas = times.slice(1).map((value, index) => value - times[index]);
    test.info().annotations.push({
      type: 'eu-v-poll-deltas',
      description: `GET /sources/{id} deltas (ms): ${deltas.map((d) => Math.round(d)).join(',')}`,
    });

    // A tight loop is the defect. An immediate enqueue+verify burst is not, so
    // the bound is: at most 2 requests in any 1s window, and a sustained
    // interval of ~2s (median delta >= 900ms).
    const perSecond = new Map<number, number>();
    for (const t of times) {
      const bucket = Math.floor(t / 1000);
      perSecond.set(bucket, (perSecond.get(bucket) ?? 0) + 1);
    }
    const busiest = Math.max(0, ...perSecond.values());
    expect(busiest, `requests in the busiest 1s window: ${busiest}`).toBeLessThanOrEqual(2);

    const sorted = [...deltas].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    expect(median, `median poll interval: ${Math.round(median)}ms`).toBeGreaterThan(900);
  });

  test('D5.4/D5.5 terminal states stop polling and are labelled distinctly [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'scripted terminal sequences: complete, skipped, failed');
    for (const terminal of ['complete', 'skipped', 'failed']) {
      const { id } = await seedSource(page, 'text');
      const real = await apiGet<any>(page, `/api/v1/sources/${id}`);
      await openStatusTab(page, id);
      await page.route(/\/api\/v1\/sources\/[^/]+\/reprocess$/, (route) =>
        route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ queued: true, job_id: `injected-${terminal}`, reason: null }),
        }),
      );
      const restore = await scriptOcrStatus(page, id, real, ['processing', terminal]);
      const log = recordRequests(page);
      await reprocessButton(page).click();
      await expect
        .poll(() => (page.locator('body').innerText()), { timeout: 30_000 })
        .toMatch(new RegExp(terminal, 'i'));
      // One further request may be the poll already in flight when the terminal
      // status arrived; after that the watch must be silent.
      await page.waitForTimeout(3_000);
      log.reset();
      await page.waitForTimeout(8_000);
      const polls = log.matching(POLL_ENDPOINT).filter((r) => r.method() === 'GET');
      expect(polls.length, `${terminal}: polling stopped (${polls.length} requests in 8s after the tick)`).toBe(0);
      await restore();
      await page.unroute(/\/api\/v1\/sources\/[^/]+\/reprocess$/);
    }
  });

  test('D5.6 timeout stops automatic polling and offers manual refresh [INJECTED_FAULT]', async ({ page }) => {
    test.setTimeout(300_000);
    declareMode('INJECTED_FAULT', 'never-terminating processing; waits out the 120s budget');
    const { id } = await seedSource(page, 'pdf');
    const real = await apiGet<any>(page, `/api/v1/sources/${id}`);
    await openStatusTab(page, id);
    await page.route(/\/api\/v1\/sources\/[^/]+\/reprocess$/, (route) =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ queued: true, job_id: 'injected-timeout', reason: null }),
      }),
    );
    const restore = await scriptOcrStatus(page, id, real, ['processing']);
    const log = recordRequests(page);
    await reprocessButton(page).click();

    // Poll budget is 120s: after that no automatic request may remain.
    await page.waitForTimeout(135_000);
    log.reset();
    await page.waitForTimeout(12_000);
    const polls = log.matching(POLL_ENDPOINT).filter((r) => r.method() === 'GET');
    expect(polls.length, `polling after the budget: ${polls.length}`).toBe(0);

    const timeoutNote = page.locator('[data-testid=ocr-timeout]');
    await expect(timeoutNote, 'the timeout state is reported').toBeVisible({ timeout: 30_000 });
    await expect(timeoutNote).toContainText(/(still|not mean the job failed|stopped polling|refresh)/i);
    // The failure state must NOT be rendered: assert the failure copy itself,
    // not the sentence that explicitly denies a failure.
    await expect(page.locator('body')).not.toContainText(/the worker reported failure/i);
    await expect(page.locator('body')).not.toContainText(/OCR failed/i);
    await restore();
  });

  test('D5.7 polling is cancelled on navigation / source change [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'polling must stop for the abandoned source');
    const first = await seedSource(page, 'text');
    const real = await apiGet<any>(page, `/api/v1/sources/${first.id}`);
    await openStatusTab(page, first.id);
    await page.route(/\/api\/v1\/sources\/[^/]+\/reprocess$/, (route) =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ queued: true, job_id: 'injected-cancel', reason: null }),
      }),
    );
    const restore = await scriptOcrStatus(page, first.id, real, ['processing']);
    const log = recordRequests(page);
    await reprocessButton(page).click();
    await expect
      .poll(() => log.matching(new RegExp(`/api/v1/sources/${first.id}(\\?|$)`)).length, { timeout: 20_000 })
      .toBeGreaterThan(1);

    await page.goto('/evidence');
    log.reset();
    await page.waitForTimeout(10_000);
    const after = log.matching(new RegExp(`/api/v1/sources/${first.id}(\\?|$)`));
    expect(after.length, `polling continued after navigation: ${after.length}`).toBe(0);
    await restore();
  });

  test('D5.8 network errors during polling are visible [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'aborted poll request');
    const { id } = await seedSource(page, 'text');
    await openStatusTab(page, id);
    await page.route(/\/api\/v1\/sources\/[^/]+\/reprocess$/, (route) =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ queued: true, job_id: 'injected-network', reason: null }),
      }),
    );
    const restoreNetwork = await injectNetworkError(page, POLL_ENDPOINT);
    await reprocessButton(page).click();
    await expect(page.locator('body')).toContainText(/(failed|error|unavailable|offline|retry)/i, {
      timeout: 25_000,
    });
    await restoreNetwork();
  });

  test('D5.9 polling uses existing endpoints only [INJECTED_FAULT]', async ({ page }) => {
    declareMode('INJECTED_FAULT', 'no fabricated job-status endpoint may be polled');
    const { id } = await seedSource(page, 'text');
    const real = await apiGet<any>(page, `/api/v1/sources/${id}`);
    await openStatusTab(page, id);
    await page.route(/\/api\/v1\/sources\/[^/]+\/reprocess$/, (route) =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ queued: true, job_id: 'injected-endpoints', reason: null }),
      }),
    );
    const restore = await scriptOcrStatus(page, id, real, ['processing', 'processing']);
    const log = recordRequests(page);
    await reprocessButton(page).click();
    await page.waitForTimeout(10_000);

    const urls = log.all().map((request) => request.url());
    const jobStatusUrls = urls.filter((url) => /\/jobs?(\/|\?|$)|job-status|job_status/.test(url));
    expect(jobStatusUrls, `no fabricated job endpoint: ${jobStatusUrls.join(', ')}`).toEqual([]);
    const polled = urls.filter((url) => /\/api\/v1\/sources\/[^/?]+(\?|$)/.test(url));
    expect(polled.length, 'the source endpoint is polled').toBeGreaterThan(0);
    await restore();
  });
});

test.describe('EU-D/D5 real worker completion [REAL_WORKER]', () => {
  test.afterEach(() => cancelJobWaits());

  for (const kind of ['text', 'pdf', 'image'] as const) {
    test(`D5.10/D5.11 real worker run for ${kind}: result payload AND persisted state`, async ({ page }) => {
      test.setTimeout(120_000);
      declareMode('REAL_WORKER', 'real RQ worker; job result + committed rows, not merely queued');
      const { id } = await seedSource(page, kind);
      const expectedOutcome = kind === 'text' ? 'complete' : 'skipped';
      // Establish the upload's terminal state before explicit Reprocess. TXT
      // ingestion is inline; PDF/image may have an initial ingest worker job.
      await expect
        .poll(() => sourceState(id).ocr_status, { timeout: 30_000, intervals: [500, 1_000] })
        .toBe(expectedOutcome);
      await openStatusTab(page, id);

      for (const attempt of [1, 2]) {
        const responsePromise = page.waitForResponse(
          (response) =>
            /\/api\/v1\/sources\/[^/]+\/reprocess$/.test(response.url()) && response.request().method() === 'POST',
          { timeout: 60_000 },
        );
        await reprocessButton(page).click();
        const response = await responsePromise;
        expect(response.status(), `attempt ${attempt}: 202`).toBe(202);
        const body = (await response.json()) as { queued: boolean; job_id: string | null; reason: string | null };
        expect(body.queued, `attempt ${attempt}: job accepted (${JSON.stringify(body)})`).toBe(true);
        expect(body.job_id, 'a real job id is returned').toBeTruthy();

        const job = await waitForJobResult(String(body.job_id), 90_000);
        expect(job.status, `attempt ${attempt}: job status`).toMatch(/finished/i);
        expect(job.result, `attempt ${attempt}: decoded job result payload`).not.toBeNull();
        const result = job.result!;
        expect(result.job, `attempt ${attempt}: worker function`).toBe('ocr_source');
        expect(result.source_id, `attempt ${attempt}: exact source correlation`).toBe(id);
        expect(result.status, `attempt ${attempt}: payload status`).toBe('complete');
        expect(result.ocr_status, `attempt ${attempt}: OCR outcome`).toBe(expectedOutcome);
        expect(result.page_count, `attempt ${attempt}: payload page count`).toBe(kind === 'text' ? 1 : null);
        test.info().annotations.push({
          type: 'eu-v-job-payload',
          description: `${kind} attempt ${attempt}: job=${body.job_id} result=${JSON.stringify(result)}`,
        });

        await expect
          .poll(() => sourceState(id).ocr_status, { timeout: 30_000, intervals: [1_000] })
          .toBe(expectedOutcome);

        const state = sourceState(id);
        expect(state.ocr_status, `attempt ${attempt}: terminal ocr_status`).toBe(expectedOutcome);
        expect(state.pages ?? 0, `attempt ${attempt}: committed page rows`).toBe(kind === 'text' ? 1 : 0);
        if (kind === 'text') {
          expect(state.page_texts?.join('\n'), `attempt ${attempt}: expected synthetic text committed`).toContain(
            'CASEVAULT SYNTHETIC FIXTURE',
          );
        }
        await expect(page.locator('body')).toContainText(kind === 'text' ? /OCR complete/i : /OCR skipped/i);
        test.info().annotations.push({
          type: 'eu-v-real-worker',
          description: `${kind} attempt ${attempt}: job=${body.job_id} status=${job.status} ocr_status=${state.ocr_status} pages=${state.pages}`,
        });
      }
    });
  }

  test('D5.12 upload-time processing and explicit reprocess are separate proofs [REAL_WORKER]', async ({ page }) => {
    test.setTimeout(300_000);
    declareMode('REAL_WORKER', 'upload completes on its own; reprocess is proven separately');
    const { id } = await seedSource(page, 'text');
    const afterUpload = sourceState(id);
    expect(afterUpload.pages ?? 0, 'upload-time processing committed pages').toBeGreaterThan(0);

    await openStatusTab(page, id);
    const responsePromise = page.waitForResponse(
      (response) =>
        /\/api\/v1\/sources\/[^/]+\/reprocess$/.test(response.url()) && response.request().method() === 'POST',
      { timeout: 60_000 },
    );
    await reprocessButton(page).click();
    const response = await responsePromise;
    const body = (await response.json()) as { queued: boolean; job_id: string | null };

    if (body.queued && body.job_id) {
      const job = await waitForJobResult(body.job_id, 180_000);
      expect(job.result, 'the reprocess job has a decoded result independently of the upload').not.toBeNull();
      await expect
        .poll(() => sourceState(id).ocr_status, { timeout: 120_000, intervals: [2_000] })
        .toMatch(/complete|skipped/);
      expect(sourceState(id).pages ?? 0).toBeGreaterThan(0);
    }
  });
});

test('D5.13 no unhandled console errors during an OCR run [REAL_API]', async ({ page }) => {
  declareMode('REAL_API', 'console hygiene during polling and completion');
  const { id } = await seedSource(page, 'text');
  const { errors } = recordErrors(page);
  await openStatusTab(page, id);
  await reprocessButton(page).click();
  await page.waitForTimeout(15_000);
  expect(errors, `console/page errors: ${errors.join(' | ')}`).toEqual([]);
});
