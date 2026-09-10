// -----------------------------------------------------------------------------
// EU-L negative-path browser proof — REAL browser, REAL app code, INJECTED
// transport failures/status sequences. Contract §EU-L (1)–(3).
//
// Honesty label: every test below that says "INJECTED" uses Playwright route
// interception to abort or stub specific HTTP calls. The application code, its
// queries, and the browser are real; only the network outcome is forced.
// Positive-path (real API, no injection) proof lives in eu-list.spec.ts.
//
// Fixtures are synthetic; nothing here touches real evidence.
// Setup: see tests/browser/eu-list-README.md.
// -----------------------------------------------------------------------------

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const API = process.env.EU_API_BASE ?? "http://localhost:8100/api/v1";
const STAMP = `eu-l-neg-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.setTimeout(90_000);

interface SourceRow {
  id: string;
  title: string;
  original_filename: string | null;
  included_flag: boolean;
  excluded_flag: boolean;
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

/** Opens the file picker with the keyboard only (Enter on the upload button).
 *  With Playwright route interception active, this Chromium build swallows the
 *  FIRST keyboard chooser activation, so the same Enter press is repeated up
 *  to three times — every attempt is genuine keyboard activation; a pointer
 *  fallback is never used. Keyboard operability without injection is proven
 *  end-to-end in eu-list.spec.ts. */
async function keyboardOpenChooser(page: Page) {
  const button = page.getByTestId("upload-button");
  await expect(button).toBeEnabled();
  await button.focus();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const chooserPromise = page
      .waitForEvent("filechooser", { timeout: 2_500 })
      .catch(() => null);
    await page.keyboard.press("Enter");
    const chooser = await chooserPromise;
    if (chooser) return chooser;
  }
  throw new Error("file chooser never opened via keyboard");
}

async function gotoEvidence(page: Page) {
  await page.goto("/evidence", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("upload-button")).toBeVisible({ timeout: 60_000 });
  // Wait for hydration + the initial query to settle (rows, true-empty or the
  // error state replace the SSR loading row). Keyboard events before this
  // point race React hydration.
  await page.waitForFunction(
    () => !document.querySelector("tbody [role=\"status\"]")?.textContent?.includes("Loading evidence"),
    undefined,
    { timeout: 60_000 },
  );
}

// ---------------------------------------------------------------------------
// §EU-L 1 — a failed list request is NOT displayed as an empty list.
// ---------------------------------------------------------------------------

test("INJECTED list failure shows an error state with retry, never an empty list", async ({
  page,
}) => {
  await page.route("**/api/v1/sources**", (route) => route.abort("connectionrefused"));
  await gotoEvidence(page);

  const errorBox = page.getByTestId("list-error");
  await expect(errorBox).toBeVisible({ timeout: 30_000 });
  await expect(errorBox).toContainText("Couldn’t load the evidence list");
  await expect(errorBox).toContainText("Retry");
  // The core regression: failure must not render the empty/filtered messages.
  await expect(page.getByTestId("list-empty")).toHaveCount(0);
  await expect(page.getByTestId("list-filtered-empty")).toHaveCount(0);
  await expect(page.getByText("No evidence matches")).toHaveCount(0);
  await expect(page.getByText("No evidence yet")).toHaveCount(0);
});

test("INJECTED failure then REAL retry loads the list once the API responds", async ({
  page,
}) => {
  await page.route("**/api/v1/sources**", (route) => route.abort("connectionrefused"));
  await gotoEvidence(page);
  await expect(page.getByTestId("list-error")).toBeVisible({ timeout: 30_000 });

  // INJECTED phase over — the real API answers from here on.
  await page.unroute("**/api/v1/sources**");
  await page
    .getByRole("button", { name: "Retry loading the evidence list" })
    .click();
  await expect(page.getByTestId("list-error")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByTestId("list-error")).toHaveCount(0);
  // Real state renders: either the workspace rows or the true empty state.
  await expect(
    page.getByTestId("list-empty").or(page.locator("tbody tr").first()),
  ).toBeVisible({ timeout: 30_000 });
});

// ---------------------------------------------------------------------------
// §EU-L 1/2 — stale data is labelled; filter input survives failure + retry.
// ---------------------------------------------------------------------------

test("INJECTED refetch failure labels retained rows as saved data and preserves the search term", async ({
  page,
}) => {
  const name = `${STAMP}-stale.txt`;
  await apiUpload(name, `Synthetic stale-fixture ${STAMP}\n`);

  await gotoEvidence(page);
  const search = page.getByLabel("Search title / filename");
  await search.fill(titleOf(name));
  await expect(page.locator("tr", { hasText: name })).toBeVisible({ timeout: 30_000 });

  // INJECTED: every subsequent sources fetch fails.
  await page.route("**/api/v1/sources**", (route) => route.abort("connectionrefused"));

  // Move to a fresh key, then back to the cached one: the cached rows must
  // stay visible, explicitly labelled, with the error banner on top.
  await search.fill(`${name}-zzz`);
  await expect(page.getByTestId("list-error")).toBeVisible({ timeout: 30_000 });
  await expect(search).toHaveValue(`${name}-zzz`); // input preserved in error state

  await search.fill(titleOf(name));
  const errorBox = page.getByTestId("list-error");
  await expect(errorBox).toBeVisible({ timeout: 30_000 });
  await expect(errorBox).toContainText("saved result");
  await expect(errorBox).toContainText("may be out of date");
  // Exactly the retained data rows carry the label (the error banner itself
  // also mentions saved results, so count the chips, not the text).
  await expect(page.getByTestId("stale-chip")).toHaveCount(1);
  await expect(search).toHaveValue(titleOf(name)); // filter value survived both failures

  // INJECTED phase over: retry with the SAME filter brings fresh data.
  await page.unroute("**/api/v1/sources**");
  await page.getByRole("button", { name: "Retry loading the evidence list" }).click();
  await expect(page.getByTestId("list-error")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("stale-chip")).toHaveCount(0);
  await expect(page.locator("tr", { hasText: name })).toBeVisible({ timeout: 30_000 });
  await expect(search).toHaveValue(titleOf(name));
});

// ---------------------------------------------------------------------------
// §EU-L 2/3 — upload failure is visible, attributable, retryable; the picker
// is keyboard-operable even for the failure path.
// ---------------------------------------------------------------------------

test("INJECTED upload failure names the file, is announced, and retry succeeds for real", async ({
  page,
}) => {
  const name = `${STAMP}-upload-fail.txt`;
  const fixture = join(tmpdir(), name);
  writeFileSync(fixture, `Synthetic upload-failure fixture ${STAMP}\n`, "utf8");

  const posts: string[] = [];
  let failUpload = true;
  await page.route("**/api/v1/sources", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts.push(route.request().url());
    if (failUpload) return route.abort("connectionrefused");
    return route.fallback();
  });

  await gotoEvidence(page);
  const chooser = await keyboardOpenChooser(page);
  await chooser.setFiles(fixture);

  const errorBox = page.getByTestId("upload-error");
  await expect(errorBox).toBeVisible({ timeout: 30_000 });
  await expect(errorBox).toContainText(`Upload failed for “${name}”`);
  await expect(errorBox).toContainText("was not added");
  await expect(page.getByTestId("upload-success")).toHaveCount(0);
  expect(posts.length).toBeGreaterThan(0);

  // INJECTED phase over — retry resubmits the SAME file through the real API.
  failUpload = false;
  await errorBox.getByRole("button", { name: `Retry upload of ${name}` }).click();
  await expect(page.getByTestId("upload-success")).toContainText(name, { timeout: 30_000 });
  await expect(page.getByTestId("upload-error")).toHaveCount(0);

  const list = (await (await fetch(`${API}/sources`)).json()) as SourceRow[];
  expect(list.some((s) => s.original_filename === name)).toBe(true);
});

test("upload picker is disabled while one upload is pending (no duplicate submissions)", async ({
  page,
}) => {
  const name = `${STAMP}-pending-upload.txt`;
  const fixture = join(tmpdir(), name);
  writeFileSync(fixture, `Synthetic pending-upload fixture ${STAMP}\n`, "utf8");

  let posts = 0;
  // INJECTED latency: the real API answers, just slowly.
  await page.route("**/api/v1/sources", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts += 1;
    await new Promise((r) => setTimeout(r, 1500));
    return route.fallback();
  });

  await gotoEvidence(page);
  const chooser = await keyboardOpenChooser(page);
  await chooser.setFiles(fixture);

  const button = page.getByTestId("upload-button");
  await expect(button).toBeDisabled({ timeout: 10_000 });
  await expect(button).toHaveText("Uploading…");
  await expect(page.getByTestId("upload-pending")).toContainText(name);
  // The only way to attempt a second submission while disabled is the picker
  // itself; the disabled state plus a single POST proves prevention.
  expect(posts).toBe(1);
  await expect(button).toBeEnabled({ timeout: 30_000 });
  expect(posts).toBe(1); // still exactly one submission
});

// ---------------------------------------------------------------------------
// §EU-L 2 — row include/exclude failures are visible, attributable, retryable;
// pending protection blocks duplicate submissions; failures are not successes.
// ---------------------------------------------------------------------------

test("INJECTED row mutation failure shows an inline row alert and retry succeeds", async ({
  page,
}) => {
  const name = `${STAMP}-row-fail.txt`;
  const created = await apiUpload(name, `Synthetic row-failure fixture ${STAMP}\n`);

  let failPatch = true;
  const patches: string[] = [];
  await page.route("**/api/v1/sources/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patches.push(route.request().url());
    if (failPatch) {
      // INJECTED 500 with a synthetic reason (no raw server trace).
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "synthetic injected row-update failure" }),
      });
    }
    return route.fallback();
  });

  await gotoEvidence(page);
  await page.getByLabel("Search title / filename").fill(titleOf(name));
  const row = page.locator("tr", { hasText: name });
  await expect(row).toBeVisible({ timeout: 30_000 });

  await row.getByTestId(`include-${created.id}`).click();
  const rowError = page.getByTestId(`row-error-${created.id}`);
  await expect(rowError).toBeVisible({ timeout: 30_000 });
  await expect(rowError).toContainText(`Couldn’t include “${titleOf(name)}”`);
  await expect(rowError).toContainText("synthetic injected row-update failure");
  await expect(rowError).toContainText("The row is unchanged");

  // A failed mutation must not look like success: the flag is untouched and
  // the row shows no Included/Excluded confirmation.
  const viaApi = (await (await fetch(`${API}/sources`)).json()) as SourceRow[];
  expect(viaApi.find((s) => s.id === created.id)?.included_flag).toBe(false);
  await expect(row.getByTestId(`include-${created.id}`)).not.toHaveText("Included");

  // INJECTED phase over: the row-level retry resubmits the same operation.
  failPatch = false;
  await rowError.getByRole("button", { name: `Retry include for ${titleOf(name)}` }).click();
  await expect(rowError).toBeHidden({ timeout: 30_000 });
  await expect(row.getByTestId(`include-${created.id}`)).toHaveText("Included", {
    timeout: 30_000,
  });
  const final = (await (await fetch(`${API}/sources`)).json()) as SourceRow[];
  expect(final.find((s) => s.id === created.id)?.included_flag).toBe(true);
});

test("INJECTED slow row mutation disables that row's buttons — no double submission", async ({
  page,
}) => {
  const name = `${STAMP}-row-pending.txt`;
  const created = await apiUpload(name, `Synthetic row-pending fixture ${STAMP}\n`);

  let patches = 0;
  await page.route("**/api/v1/sources/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patches += 1;
    await new Promise((r) => setTimeout(r, 1500)); // INJECTED latency
    return route.fallback();
  });

  await gotoEvidence(page);
  await page.getByLabel("Search title / filename").fill(titleOf(name));
  const row = page.locator("tr", { hasText: name });
  await expect(row).toBeVisible({ timeout: 30_000 });

  const includeBtn = row.getByTestId(`include-${created.id}`);
  const excludeBtn = row.getByTestId(`exclude-${created.id}`);
  await includeBtn.click();
  await expect(includeBtn).toBeDisabled({ timeout: 10_000 });
  await expect(excludeBtn).toBeDisabled();
  await expect(includeBtn).toHaveText("Including…");

  await expect(includeBtn).toHaveText("Included", { timeout: 30_000 });
  await expect(includeBtn).toBeDisabled(); // already included
  await expect(excludeBtn).toBeEnabled();
  expect(patches).toBe(1); // exactly one PATCH despite the slow round-trip
});

// ---------------------------------------------------------------------------
// §EU-L 3 — matter filter and row badge failures must not read as
// “no linked matters”.
// ---------------------------------------------------------------------------

test("INJECTED matter-filter failure is announced with retry, not an empty select", async ({
  page,
}) => {
  await page.route("**/api/v1/matters**", (route) => route.abort("connectionrefused"));
  await gotoEvidence(page);

  const err = page.getByTestId("matter-filter-error");
  await expect(err).toBeVisible({ timeout: 30_000 });
  await expect(err).toContainText("Couldn’t load the matter list");
  await expect(page.getByLabel("Filter by matter")).toHaveCount(0); // no fake "All matters"

  await page.unroute("**/api/v1/matters**");
  await err.getByRole("button", { name: "Retry loading the matter filter options" }).click();
  await expect(page.getByTestId("matter-filter-error")).toHaveCount(0, { timeout: 30_000 });
  const select = page.getByLabel("Filter by matter");
  await expect(select.locator("option").first()).toHaveText("All matters");
});

test("INJECTED row badge failure is distinct from “no linked matters” and retry shows the link", async ({
  page,
}) => {
  const name = `${STAMP}-badge.txt`;
  const created = await apiUpload(name, `Synthetic badge fixture ${STAMP}\n`);
  const matterResp = await fetch(`${API}/matters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `${STAMP} Badge Matter`, matter_type: "other" }),
  });
  if (!matterResp.ok) throw new Error(`POST /matters -> ${matterResp.status}`);
  const matter = (await matterResp.json()) as { id: string };
  const linkResp = await fetch(`${API}/matters/${matter.id}/sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_id: created.id }),
  });
  if (!linkResp.ok) throw new Error(`POST /matters/{id}/sources -> ${linkResp.status}`);

  await page.route("**/api/v1/sources/*/matters", (route) => route.abort("connectionrefused"));
  await gotoEvidence(page);
  await page.getByLabel("Search title / filename").fill(titleOf(name));
  const row = page.locator("tr", { hasText: name });
  await expect(row).toBeVisible({ timeout: 30_000 });

  const badgeError = page.getByTestId(`badge-error-${created.id}`);
  await expect(badgeError).toBeVisible({ timeout: 30_000 });
  await expect(badgeError).toContainText("Couldn’t load linked matters");

  await page.unroute("**/api/v1/sources/*/matters");
  await badgeError
    .getByRole("button", { name: `Retry loading linked matters for ${titleOf(name)}` })
    .click();
  await expect(badgeError).toBeHidden({ timeout: 30_000 });
  await expect(row.locator("a", { hasText: `${STAMP} Badge Matter` })).toBeVisible({
    timeout: 30_000,
  });
});
