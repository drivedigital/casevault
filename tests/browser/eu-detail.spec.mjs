// EU-D — evidence UI closure · BROWSER SPEC (Playwright).
// docs/contracts/evidence_ui_closure.md v1.0, detail-page acceptance §EU-D.1–6.
//
// LABELING (contract "Proof and safety" — say exactly what each assertion
// used): every test title carries its evidence class:
//   [real API]          — real API + real database behind the page; the only
//                         injected input is the synthetic upload itself.
//   [real API + worker] — additionally a real Redis + RQ worker consuming
//                         the queue (OCR queued:true paths).
//   [injected 503]      — deterministic transport failure injected with
//                         Playwright route interception (negative paths).
//   [injected sequence] — deterministic 202/status sequence injected for the
//                         polling budget/timeout path (cannot wait for a real
//                         2-minute worker stall).
// These injections do NOT replace real-worker proof (EU-V/EU-M own that).
//
// Tooling: this file intentionally has NO repository dependency on
// Playwright (the closure contract reserves test-tooling installation for
// EU-V). See tests/browser/eu-detail-README.md for the pinned, isolated
// install + exact run commands. Node >= 20.15 required (fixtures).
//
// Environment:
//   WEB_BASE_URL (default http://localhost:3000)
//   API_BASE_URL (default http://localhost:8100)

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { syntheticFixtures, sha256 } from "./eu-detail-fixtures.mjs";

const WEB = process.env.WEB_BASE_URL ?? "http://localhost:3000";
const API = process.env.API_BASE_URL ?? "http://localhost:8100";
const BASE = `${API}/api/v1`;

const fixtures = syntheticFixtures();

// ---------------------------------------------------------------- helpers --

async function apiUpload(fixture, { title, source_status } = {}) {
  const form = new FormData();
  form.append("file", new Blob([fixture.content], { type: fixture.contentType }), fixture.filename);
  form.append("title", title ?? `EU-D browser check ${Date.now()}`);
  if (source_status) form.append("source_status", source_status);
  const resp = await fetch(`${BASE}/sources`, { method: "POST", body: form });
  if (!resp.ok) throw new Error(`upload failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function apiCreateMatter(name) {
  const resp = await fetch(`${BASE}/matters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!resp.ok) throw new Error(`matter create failed: ${resp.status}`);
  return resp.json();
}

function randomUUID() {
  return crypto.randomUUID();
}

/** Counts GET /sources/{id} (exact URL) requests the page issues — the
 *  OCR watch loop polls exactly this URL. */
function sourceGetCounter(page, sourceId) {
  const state = { count: 0 };
  const url = `${WEB}/api/v1/sources/${sourceId}`;
  page.on("request", (request) => {
    if (request.url() === url && request.method() === "GET") state.count += 1;
  });
  return state;
}

function collectDownloads(context) {
  const downloads = [];
  context.on("download", (download) => downloads.push(download));
  return downloads;
}

async function gotoStatusTab(page, sourceId) {
  await page.goto(`${WEB}/evidence/${sourceId}`);
  await page.getByRole("button", { name: "Status", exact: true }).click();
  await expect(page.getByTestId("draft-title")).toBeVisible();
}

/** Triggers react-query's window-focus refetch path (this query-core version
 *  listens for visibilitychange on window; the synthetic event must bubble
 *  from the document to reach it) and resolves once a fresh GET of the
 *  source detail has been observed. */
async function triggerBackgroundRefetch(page, sourceId) {
  const refetched = page.waitForRequest(
    (request) =>
      request.url() === `${WEB}/api/v1/sources/${sourceId}` && request.method() === "GET",
    { timeout: 10_000 },
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true })),
  );
  await refetched;
}

/** True when the browser under test can render PDFs inline. */
async function pdfViewerEnabled(page) {
  return page.evaluate(() => navigator.pdfViewerEnabled === true);
}

