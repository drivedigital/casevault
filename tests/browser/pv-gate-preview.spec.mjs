// PV-GATE — independent, bounded owner-preview verification (Playwright).
// Assignment: handoff/kickoff/PV-GATE.md. Product under test: the integration
// checkpoint a040e9f739ec3741cd28ee99756d256ea8b78d43 (product paths; later
// integration commits are documentation only — verified in handoff/notes/PV-GATE.md).
//
// THREE focused tests, deliberately not a repeat of the EU-D/EU-L/EU-V suites:
//   1. real-browser uploads -> detail open (no unexpected download) -> explicit
//      byte-exact download of each original;
//   2. Reprocess OCR clicked TWICE per file type with the full correlation
//      202 {queued, job_id} -> rq-decoded job result -> exact-ID SQL/pages ->
//      visible UI outcome;
//   3. minimal Status edit/save + reload persistence + return-to-list smoke.
//
// EVIDENCE CLASSES (stated per test title):
//   [real API]            — FastAPI + Postgres behind the page.
//   [real worker]         — real Redis + real RQ worker consuming the queue.
//   [SQL/RQ ground truth] — direct reads used ONLY to correlate: the RQ payload
//                           is decoded with rq's own Job.fetch/get_status/result
//                           and the rows come from the same disposable DB.
//   [browser]             — a real headless Chromium (see the honest native PDF
//                           capability note in test 1) driving the real Next.js
//                           dev server, which proxies RELATIVE /api/v1 URLs.
//
// Nothing is mocked or injected: no route interception, no fake clock, no
// forced navigator.pdfViewerEnabled. Fixtures are synthetic and byte-unique per
// run (shared EU-D fixture bytes + a run marker), so "downloaded bytes ==
// uploaded bytes" is an exact per-run claim.
//
// Environment (no real defaults for the ground-truth layer):
//   WEB_BASE_URL            default http://localhost:3000 (web origin; also the
//                           API proxy origin — the browser only uses relative URLs)
//   PV_GATE_DATABASE_URL    REQUIRED: the disposable PV-GATE database
//   PV_GATE_REDIS_URL       REQUIRED: the disposable PV-GATE redis
//   PV_GATE_RUN_STAMP       optional run id (default: timestamp)
//   PV_GATE_DOWNLOAD_DIR    default /tmp/pv-gate-downloads
//   PV_GATE_PYTHON          default <repo>/.venv/bin/python
//
// Run: see handoff/notes/PV-GATE.md (isolated pinned Playwright 1.63 tooling).

import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { crc32 } from "node:zlib";
import { syntheticFixtures } from "./eu-detail-fixtures.mjs";
import { decodeRqJob, sqlSourceState } from "./pv-gate-bridge.mjs";

const DOWNLOAD_DIR = process.env.PV_GATE_DOWNLOAD_DIR ?? "/tmp/pv-gate-downloads";
const RUN = process.env.PV_GATE_RUN_STAMP ?? `${Date.now()}`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OCR_JOB_TIMEOUT_MS = Number(process.env.PV_GATE_OCR_TIMEOUT_MS ?? 60_000);

test.beforeAll(() => {
  // Raw synthetic bytes stay outside the repository.
  mkdirSync(DOWNLOAD_DIR, { recursive: true });
});

// --------------------------------------------------------------- fixtures --

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Insert a real PNG tEXt ancillary chunk before IEND (keeps the file a valid
 *  PNG) so each run's bytes — and therefore its sha256 — are unique. */
