// -----------------------------------------------------------------------------
// EU-L positive-path browser proof — REAL API, REAL browser.
// Contract: docs/contracts/evidence_ui_closure.md v1.0 §EU-L.
//
// Coverage statement (honest): every interaction below happens in a real
// Chromium against the real Next.js dev server, which proxies /api/v1 to the
// real FastAPI + Postgres stack. No transport is mocked in this file. The
// negative-path suite lives in eu-list-failures.spec.ts and uses INJECTED
// route failures there (clearly labelled per test).
//
// Fixtures are synthetic TXT content generated at runtime in memory — no real
// evidence, no identifying filenames/hashes.
//
// Keyboard-upload proof protocol (single activation — no retries): see the
// keyboardUpload() helper below and handoff/notes/EU-L.md for the diagnosis.
// Setup: see tests/browser/eu-list-README.md.
// -----------------------------------------------------------------------------

import { expect, test, type Page } from "@playwright/test";

const API = process.env.EU_API_BASE ?? "http://localhost:8100/api/v1";
const STAMP = `eu-l-synthetic-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.setTimeout(90_000);

interface SourceRow {
  id: string;
  title: string;
  original_filename: string | null;
  included_flag: boolean;
  excluded_flag: boolean;
  evidence_review_status: string;
  duplicate_of: { source_id: string; title: string } | null;
}

async function apiList(): Promise<SourceRow[]> {
  // The shipped client is a BARE ARRAY — this assertion is part of the proof.
  const resp = await fetch(`${API}/sources`);
  if (!resp.ok) throw new Error(`GET /sources -> ${resp.status}`);
  const body = (await resp.json()) as SourceRow[];
  expect(Array.isArray(body)).toBe(true);
  return body;
}

/** The server's `q` filter matches title only; uploads derive the title from
 *  the filename minus extension, so UI searches must use the title form. */
function titleOf(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/**
 * Upload a synthetic file through the REAL keyboard path — ONE activation.
 *
 * Diagnosis (handoff/notes/EU-L.md, measured 2026-09-12): a genuine (CDP)
 * Enter press ALWAYS activates the button and ALWAYS invokes the product's
 * input.click() (20/20 in every measured variant) — the product keyboard
 * affordance is correct. Playwright's filechooser INTERCEPTION, however,
 * surfaces the dialog unreliably in this sandbox Chromium (14–19 of 20, with
 * and without route interception; an immediate press after the injected
 * focus() loses the activation entirely, 2–4 of 8). That is a test-harness
 * command-ordering artefact, not product behaviour, so this helper:
 *  1. focuses the button, lets the injected focus settle (500 ms), presses
 *     Enter exactly ONCE, and
 *  2. asserts the picker opened via an in-page click listener on the file
 *     input (deterministic product-behaviour proof — the listener fires from
 *     the button's own onClick → input.click() chain), then
 *  3. hands the synthetic file to the input at the DOM boundary
 *     (input.files = DataTransfer + change event), which drives the exact
 *     same downstream React onChange → upload flow as the native dialog —
 *     Playwright's setFiles() bypasses the OS dialog in exactly the same way.
 * If the single Enter did NOT open the picker, the test FAILS loudly.
 */
async function keyboardUpload(page: Page, fileName: string, content: string) {
  const button = page.getByTestId("upload-button");
  await expect(button).toBeEnabled();
  await page.evaluate(() => {
    (globalThis as { __pickerOpenedByKeyboard?: boolean }).__pickerOpenedByKeyboard = false;
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("file input not found");
    input.addEventListener("click", () => {
      (globalThis as { __pickerOpenedByKeyboard?: boolean }).__pickerOpenedByKeyboard = true;
    });
  });
  await button.focus();
  await page.waitForTimeout(500); // let the injected focus() settle (CDP ordering)
  await page.keyboard.press("Enter"); // THE single activation — no retries
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (globalThis as { __pickerOpenedByKeyboard?: boolean }).__pickerOpenedByKeyboard,
        ),
      { timeout: 5_000, message: "single Enter activation did not open the file picker" },
    )
    .toBe(true);
  await page.evaluate(
    ([name, text]) => {
      const input = document.querySelector<HTMLInputElement>('input[type="file"]');
      if (!input) throw new Error("file input not found");
      const dt = new DataTransfer();
      dt.items.add(new File([text as string], name as string, { type: "text/plain" }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    [fileName, content],
  );
}

async function gotoEvidence(page: Page) {
  await page.goto("/evidence", { waitUntil: "domcontentloaded" });
  // Wait until the list has settled into rows, empty, or filtered-empty —
  // any of which means the query finished. A list-error here would be a real
  // failure and the assertions below will catch it.
  await expect(
    page.getByTestId("upload-button"),
    "upload button renders",
  ).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(
    () => !document.querySelector('[role="status"]')?.textContent?.includes("Loading evidence"),
    undefined,
    { timeout: 60_000 },
  );
}

test("keyboard-operable upload adds a source through the real API and refreshes the list", async ({
  page,
}) => {
  const name = `${STAMP}-kb-upload.txt`;

  await gotoEvidence(page);
  await keyboardUpload(page, name, `Synthetic keyboard upload fixture ${STAMP}\n`);

  // Success feedback plus the new row in the refreshed list.
  await expect(page.getByTestId("upload-success")).toContainText(name, { timeout: 30_000 });
  const row = page.locator("tr", { hasText: name });
  await expect(row).toContainText(name, { timeout: 30_000 });

  // The row is backed by a REAL source record (bare array, real API).
  const list = await apiList();
  const created = list.find((s) => s.original_filename === name);
  expect(created, "uploaded source exists via GET /sources").toBeTruthy();
});

test("include and exclude row actions perform exclusive transitions in the real API", async ({
  page,
}) => {
  const name = `${STAMP}-row-actions.txt`;
  const created = await apiUpload(
    name,
    `Synthetic row-action fixture ${STAMP}\n`,
  );

  await gotoEvidence(page);
  const search = page.getByLabel("Search titles");
  await search.fill(titleOf(name));
  const row = page.locator("tr", { hasText: name });
  await expect(row).toBeVisible({ timeout: 30_000 });

  const includeBtn = row.getByTestId(`include-${created.id}`);
  const excludeBtn = row.getByTestId(`exclude-${created.id}`);

  // Include → included_flag=true, excluded_flag explicitly cleared.
  await includeBtn.click();
  await expect(includeBtn).toHaveText("Included", { timeout: 30_000 });
  await expect(includeBtn).toBeDisabled();
  await expect(excludeBtn).toBeEnabled();
  let after = (await apiList()).find((s) => s.id === created.id);
  expect(after?.included_flag).toBe(true);
  expect(after?.excluded_flag).toBe(false);

  // Exclude → excluded_flag=true, included_flag explicitly cleared.
  await excludeBtn.click();
  await expect(excludeBtn).toHaveText("Excluded", { timeout: 30_000 });
  await expect(excludeBtn).toBeDisabled();
  await expect(includeBtn).toBeEnabled();
  after = (await apiList()).find((s) => s.id === created.id);
  expect(after?.included_flag).toBe(false);
  expect(after?.excluded_flag).toBe(true);
});

test("duplicate uploads keep the visible duplicate warning", async ({ page }) => {
  const name = `${STAMP}-duplicate.txt`;
  const content = `Synthetic duplicate fixture ${STAMP}\n`;
  await apiUpload(name, content);
  await apiUpload(name, content); // same bytes → flagged duplicate

  await gotoEvidence(page);
  await page.getByLabel("Search titles").fill(titleOf(name));
  const rows = page.locator("tr", { hasText: name });
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Duplicate of /).first()).toBeVisible({ timeout: 30_000 });
});

test("empty and filtered-empty are distinct states; Clear filters restores the list", async ({
  page,
}) => {
  const name = `${STAMP}-for-empty.txt`;
  await apiUpload(name, `Synthetic empty-state fixture ${STAMP}\n`);

  await gotoEvidence(page);

  // A term that matches nothing → FILTERED-empty, not plain empty, not error.
  await page.getByLabel("Search titles").fill(`${STAMP}-no-such-match`);
  await expect(page.getByTestId("list-filtered-empty")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("list-error")).toHaveCount(0);

  // Clear filters → the seeded row is visible again.
  await page.getByTestId("list-filtered-empty").getByRole("button", { name: "Clear all evidence filters" }).click();
  await expect(page.getByTestId("list-filtered-empty")).toHaveCount(0);
  await expect(page.locator("tr", { hasText: name })).toBeVisible({ timeout: 30_000 });
});

test("matter filter lists real matters and sends the server-backed matter_id filter", async ({
  page,
}) => {
  const matterName = `${STAMP} Matter`;
  const matterResp = await fetch(`${API}/matters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: matterName, matter_type: "other" }),
  });
  if (!matterResp.ok) throw new Error(`POST /matters -> ${matterResp.status}`);
  const matter = (await matterResp.json()) as { id: string };

  await gotoEvidence(page);
  const select = page.getByLabel("Filter by matter");
  await expect(select).toBeVisible({ timeout: 30_000 });
  const option = select.locator("option", { hasText: matterName });
  await expect(option).toHaveCount(1, { timeout: 30_000 });

  // The server-backed filter must actually reach GET /sources (matter_id is
  // one of the four shipped server filters — §EU-L 4).
  const filteredReq = page.waitForRequest(
    (r) => r.url().includes("/api/v1/sources") && r.url().includes(`matter_id=${matter.id}`),
    { timeout: 30_000 },
  );
  await select.selectOption(matter.id);
  await filteredReq;

  // A brand-new matter has no sources: this is a FILTERED empty state, not a
  // load failure and not the plain empty state.
  await expect(page.getByTestId("list-filtered-empty")).toBeVisible({ timeout: 30_000 });
  await page
    .getByTestId("list-filtered-empty")
    .getByRole("button", { name: "Clear all evidence filters" })
    .click();
  await expect(page.getByTestId("list-filtered-empty")).toHaveCount(0);
  expect(page.url()).toContain("/evidence");
});

// --- helpers shared by this file -------------------------------------------

async function apiUpload(name: string, content: string): Promise<SourceRow> {
  const form = new FormData();
  form.append("file", new Blob([content], { type: "text/plain" }), name);
  form.append("title", name.replace(/\.[^.]+$/, ""));
  const resp = await fetch(`${API}/sources`, { method: "POST", body: form });
  if (!resp.ok) throw new Error(`POST /sources -> ${resp.status}`);
  return (await resp.json()) as SourceRow;
}