// Mode detection: is a real Redis + worker consuming reprocess jobs?
let workerMode = null;
test.beforeAll(async () => {
  const probe = await apiUpload(fixtures.text, { title: "EU-D mode probe" });
  const resp = await fetch(`${BASE}/sources/${probe.id}/reprocess`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stages: ["ocr"] }),
  });
  const body = await resp.json();
  if (!body.queued) {
    workerMode = false;
    return;
  }
  // queued:true — wait up to 20s for a worker to move ocr_status off "queued".
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const source = await (await fetch(`${BASE}/sources/${probe.id}`)).json();
    if (source.ocr_status !== "queued") {
      workerMode = true;
      return;
    }
  }
  workerMode = false; // redis up but nothing consumes: treat as workerless
});

// Run with --workers=1 (see eu-detail-README.md): the tests share one API
// and one worker, and request counting per page must not overlap.

// ------------------------------------------------- §EU-D.2/3: downloads ---

test("pdf: page load triggers NO download; Download original is byte-exact [real API]", async ({ page, context }) => {
  test.skip(workerMode === null, "mode detection failed");
  const downloads = collectDownloads(context);
  const source = await apiUpload(fixtures.pdf, { title: "EU-D pdf no-download check" });
  await page.goto(`${WEB}/evidence/${source.id}`);

  await expect(page.getByTestId("viewer-pdf")).toBeVisible();
  // The preview is never eager: either the opt-in button, or — in browsers
  // without a built-in PDF viewer — the labeled fallback without any fetch.
  const canPreview = await pdfViewerEnabled(page);
  if (canPreview) {
    await expect(page.getByTestId("load-preview")).toBeVisible();
  } else {
    await expect(page.getByTestId("preview-unsupported")).toBeVisible();
  }

  // Regression for the old <iframe src="/api/v1/sources/{id}/file"> viewer:
  // that URL is served with Content-Disposition: attachment, so loading the
  // page used to trigger a download. Wait long enough for any eager fetch.
  await page.waitForTimeout(2500);
  expect(downloads, "no download may be triggered by page load").toHaveLength(0);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-original").first().click(),
  ]);
  expect(download.suggestedFilename()).toBe(fixtures.pdf.filename);
  const path = `/tmp/eu-d-download-${Date.now()}.pdf`;
  await download.saveAs(path);
  const bytes = readFileSync(path);
  expect(sha256(bytes)).toBe(fixtures.pdf.sha256); // browser byte-equality proof
  expect(downloads).toHaveLength(1);
});

test("pdf: preview is opt-in and safe — blob iframe (or labeled fallback), never a download [real API]", async ({ page, context }) => {
  const downloads = collectDownloads(context);
  const source = await apiUpload(fixtures.pdf, { title: "EU-D pdf preview check" });
  await page.goto(`${WEB}/evidence/${source.id}`);
  const canPreview = await pdfViewerEnabled(page);
  console.log(
    `[report] navigator.pdfViewerEnabled = ${canPreview} (${canPreview ? "inline preview expected" : "labeled fallback expected — this browser cannot render PDFs inline"})`,
  );

  if (!canPreview) {
    // Honest fallback path: no preview button, no fetch, no download — the
    // user is told inline display is unavailable and offered the download.
    await expect(page.getByTestId("preview-unsupported")).toBeVisible();
    await expect(page.getByTestId("preview-unsupported")).toContainText("no built-in PDF viewer");
    await expect(page.getByTestId("load-preview")).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(downloads).toHaveLength(0);
    return;
  }

  await page.getByTestId("load-preview").click();
  await expect(page.getByTestId("preview-loading")).toBeVisible();
  const iframe = page.locator('[data-testid="preview-ready"] iframe');
  await expect(iframe).toBeVisible({ timeout: 15_000 });
  const src = await iframe.getAttribute("src");
  expect(src?.startsWith("blob:")).toBe(true); // controlled fetch, not the attachment URL
  expect(src?.includes("/api/v1/")).toBe(false);

  await page.waitForTimeout(2000);
  expect(downloads, "loading the preview must not download anything").toHaveLength(0);

  // Honest renderer report: same-origin blob frame is inspectable. Chromium's
  // built-in PDF viewer plants an <embed>; absence means the browser fell
  // back to nothing — which the UI labels via the fallback hint either way.
  const frameReport = await iframe.evaluate((node) => {
    try {
      const doc = node.contentDocument;
      return { accessible: true, hasEmbed: !!doc?.querySelector("embed"), bodyLength: doc?.body?.innerHTML.length ?? 0 };
    } catch {
      return { accessible: false };
    }
  });
  console.log(`[report] PDF renderer: ${JSON.stringify(frameReport)}`);

  // Dismiss returns to the opt-in state.
  await page.getByRole("button", { name: "Close preview" }).click();
  await expect(page.getByTestId("load-preview")).toBeVisible();
});