function pngWithTextChunk(png, keyword, value) {
  const data = Buffer.from(`${keyword}\u0000${value}`, "latin1");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const type = Buffer.from("tEXt", "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])) >>> 0, 0);
  const chunk = Buffer.concat([length, type, data, crc]);
  const iendOffset = png.length - 12; // trailing IEND chunk = 4 len + 4 type + 4 crc
  return Buffer.concat([png.subarray(0, iendOffset), chunk, png.subarray(iendOffset)]);
}

/**
 * Unique-per-run variants of the shared (unmodified) EU-D synthetic fixtures:
 * a visible run line for TXT, a trailing PDF comment after %%EOF and a PNG
 * tEXt chunk. Same underlying synthetic bytes, unique sha256 per run, so the
 * upload cannot be mistaken for (or deduplicated against) an earlier run.
 */
function runFixture(tag) {
  const base = syntheticFixtures();
  const stamp = `PV-GATE ${tag} ${RUN}`;
  const text = Buffer.concat([base.text.content, Buffer.from(`\r\n${stamp}\r\n`, "utf8")]);
  const pdf = Buffer.concat([base.pdf.content, Buffer.from(`% ${stamp}\n`, "latin1")]);
  const png = pngWithTextChunk(base.image.content, "Comment", stamp);
  const entry = (bytes, name, mime) => ({
    name,
    mime,
    bytes,
    size: bytes.length,
    sha256: sha256Hex(bytes),
  });
  return {
    tag,
    txt: entry(text, `pv-gate-${RUN}-${tag}-text.txt`, "text/plain"),
    pdf: entry(pdf, `pv-gate-${RUN}-${tag}-document.pdf`, "application/pdf"),
    png: entry(png, `pv-gate-${RUN}-${tag}-image.png`, "image/png"),
  };
}

// ---------------------------------------------------------------- helpers --

/** Upload one synthetic file through the upload control the page renders.
 *  The request is the product's own upload path (relative URL through the web
 *  proxy); the response body is the ACTUAL source the server created. */
async function uploadThroughUi(page, fixture) {
  await page.goto("/evidence");
  await expect(page.getByTestId("upload-zone")).toBeVisible();
  const input = page.locator('input[type="file"]');
  await expect(input).toHaveCount(1);

  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/v1/sources" && r.request().method() === "POST",
      { timeout: 30_000 },
    ),
    input.setInputFiles({ name: fixture.name, mimeType: fixture.mime, buffer: fixture.bytes }),
  ]);
  expect(response.status(), "upload status").toBe(201);
  const body = await response.json();

  expect(body.id).toMatch(UUID_RE);
  expect(body.original_filename).toBe(fixture.name);
  expect(body.sha256, "server-recorded upload sha256").toBe(fixture.sha256);
  expect(body.file_size_bytes).toBe(fixture.size);

  await expect(page.getByTestId("upload-success")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(`a[href="/evidence/${body.id}"]`)).toBeVisible({ timeout: 30_000 });
  return { body, fixture };
}

/** GET /sources from INSIDE the page, via the relative proxy URL. */
async function inPageListSources(page) {
  return page.evaluate(async () => {
    const resp = await fetch("/api/v1/sources", { headers: { Accept: "application/json" } });
    if (!resp.ok) throw new Error(`relative GET /api/v1/sources -> ${resp.status}`);
    return resp.json();
  });
}

async function inPageGetSource(page, id) {
  return page.evaluate(async (sourceId) => {
    const resp = await fetch(`/api/v1/sources/${sourceId}`, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) throw new Error(`relative GET /api/v1/sources/${sourceId} -> ${resp.status}`);
    return resp.json();
  }, id);
}

/** Wait (bounded) until the source leaves queued/processing, or fail loudly. */
async function waitForSettledSource(page, id, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await inPageGetSource(page, id);
    if (!["queued", "processing"].includes(last.processing_status)) return last;
    await page.waitForTimeout(500);
  }
  throw new Error(
    `UNCONFIRMED: source ${id} never settled within ${timeoutMs}ms ` +
      `(last processing_status=${last?.processing_status}, ocr_status=${last?.ocr_status})`,
  );
}

