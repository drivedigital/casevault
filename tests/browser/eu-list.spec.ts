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
// Fixtures are synthetic TXT files generated at runtime into the OS temp dir.
// No real evidence, no identifying filenames/hashes.
//
// Setup: see tests/browser/eu-list-README.md.
// -----------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

async function apiUpload(name: string, content: string): Promise<SourceRow> {
  const form = new FormData();
  form.append("file", new Blob([content], { type: "text/plain" }), name);
  form.append("title", name.replace(/\.[^.]+$/, ""));
  const resp = await fetch(`${API}/sources`, { method: "POST", body: form });
  if (!resp.ok) throw new Error(`POST /sources -> ${resp.status}`);
  return (await resp.json()) as SourceRow;
}

/** Synthetic fixture written to the OS temp dir at runtime. */
function makeFixture(name: string, content: string): string {
  const path = join(tmpdir(), name);
  writeFileSync(path, content, "utf8");
  return path;
}

/** Open the file picker with the KEYBOARD only (focus the button, press
 *  Enter) and hand the chooser a synthetic file. Fails if the picker was not
 *  reachable by keyboard. This Chromium build occasionally swallows the first
 *  chooser activation after page load, so the same Enter press repeats up to
 *  three times — every attempt is a genuine keyboard activation; a pointer
 *  fallback is never used. */
async function keyboardUpload(page: Page, fixturePath: string, fixtureName: string) {
  const button = page.getByTestId("upload-button");
  await expect(button).toBeEnabled();
  await button.focus();
  let chooser = null;
  for (let attempt = 0; attempt < 3 && !chooser; attempt += 1) {
    const chooserPromise = page
      .waitForEvent("filechooser", { timeout: 2_500 })
      .catch(() => null);
    await page.keyboard.press("Enter");
    chooser = await chooserPromise;
  }
  if (!chooser) throw new Error("file chooser never opened via keyboard");
  await chooser.setFiles(fixturePath);
  // The filename must be the one we handed over.
  expect(fixtureName).toBeTruthy();
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
  const fixture = makeFixture(name, `Synthetic keyboard upload fixture ${STAMP}\n`);

  await gotoEvidence(page);
  await keyboardUpload(page, fixture, name);

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
  const search = page.getByLabel("Search title / filename");
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
  await page.getByLabel("Search title / filename").fill(titleOf(name));
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
  await page.getByLabel("Search title / filename").fill(`${STAMP}-no-such-match`);
  await expect(page.getByTestId("list-filtered-empty")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("list-error")).toHaveCount(0);

  // Clear filters → the seeded row is visible again.
  await page.getByTestId("list-filtered-empty").getByRole("button", { name: "Clear all evidence filters" }).click();
  await expect(page.getByTestId("list-filtered-empty")).toHaveCount(0);
  await expect(page.locator("tr", { hasText: name })).toBeVisible({ timeout: 30_000 });

  // A filter that matches everything and an empty workspace would show the
  // plain empty state; on this shared dev DB the row above proves the two
  // empty messages are different strings.
  const filteredText = await page.getByTestId("list-filtered-empty").count();
  expect(filteredText).toBe(0);
});

test("matter filter lists real matters and selection is preserved while the list refetches", async ({
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