test("image: <img> renders without a download; Download original is byte-exact [real API]", async ({ page, context }) => {
  const downloads = collectDownloads(context);
  const source = await apiUpload(fixtures.image, { title: "EU-D image no-download check" });
  await page.goto(`${WEB}/evidence/${source.id}`);

  const img = page.getByTestId("viewer-image-img");
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("src", `/api/v1/sources/${source.id}/file`);
  await page.waitForTimeout(2000);
  expect(downloads, "embedded images must not trigger the attachment endpoint's download").toHaveLength(0);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-original").first().click(),
  ]);
  expect(download.suggestedFilename()).toBe(fixtures.image.filename);
  const path = `/tmp/eu-d-download-${Date.now()}.png`;
  await download.saveAs(path);
  expect(sha256(readFileSync(path))).toBe(fixtures.image.sha256);
});

test("pages: honest empty (pdf, no OCR engine) vs inline-ingested text [real API]", async ({ page }) => {
  // Text-like sources ingest their page inline at upload (no worker
  // round-trip) — the extracted text is on the page immediately.
  const textSource = await apiUpload(fixtures.text, { title: "EU-D text inline check" });
  await page.goto(`${WEB}/evidence/${textSource.id}`);
  await expect(page.getByTestId("viewer-text")).toBeVisible();
  await expect(page.getByTestId("viewer-text")).toContainText("CASEVAULT SYNTHETIC FIXTURE");

  // A PDF has no pages until real OCR runs (this build stub-skips it), so
  // "No pages extracted yet" is the honest empty state — clearly stated,
  // not a silent failure.
  const pdfSource = await apiUpload(fixtures.pdf, { title: "EU-D pdf empty pages check" });
  await page.goto(`${WEB}/evidence/${pdfSource.id}`);
  await page.getByRole("button", { name: "OCR", exact: true }).click();
  await expect(page.getByTestId("ocr-tab")).toContainText("No pages extracted yet");
  await expect(page.getByTestId("ocr-tab").getByTestId("error-note")).toHaveCount(0);
});

// ---------------------------------------------------- §EU-D.1: drafts -----