async function openStatusTab(page, id) {
  await page.goto(`/evidence/${id}`);
  await expect(page.locator("h1")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Status", exact: true }).click();
  await expect(page.getByTestId("reprocess-ocr")).toBeEnabled({ timeout: 30_000 });
}

/** The visible server-state line of the Status tab ("processing: X, OCR: Y"). */
async function visibleServerState(page) {
  const text = await page
    .locator("p", { hasText: "Current server state" })
    .first()
    .innerText();
  return text.replace(/\s+/g, " ").trim();
}

/**
 * ONE explicit "Reprocess OCR" click; returns the real 202 body. The caller
 * must wait for a terminal state before clicking again — this helper never
 * retries and never re-enqueues on its own.
 */
async function clickReprocessOcr(page, sourceId) {
  const button = page.getByTestId("reprocess-ocr");
  await expect(button).toBeEnabled();
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/v1/sources/${sourceId}/reprocess` &&
        r.request().method() === "POST",
      { timeout: 30_000 },
    ),
    button.click(),
  ]);
  const body = await response.json().catch(() => null);
  return { status: response.status(), body };
}

// =========================================================== test 1: files ==

test("PV-GATE 1 — real-browser upload, detail open without download, explicit byte-exact download [real API + real worker + real browser]", async ({
  page,
}) => {
  const fx = runFixture("uploads");
  const downloads = [];
  page.on("download", (d) =>
    downloads.push({ name: d.suggestedFilename(), when: new Date().toISOString() }),
  );

  const uploaded = [];
  for (const fixture of [fx.txt, fx.pdf, fx.png]) {
    uploaded.push(await uploadThroughUi(page, fixture));
  }
  const byName = Object.fromEntries(uploaded.map((u) => [u.fixture.name, u]));

  // --- ground truth: the IDs we captured are the rows that were created ------
  const list = await inPageListSources(page);
  for (const fixture of [fx.txt, fx.pdf, fx.png]) {
    const up = byName[fixture.name];
    const row = list.find((s) => s.id === up.body.id);
    expect(row, `GET /sources contains ${fixture.name}`).toBeTruthy();
    expect(row.original_filename).toBe(fixture.name);
    expect(row.sha256).toBe(fixture.sha256);
    expect(row.file_size_bytes).toBe(fixture.size);

    const state = sqlSourceState(up.body.id);
    expect(state.source.sha256, "SQL sha256 == fixture sha256").toBe(fixture.sha256);
    expect(state.source.file_size_bytes).toBe(fixture.size);
    expect(state.stored_file.sha256, "bytes on disk == fixture bytes").toBe(fixture.sha256);
    expect(state.stored_file.missing).toBeUndefined();
  }

  // --- native PDF capability, reported honestly (no injection) --------------
  const caps = await page.evaluate(() => ({
    pdfViewerEnabled: navigator.pdfViewerEnabled === true,
    userAgent: navigator.userAgent,
  }));

  for (const fixture of [fx.txt, fx.pdf, fx.png]) {
    const up = byName[fixture.name];
    const before = downloads.length;

    await page.goto(`/evidence/${up.body.id}`);
    await expect(page.locator("h1")).toHaveText(up.body.title, { timeout: 30_000 });
    await expect(page.getByTestId("download-original").first()).toBeVisible();

    if (fixture === fx.pdf) {
      // Opt-in preview: branch on the browser's REAL capability.
      if (caps.pdfViewerEnabled) {
        await page.getByTestId("load-preview").click();
        await expect(page.getByTestId("preview-ready")).toBeVisible({ timeout: 30_000 });
      } else {
        await expect(page.getByTestId("preview-unsupported")).toBeVisible();
        expect(
          await page.getByTestId("load-preview").count(),
          "no preview button in a browser that cannot render PDFs inline",
        ).toBe(0);
      }
    }

    // Opening a detail page must not download anything (the old iframe bug).
    await page.waitForTimeout(1_500);
    expect(downloads.length, `no download triggered by opening/using ${fixture.name}`).toBe(before);

    // --- explicit download, byte-exact --------------------------------------
    const target = path.join(DOWNLOAD_DIR, `${RUN}-${fixture.name}`);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.getByTestId("download-original").first().click(),
    ]);
    await download.saveAs(target);
    const bytes = readFileSync(target);

    expect(download.suggestedFilename(), "original filename preserved").toBe(fixture.name);
    expect(bytes.length, "downloaded size == uploaded size").toBe(fixture.size);
    expect(Buffer.compare(bytes, fixture.bytes), "downloaded bytes identical to fixture").toBe(0);
    expect(sha256Hex(bytes)).toBe(fixture.sha256);
    expect(downloads.length, "exactly one download per explicit click").toBe(before + 1);
  }

  console.log(
    `[pv-gate] native PDF capability: navigator.pdfViewerEnabled=${caps.pdfViewerEnabled} ` +
      `(${caps.userAgent})`,
  );
});

// ============================================================= test 2: OCR ==

test("PV-GATE 2 — Reprocess OCR twice per type: 202 job_id -> rq-decoded result -> exact-ID SQL -> UI [real API + real worker + SQL/RQ ground truth]", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const fx = runFixture("ocr");
  const txt = await uploadThroughUi(page, fx.txt);
  const pdf = await uploadThroughUi(page, fx.pdf);

  // Initial uploads must have settled before any explicit reprocess click.
  for (const up of [txt, pdf]) {
    const settled = await waitForSettledSource(page, up.body.id);
    console.log(
      `[pv-gate] initial settle ${up.fixture.name}: processing=${settled.processing_status} ocr=${settled.ocr_status} pages=${settled.page_count}`,
    );
  }

  // expectPageCount is the source-row page_count the product writes:
  // 1 for extracted text, NULL for the stub-skipped pdf/image path (the stub
  // writes no pages and does not invent a 0 — measured, asserted as-is).
  const runs = [
    { label: "TXT run 1", up: txt, expectOcr: "complete", expectPages: 1, expectPageCount: 1 },
    { label: "TXT run 2", up: txt, expectOcr: "complete", expectPages: 1, expectPageCount: 1 },
    { label: "PDF run 1", up: pdf, expectOcr: "skipped", expectPages: 0, expectPageCount: null },
    { label: "PDF run 2", up: pdf, expectOcr: "skipped", expectPages: 0, expectPageCount: null },
  ];

  for (const run of runs) {
    const id = run.up.body.id;
    const fixture = run.up.fixture;
    const before = sqlSourceState(id);
    const beforePageIds = before.pages.map((p) => p.id).join(",");

    await openStatusTab(page, id);
    const stateLineBefore = await visibleServerState(page);
    const { status, body } = await clickReprocessOcr(page, id);

    // (1) the real HTTP response of THIS click ------------------------------
    expect(status, `${run.label}: 202 Accepted`).toBe(202);
    expect(body, `${run.label}: JSON body`).toBeTruthy();
    expect(body.queued, `${run.label}: queued (worker mode required for this gate)`).toBe(true);
    expect(body.job_id, `${run.label}: job_id`).toMatch(UUID_RE);

    // (2) the UI bound THAT job id (no stale note from the previous run) -----
    await expect(page.getByTestId("ocr-accepted")).toContainText(body.job_id, { timeout: 15_000 });

    // (3) wait for the visible terminal outcome, bounded, no retry ----------
    const doneNote = page.getByTestId("ocr-done");
    const waiting = page.getByTestId("ocr-watching");
    let uiOutcome = "unconfirmed";
    try {
      await Promise.race([
        doneNote.waitFor({ state: "visible", timeout: OCR_JOB_TIMEOUT_MS }),
        waiting.waitFor({ state: "visible", timeout: OCR_JOB_TIMEOUT_MS }),
      ]);
      if (await doneNote.isVisible()) uiOutcome = (await doneNote.innerText()).replace(/\s+/g, " ").trim();
      if (uiOutcome === "unconfirmed") {
        await doneNote.waitFor({ state: "visible", timeout: OCR_JOB_TIMEOUT_MS });
        uiOutcome = (await doneNote.innerText()).replace(/\s+/g, " ").trim();
      }
    } catch {
      const db = sqlSourceState(id);
      throw new Error(
        `UNCONFIRMED ${run.label}: UI reached no terminal OCR note within ${OCR_JOB_TIMEOUT_MS}ms ` +
          `for job ${body.job_id}. No retry was enqueued. SQL says ocr_status=${db.source.ocr_status}, ` +
          `page_count=${db.source.page_count}.`,
      );
    }

    // (4) rq's own decoding of THAT job id ---------------------------------
    const job = decodeRqJob(body.job_id);
    expect(job.status, `${run.label}: RQ status`).toBe("finished");
    expect(job.func_name).toBe("workers.pipeline.jobs.ocr_source");
    expect(job.origin, `${run.label}: job ran on the ocr queue`).toBe("ocr");
    expect(job.args[0], `${run.label}: job targets the exact uploaded id`).toBe(id);
    expect(job.result, `${run.label}: decoded result payload`).toBeTruthy();
    expect(job.result.source_id, `${run.label}: result id correlation`).toBe(id);
    expect(job.result.status).toBe("complete");
    expect(job.result.ocr_status, `${run.label}: result ocr_status`).toBe(run.expectOcr);
    expect(job.result.page_count, `${run.label}: result page_count`).toBe(run.expectPageCount);

    // (5) exact-ID SQL state (never RQ FINISHED alone) ----------------------
    const after = sqlSourceState(id);
    expect(after.source.ocr_status).toBe(run.expectOcr);
    expect(after.source.page_count).toBe(run.expectPageCount);
    expect(after.pages.length).toBe(run.expectPages);
    expect(after.stored_file.sha256, `${run.label}: original bytes untouched`).toBe(fixture.sha256);

    if (run.expectPages === 1) {
      const expectedTextSha = sha256Hex(Buffer.from(fixture.bytes.toString("utf8"), "utf8"));
      expect(after.pages[0].page_number).toBe(1);
      expect(after.pages[0].ocr_text_sha256, `${run.label}: page text == fixture text`).toBe(
        expectedTextSha,
      );
    } else {
      // PDF/image are a DELIBERATE stub in this product: skipped, no extraction.
      expect(after.pages.length).toBe(0);
      expect(after.metadata?.ocr?.engine).toBe("stub");
      expect(String(after.metadata?.ocr?.reason ?? "")).toContain("No OCR engine wired");
    }

    // this run's write is observable (ids/stamps differ from the previous run)
    if (run.label.endsWith("run 2")) {
      if (run.expectPages === 1) {
        expect(after.pages.map((p) => p.id).join(","), "run 2 wrote a fresh page").not.toBe(
          beforePageIds,
        );
      } else {
        const beforeStamp = before.metadata?.ocr_reprocessed_at ?? "";
        const afterStamp = after.metadata?.ocr_reprocessed_at ?? "";
        expect(afterStamp, "run 2 rewrote the OCR metadata stamp").not.toBe("");
        expect(afterStamp >= beforeStamp).toBe(true);
        expect(afterStamp).not.toBe(beforeStamp);
      }
    }

    console.log(
      `[pv-gate] ${run.label}: job=${body.job_id} rq=${job.status} ` +
        `result.ocr_status=${job.result.ocr_status} sql.ocr_status=${after.source.ocr_status} ` +
        `pages=${after.source.page_count} ui="${uiOutcome.slice(0, 70)}" ` +
        `stateBefore="${stateLineBefore}" stateAfter="${await visibleServerState(page)}"`,
    );
  }

  // Visible end state must match the database for both types (OCR tab).
  for (const run of [runs[0], runs[2]]) {
    const id = run.up.body.id;
    const db = sqlSourceState(id);
    await page.goto(`/evidence/${id}`);
    await page.getByRole("button", { name: "OCR", exact: true }).click();
    const tabText = (await page.getByTestId("ocr-tab").innerText()).replace(/\s+/g, " ");
    if (run.expectPages === 1) {
      const head = db.pages[0].ocr_head.split("\n")[0].trim();
      expect(tabText).toContain(head.slice(0, 30));
    } else {
      expect(tabText).toContain("No pages extracted yet");
    }
  }
});

// ============================================================ test 3: edit ==

test("PV-GATE 3 — minimal Status edit/save, reload persistence and return-to-list smoke [real API + real browser + SQL ground truth]", async ({
  page,
}) => {
  const fx = runFixture("edit");
  const up = await uploadThroughUi(page, fx.txt);
  const id = up.body.id;

  await openStatusTab(page, id);

  // direct entry initializes the drafts from the server
  await expect(page.getByTestId("draft-title")).toHaveValue(up.body.title);
  await expect(page.getByTestId("draft-status")).toHaveValue("derived");

  const editedTitle = `${up.body.title} edited ${RUN}`;
  await page.getByTestId("draft-title").fill(editedTitle);
  await page.getByTestId("draft-status").selectOption("public_record");
  await expect(page.getByTestId("dirty-indicator")).toBeVisible();

  const [patch] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/v1/sources/${id}` && r.request().method() === "PATCH",
      { timeout: 30_000 },
    ),
    page.getByTestId("save-source").click(),
  ]);
  expect(patch.status()).toBe(200);
  await expect(page.getByTestId("save-ok")).toBeVisible({ timeout: 20_000 });

  let db = sqlSourceState(id);
  expect(db.source.title, "SQL title persisted").toBe(editedTitle);
  expect(db.source.source_status, "SQL status persisted").toBe("public_record");

  // reload: the saved values come back from the server, drafts re-initialize
  await openStatusTab(page, id);
  await expect(page.getByTestId("draft-title")).toHaveValue(editedTitle);
  await expect(page.getByTestId("draft-status")).toHaveValue("public_record");
  await expect(page.getByTestId("dirty-indicator")).toHaveCount(0);

  // include / exclude stay exclusive (SQL ground truth)
  const flagPatch = (name) =>
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/v1/sources/${id}` && r.request().method() === "PATCH",
      { timeout: 30_000 },
    );
  let [resp] = await Promise.all([
    flagPatch(),
    page.getByRole("button", { name: "Include", exact: true }).click(),
  ]);
  expect(resp.status()).toBe(200);
  db = sqlSourceState(id);
  expect([db.source.included_flag, db.source.excluded_flag]).toEqual([true, false]);

  [resp] = await Promise.all([
    flagPatch(),
    page.getByRole("button", { name: "Exclude", exact: true }).click(),
  ]);
  expect(resp.status()).toBe(200);
  db = sqlSourceState(id);
  expect([db.source.included_flag, db.source.excluded_flag]).toEqual([false, true]);

  // return-to-list smoke: the list shows the edited title for that exact id
  await page.goto("/evidence");
  const row = page.locator(`a[href="/evidence/${id}"]`);
  await expect(row).toHaveText(editedTitle, { timeout: 30_000 });

  console.log(
    `[pv-gate] edit/save ok: id=${id} title="${editedTitle}" status=${db.source.source_status} ` +
      `included=${db.source.included_flag} excluded=${db.source.excluded_flag}`,
  );
});