test("status drafts: direct Status entry initializes from server; dirty edits survive a background refetch; save reconciles [real API]", async ({ page }) => {
  const source = await apiUpload(fixtures.text, {
    title: "Draft check one",
    source_status: "primary",
  });

  // Direct entry to Status (NOT via Edit) must show the server values.
  await gotoStatusTab(page, source.id);
  await expect(page.getByTestId("draft-title")).toHaveValue("Draft check one");
  await expect(page.getByTestId("draft-status")).toHaveValue("primary");

  // Dirty edit, then force a background refetch (react-query window focus
  // path: this query-core version refetches on visibilitychange).
  await page.getByTestId("draft-title").fill("Draft check one v2");
  await expect(page.getByTestId("dirty-indicator")).toBeVisible();
  await triggerBackgroundRefetch(page, source.id);
  await expect(page.getByTestId("draft-title"), "refetch must not erase dirty drafts").toHaveValue("Draft check one v2");
  await expect(page.getByTestId("dirty-indicator")).toBeVisible();

  // Save: success reconciles drafts + cache (header shows the new title).
  await page.getByTestId("save-source").click();
  await expect(page.getByTestId("save-ok")).toBeVisible();
  await expect(page.getByTestId("draft-title")).toHaveValue("Draft check one v2");
  await expect(page.getByTestId("dirty-indicator")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Draft check one v2");

  // Never submit an invalid draft: empty title disables Save with a reason.
  await page.getByTestId("draft-title").fill("");
  await expect(page.getByTestId("save-source")).toBeDisabled();
  await expect(page.getByTestId("invalid-draft")).toBeVisible();
});

test("status drafts: navigating to another source resets them [real API]", async ({ page }) => {
  const first = await apiUpload(fixtures.text, { title: "First source", source_status: "derived" });
  const second = await apiUpload(fixtures.text, { title: "Second source", source_status: "testimony" });

  // Dirty the first source, then navigate away.
  await gotoStatusTab(page, first.id);
  await page.getByTestId("draft-title").fill("dirty edits on the first source");
  await expect(page.getByTestId("dirty-indicator")).toBeVisible();

  await page.goto(`${WEB}/evidence/${second.id}`);
  await page.getByRole("button", { name: "Status", exact: true }).click();
  await expect(page.getByTestId("draft-title"), "navigation must reset drafts").toHaveValue("Second source");
  await expect(page.getByTestId("draft-status")).toHaveValue("testimony");
  await expect(page.getByTestId("dirty-indicator")).toBeHidden();

  // ...and back: the first source shows its own server value, not the draft.
  await page.goto(`${WEB}/evidence/${first.id}`);
  await page.getByRole("button", { name: "Status", exact: true }).click();
  await expect(page.getByTestId("draft-title")).toHaveValue("First source");
  await expect(page.getByTestId("dirty-indicator")).toBeHidden();
});

test("save failure keeps the input and shows the server reason [injected 503]", async ({ page }) => {
  const source = await apiUpload(fixtures.text, { title: "Save failure check" });
  await gotoStatusTab(page, source.id);
  await page.getByTestId("draft-title").fill("Save failure check v2");

  // PATCH fails deterministically with a server-shaped reason.
  await page.route(`**/api/v1/sources/${source.id}`, (route) => {
    if (route.request().method() === "PATCH") {
      return route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Title rejected by injected check" }),
      });
    }
    return route.continue();
  });

  await page.getByTestId("save-source").click();
  const errorNote = page.getByTestId("error-note").filter({ hasText: "Save failed" });
  await expect(errorNote).toBeVisible();
  await expect(errorNote).toContainText("Title rejected by injected check");
  await expect(page.getByTestId("draft-title"), "failed save must retain input").toHaveValue("Save failure check v2");
  await expect(page.getByTestId("dirty-indicator")).toBeVisible();
});

// ------------------------------------------- §EU-D.4: distinct failures ----

test("missing source: 404 renders a distinct error, not a false empty page [real API]", async ({ page }) => {
  await page.goto(`${WEB}/evidence/${randomUUID()}`);
  const note = page.getByTestId("error-note");
  await expect(note).toBeVisible();
  await expect(note).toContainText("Source not found");
  await expect(note).toContainText("This is a load failure, not an empty source");
  await expect(note.getByRole("button", { name: "Retry" })).toBeVisible();
  // No viewer/tabs: an unavailable source must not look healthy.
  await expect(page.getByTestId("viewer-text")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Metadata" })).toHaveCount(0);
});

test("API unreachable: network error with retry that recovers [injected transport]", async ({ page }) => {
  const source = await apiUpload(fixtures.text, { title: "Transport failure check" });
  await page.route("**/api/v1/**", (route) => route.abort());
  await page.goto(`${WEB}/evidence/${source.id}`);
  const note = page.getByTestId("error-note");
  await expect(note).toBeVisible();
  await expect(note).toContainText("Couldn't load source");
  await expect(note).toContainText("Network error");

  await page.unroute("**/api/v1/**");
  await note.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("viewer-text")).toBeVisible({ timeout: 15_000 });
});

test("failed source refetch keeps the loaded page labeled as stale, not a false breakage [injected transport]", async ({ page }) => {
  const source = await apiUpload(fixtures.text, { title: "Stale source check" });
  await page.goto(`${WEB}/evidence/${source.id}`);
  await expect(page.getByTestId("viewer-text")).toBeVisible();

  // Cut only the exact source-detail URL; a background refetch now fails.
  await page.route(`**/api/v1/sources/${source.id}`, (route) => route.abort());
  await triggerBackgroundRefetch(page, source.id).catch(() => {
    /* the refetch itself is expected to fail — that is the scenario */
  });

  const stale = page.getByTestId("source-stale");
  await expect(stale).toBeVisible({ timeout: 10_000 });
  await expect(stale).toContainText("showing the last loaded version");
  // The page itself stays functional (no false broken view), with a retry.
  await expect(page.getByTestId("viewer-text")).toBeVisible();
  await expect(stale.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("pages query failure is an error with retry, never 'no pages' [injected 503]", async ({ page }) => {
  const source = await apiUpload(fixtures.text, { title: "Pages failure check" });
  await page.route(
    "**/api/v1/sources/*/pages",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "pages backend unavailable (injected)" }),
      }),
  );
  await page.goto(`${WEB}/evidence/${source.id}`);

  // Viewer: text source with a failed pages query must not claim "no text".
  await expect(page.getByTestId("viewer-text")).toBeVisible();
  await expect(page.getByTestId("viewer-text")).toContainText("Couldn't load extracted text");
  await expect(page.getByTestId("viewer-text")).not.toContainText("No extracted text yet");

  // OCR tab: the same failure is distinct from an honest empty list.
  await page.getByRole("button", { name: "OCR", exact: true }).click();
  const note = page.getByTestId("ocr-tab").getByTestId("error-note");
  await expect(note).toBeVisible();
  await expect(note).toContainText("Couldn't load pages");
  await expect(note).toContainText("pages backend unavailable (injected)");
  await expect(note).toContainText('not "no pages extracted"');
});

test("matter-list failures never look like 'no linked matters' [injected 503]", async ({ page }) => {
  const source = await apiUpload(fixtures.text, { title: "Matters failure check" });
  await page.route(
    "**/api/v1/sources/*/matters",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "links backend unavailable (injected)" }),
      }),
  );
  await page.route(
    "**/api/v1/matters",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "matters backend unavailable (injected)" }),
      }),
  );
  await page.goto(`${WEB}/evidence/${source.id}`);
  await page.getByRole("button", { name: "Matters", exact: true }).click();

  const panel = page.getByTestId("matters-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("error-note").filter({ hasText: "Couldn't load linked matters" })).toBeVisible();
  await expect(panel).not.toContainText("Not linked to any matter.");
  await expect(panel.getByTestId("error-note").filter({ hasText: "Couldn't load matters to link" })).toBeVisible();
  await expect(panel).toContainText("Matters list unavailable");
});

test("link/unlink: success, duplicate 409 feedback, unlink failure; retry preserves selection [real API + injected 503]", async ({ page }) => {
  const source = await apiUpload(fixtures.text, { title: "Link flow check" });
  const matterA = await apiCreateMatter(`EU-D link A ${Date.now()}`);
  const matterB = await apiCreateMatter(`EU-D link B ${Date.now()}`);

  await page.goto(`${WEB}/evidence/${source.id}`);
  await page.getByRole("button", { name: "Matters", exact: true }).click();
  const panel = page.getByTestId("matters-panel");

  // Successful link shows up in the list.
  await page.getByTestId("link-matter-select").selectOption(matterA.id);
  await page.getByTestId("link-matter-button").click();
  await expect(panel.getByRole("link", { name: matterA.name })).toBeVisible();
  await expect(page.getByTestId("link-ok")).toBeVisible();

  // Duplicate link: real 409, distinct feedback, selection preserved for retry.
  await page.getByTestId("link-matter-select").selectOption(matterA.id);
  await page.getByTestId("link-matter-button").click();
  const dupError = panel.getByTestId("error-note").filter({ hasText: "Link failed" });
  await expect(dupError).toBeVisible();
  await expect(dupError).toContainText("already linked");
  // The selection is still matterA (preserved for retry); switching to B succeeds.
  await expect(page.getByTestId("link-matter-select")).toHaveValue(matterA.id);
  await page.getByTestId("link-matter-select").selectOption(matterB.id);
  await page.getByTestId("link-matter-button").click();
  await expect(panel.getByRole("link", { name: matterB.name })).toBeVisible();

  // Unlink failure: injected 503 — the row stays and the error is visible.
  await page.route(
    "**/api/v1/source-matter-links/*",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "unlink backend unavailable (injected)" }),
      }),
  );
  await panel.getByRole("button", { name: "Unlink" }).first().click();
  const unlinkError = panel.getByTestId("error-note").filter({ hasText: "Unlink failed" });
  await expect(unlinkError).toBeVisible();
  await expect(unlinkError).toContainText("unlink backend unavailable (injected)");

  // Recovery: real unlink works after the injection is removed.
  await page.unroute("**/api/v1/source-matter-links/*");
  await panel.getByRole("button", { name: "Unlink" }).first().click();
  // matterA leaves the linked list (the select's option legitimately remains).
  await expect(panel.getByRole("link", { name: matterA.name })).toHaveCount(0);
  await expect(panel.getByRole("link", { name: matterB.name })).toHaveCount(1);
});

// ----------------------------------------------- §EU-D.5: OCR feedback ----

test("ocr queued:false shows the reason and starts NO polling loop [real API, no worker]", async ({ page }) => {
  test.skip(workerMode === true, "requires the no-worker path (queued:false); with a worker this scenario is unreachable");
  const source = await apiUpload(fixtures.text, { title: "OCR not-queued check" });
  const counter = sourceGetCounter(page, source.id);
  await gotoStatusTab(page, source.id);

  await page.getByTestId("reprocess-ocr").click();
  const notQueued = page.getByTestId("ocr-not-queued");
  await expect(notQueued).toBeVisible();
  await expect(notQueued).toContainText("Reason:");
  // No success claim anywhere.
  await expect(page.getByTestId("ocr-accepted")).toHaveCount(0);
  await expect(page.getByTestId("ocr-done")).toHaveCount(0);

  // The only follow-up GET is the post-202 invalidation refresh — no loop.
  await page.waitForTimeout(1500);
  const baseline = counter.count;
  await page.waitForTimeout(5000);
  expect(counter.count - baseline, "queued:false must not start a polling loop").toBeLessThanOrEqual(1);
});

test("ocr queued:true: accepted ≠ completed, watching, terminal complete, pages refreshed [real API + worker]", async ({ page }) => {
  test.skip(workerMode === false, "requires real Redis + RQ worker (queued:true)");
  const source = await apiUpload(fixtures.text, { title: "OCR complete check" });
  const counter = sourceGetCounter(page, source.id);
  await gotoStatusTab(page, source.id);

  await page.getByTestId("reprocess-ocr").click();
  const accepted = page.getByTestId("ocr-accepted");
  await expect(accepted).toBeVisible();
  await expect(accepted).toContainText("accepted");
  await expect(page.getByTestId("ocr-watching")).toBeVisible({ timeout: 10_000 });

  const done = page.getByTestId("ocr-done");
  await expect(done).toBeVisible({ timeout: 30_000 });
  await expect(done).toContainText("Extraction finished successfully");
  await expect(page.getByTestId("success-note").getByText("OCR complete")).toBeVisible(); // note title
  expect(counter.count, "the watch loop polled the persisted source status").toBeGreaterThanOrEqual(2);

  // Terminal refresh: the extracted text is now on the page.
  await page.getByRole("button", { name: "OCR", exact: true }).click();
  await expect(page.getByTestId("ocr-tab")).toContainText("CASEVAULT SYNTHETIC FIXTURE", { timeout: 10_000 });

  // Polling stopped at terminal state.
  const baseline = counter.count;
  await page.waitForTimeout(5000);
  expect(counter.count - baseline).toBe(0);
});

test("ocr on a PDF ends in a valid terminal 'skipped' (worker stub), not success [real API + worker]", async ({ page }) => {
  test.skip(workerMode === false, "requires real Redis + RQ worker (queued:true)");
  const source = await apiUpload(fixtures.pdf, { title: "OCR skipped check" });
  await gotoStatusTab(page, source.id);

  await page.getByTestId("reprocess-ocr").click();
  await expect(page.getByTestId("ocr-accepted")).toBeVisible();
  const done = page.getByTestId("ocr-done");
  await expect(done).toBeVisible({ timeout: 30_000 });
  await expect(done).toContainText("worker skipped OCR for this file type");
  await expect(done).toContainText("not a success and not an error");
  await expect(page.getByText("OCR skipped — no extraction performed")).toBeVisible(); // note title
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); // page still healthy
});

test("ocr watch: network errors during polling are visible [injected transport]", async ({ page }) => {
  const source = await apiUpload(fixtures.text, { title: "OCR network error check" });
  await gotoStatusTab(page, source.id);

  // Load the page first, then cut the exact status URL the poll loop uses.
  await page.route(
    `**/api/v1/sources/${source.id}/reprocess`,
    (route) =>
      route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ queued: true, job_id: "injected-netfail-job", reason: null }),
      }),
  );
  await page.route(`**/api/v1/sources/${source.id}`, (route) => route.abort());

  await page.getByTestId("reprocess-ocr").click();
  await expect(page.getByTestId("ocr-accepted")).toBeVisible();
  const watchError = page.getByTestId("ocr-watch-error");
  await expect(watchError).toBeVisible({ timeout: 15_000 });
  await expect(watchError).toContainText("Still watching");
});

test("ocr watch: bounded polling stops after the 120s budget with 'still unconfirmed', not failure [injected sequence]", async ({ page }) => {
  test.setTimeout(200_000);
  const source = await apiUpload(fixtures.text, { title: "OCR timeout check" });
  const counter = sourceGetCounter(page, source.id);

  // The reprocess POST succeeds with queued:true, but the source status is
  // frozen at "queued" — the job never terminates within the budget.
  await page.route(
    `**/api/v1/sources/${source.id}/reprocess`,
    (route) =>
      route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ queued: true, job_id: "injected-timeout-job", reason: null }),
      }),
  );
  const canned = await (await fetch(`${BASE}/sources/${source.id}`)).json();
  canned.ocr_status = "queued";
  canned.processing_status = "complete";
  await page.route(
    `**/api/v1/sources/${source.id}`,
    (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(canned) }),
  );

  await gotoStatusTab(page, source.id);
  await page.getByTestId("reprocess-ocr").click();
  await expect(page.getByTestId("ocr-accepted")).toBeVisible();
  await expect(page.getByTestId("ocr-watching")).toBeVisible();

  // Poll cadence ≈ every 2s: at least a handful of status checks in 10s.
  await page.waitForTimeout(10_000);
  expect(counter.count, "watch loop polls roughly every 2s").toBeGreaterThanOrEqual(4);

  // Budget (120s from watch start) → timeout note; never a failure claim.
  const timeoutNote = page.getByTestId("ocr-timeout");
  await expect(timeoutNote).toBeVisible({ timeout: 130_000 });
  await expect(timeoutNote).toContainText("stopped polling");
  await expect(timeoutNote).toContainText("does not mean the job failed");
  await expect(page.getByTestId("ocr-done")).toHaveCount(0);

  // Automatic polling actually stopped.
  const baseline = counter.count;
  await page.waitForTimeout(6000);
  expect(counter.count - baseline).toBe(0);
});

// --------------------------------------------- §EU-D.3: preview failure ----

test("pdf preview failure is labeled with a download fallback [injected 503]", async ({ page }) => {
  const source = await apiUpload(fixtures.pdf, { title: "Preview failure check" });
  await page.goto(`${WEB}/evidence/${source.id}`);
  const canPreview = await pdfViewerEnabled(page);
  test.skip(!canPreview, "this browser cannot render PDFs inline — the preview path is unreachable (covered by the labeled-fallback test)");
  await page.route(
    "**/api/v1/sources/*/file",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "file backend unavailable (injected)" }),
      }),
  );
  await page.getByTestId("load-preview").click();
  const note = page.getByTestId("error-note").filter({ hasText: "Preview failed" });
  await expect(note).toBeVisible({ timeout: 15_000 });
  await expect(note).toContainText("file backend unavailable (injected)");
  // Fallback offer is present (its click would hit the same injected failure).
  await expect(page.getByTestId("download-original")).toHaveCount(2); // header + fallback
});
