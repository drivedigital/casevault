// -----------------------------------------------------------------------------
// EU-L negative-path browser proof — REAL browser, REAL app code, INJECTED
// transport failures/status sequences. Contract §EU-L (1)–(3) + 2026-09-11
// integration review findings.
//
// Honesty label: every test below that says "INJECTED" uses Playwright route
// interception to abort, stub, delay, or hold specific HTTP calls (labelled
// per test). The application code, its queries, and the browser are real;
// only the network outcome is forced. Positive-path (real API, no injection)
// proof lives in eu-list.spec.ts.
//
// Keyboard-upload proof uses a SINGLE activation — see keyboardUpload() and
// the diagnosis comment in eu-list.spec.ts / handoff/notes/EU-L.md (the
// earlier three-attempt allowance was a harness artefact and is gone).
// Fixtures are synthetic in-memory TXT content; nothing touches real evidence.
// Setup: see tests/browser/eu-list-README.md.
// -----------------------------------------------------------------------------

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

/**
 * Keyboard upload with a SINGLE activation (no retries allowed): focuses the
 * upload button, lets the injected focus settle, presses Enter once, asserts
 * the product opened the picker (in-page click listener), then hands the
 * synthetic file to the input at the DOM boundary — the same downstream flow
 * the native dialog drives. Full diagnosis: eu-list.spec.ts keyboardUpload()
 * and handoff/notes/EU-L.md.
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

/** Dispatches a real drop event carrying a synthetic File on the upload zone. */
async function dropFileOnZone(page: Page, fileName: string, content: string) {
  await page.evaluate(
    ([name, text]) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text as string], name as string, { type: "text/plain" }));
      const zone = document.querySelector<HTMLElement>('[data-testid="upload-zone"]');
      if (!zone) throw new Error("upload zone not found");
      zone.dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }),
      );
    },
    [fileName, content],
  );
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
  // Real state renders: the body settles into data rows or the empty state —
  // never the error row.
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toBeAttached({ timeout: 30_000 });
  await expect(firstRow).not.toContainText("Couldn’t load the evidence list");
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
  const search = page.getByLabel("Search titles");
  await search.fill(titleOf(name));
  await expect(page.locator("tr", { hasText: name })).toBeVisible({ timeout: 30_000 });

  // INJECTED: every subsequent sources fetch fails.
  await page.route("**/api/v1/sources**", (route) => route.abort("connectionrefused"));

  // Move to a fresh key, then back to the cached one: the cached rows must
  // stay visible, explicitly labelled, with the error banner on top.
  await search.fill(`${titleOf(name)}-zzz`);
  await expect(page.getByTestId("list-error")).toBeVisible({ timeout: 30_000 });
  await expect(search).toHaveValue(`${titleOf(name)}-zzz`); // input preserved in error state

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
// §EU-L 2/3 — upload failure is visible, attributable, honest about outcome
// uncertainty, retryable; the picker is keyboard-operable (single activation)
// on the failure path too.
// ---------------------------------------------------------------------------

test("INJECTED upload response loss names the file, reports unknown outcome, refresh helps, retry succeeds", async ({
  page,
}) => {
  const name = `${STAMP}-upload-fail.txt`;
  const content = `Synthetic upload-failure fixture ${STAMP}\n`;

  let failUpload = true;
  await page.route("**/api/v1/sources", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    if (failUpload) return route.abort("connectionrefused");
    return route.fallback();
  });

  await gotoEvidence(page);
  await keyboardUpload(page, name, content);

  const errorBox = page.getByTestId("upload-error");
  await expect(errorBox).toBeVisible({ timeout: 30_000 });
  await expect(errorBox).toContainText(`Upload failed for “${name}”`);
  // Response-loss honesty (2026-09-11 review finding 3): no false certainty.
  await expect(errorBox).toContainText("not known whether the file was added");
  await expect(errorBox).toContainText("duplicate copy");
  await expect(page.getByTestId("upload-success")).toHaveCount(0);

  // Safe reconciliation BEFORE retry: refreshing the list shows whether the
  // upload landed (here the INJECTED abort prevented the request, so no row).
  const listReq = page.waitForRequest((r) => r.url().includes("/api/v1/sources") && r.method() === "GET", { timeout: 15_000 });
  await errorBox.getByTestId("upload-refresh").click();
  await listReq;

  // INJECTED phase over — retry resubmits the SAME file through the real API.
  failUpload = false;
  await errorBox.getByRole("button", { name: `Retry upload of ${name}` }).click();
  await expect(page.getByTestId("upload-success")).toContainText(name, { timeout: 30_000 });
  await expect(page.getByTestId("upload-error")).toHaveCount(0);

  const list = (await (await fetch(`${API}/sources`)).json()) as SourceRow[];
  expect(list.some((s) => s.original_filename === name)).toBe(true);
});

test("INJECTED 4xx upload rejection states the proven outcome plainly", async ({ page }) => {
  const name = `${STAMP}-upload-422.txt`;
  const content = `Synthetic 422 fixture ${STAMP}\n`;

  await page.route("**/api/v1/sources", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    // INJECTED: definite server rejection — outcome is provably known.
    return route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ detail: "synthetic injected rejection" }),
    });
  });

  await gotoEvidence(page);
  await keyboardUpload(page, name, content);

  const errorBox = page.getByTestId("upload-error");
  await expect(errorBox).toBeVisible({ timeout: 30_000 });
  await expect(errorBox).toContainText(`Upload failed for “${name}”`);
  await expect(errorBox).toContainText("synthetic injected rejection");
  // Known outcome: the copy MAY say "was not added" and must NOT hedge.
  await expect(errorBox).toContainText("was not added to the evidence list");
  expect(await errorBox.textContent()).not.toContain("not known whether");
});

test("INJECTED held upload response: drops and picker activation while pending cannot start a second upload", async ({
  page,
}) => {
  const first = `${STAMP}-hold-first.txt`;
  const second = `${STAMP}-hold-second.txt`;

  // INJECTED: hold the FIRST upload response in flight; count every POST.
  let posts = 0;
  let releaseFirst: (() => void) | null = null;
  const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve; });
  await page.route("**/api/v1/sources", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts += 1;
    if (posts === 1) {
      await firstHeld; // hold the first response
      return route.fallback();
    }
    return route.fallback();
  });

  await gotoEvidence(page);
  await keyboardUpload(page, first, `Synthetic held-upload fixture one ${STAMP}\n`);
  await expect(page.getByTestId("upload-pending")).toContainText(first, { timeout: 30_000 });
  expect(posts).toBe(1);

  // Attempt 1: drop a second file while the first is in flight.
  await dropFileOnZone(page, second, `Synthetic held-upload fixture two ${STAMP}\n`);
  const blocked = page.getByTestId("upload-blocked");
  await expect(blocked).toContainText("already in progress", { timeout: 15_000 });
  await expect(blocked).toContainText(second);
  await expect(blocked).toContainText("was not submitted");

  // Attempt 2: zone/button picker activation while pending is also refused.
  await page.getByTestId("upload-zone").click();
  await expect(blocked).toContainText("already in progress");
  expect(posts).toBe(1); // no second request from either attempt

  // The Choose button stays disabled and the zone announces busy.
  await expect(page.getByTestId("upload-button")).toBeDisabled();
  await expect(page.getByTestId("upload-zone")).toHaveAttribute("aria-busy", "true");

  // Release the held response: the first upload completes for real.
  releaseFirst?.();
  await expect(page.getByTestId("upload-success")).toContainText(first, { timeout: 30_000 });
  await expect(blocked).toHaveCount(0); // guard released, feedback cleared
  expect(posts).toBe(1); // still exactly one POST ever

  // The lock is reusable after completion: the second file uploads now.
  await keyboardUpload(page, second, `Synthetic held-upload fixture two ${STAMP}\n`);
  await expect(page.getByTestId("upload-success")).toContainText(second, { timeout: 30_000 });
  expect(posts).toBe(2);

  const list = (await (await fetch(`${API}/sources`)).json()) as SourceRow[];
  expect(list.some((s) => s.original_filename === first)).toBe(true);
  expect(list.some((s) => s.original_filename === second)).toBe(true);
});

// ---------------------------------------------------------------------------
// §EU-L 2 — row include/exclude failures are visible, attributable, honest
// about uncertainty, retryable; pending protection blocks double submission.
// ---------------------------------------------------------------------------

test("INJECTED row mutation response loss shows an honest uncertain alert; retry succeeds", async ({
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
      // INJECTED 500: status code alone does not prove whether the server
      // applied the change — the copy must reflect that uncertainty.
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "synthetic injected row-update failure" }),
      });
    }
    return route.fallback();
  });

  await gotoEvidence(page);
  await page.getByLabel("Search titles").fill(titleOf(name));
  const row = page.locator("tr", { hasText: name });
  await expect(row).toBeVisible({ timeout: 30_000 });

  await row.getByTestId(`include-${created.id}`).click();
  const rowError = page.getByTestId(`row-error-${created.id}`);
  await expect(rowError).toBeVisible({ timeout: 30_000 });
  await expect(rowError).toContainText(`Couldn’t include “${titleOf(name)}”`);
  await expect(rowError).toContainText("synthetic injected row-update failure");
  // Response-loss honesty: no false "row is unchanged" claim.
  await expect(rowError).toContainText("not known whether the change was saved");
  await expect(rowError).toContainText("Refresh the list first");

  // Safe reconciliation BEFORE retry: refresh shows the row's true state.
  const listReq = page.waitForRequest((r) => r.url().includes("/api/v1/sources") && r.method() === "GET", { timeout: 15_000 });
  await rowError.getByTestId(`row-refresh-${created.id}`).click();
  await listReq;

  // A failed mutation must not render as success while unresolved: the row
  // button still shows the unapplied state.
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

test("INJECTED 4xx row rejection states the proven outcome plainly (row unchanged)", async ({
  page,
}) => {
  const name = `${STAMP}-row-400.txt`;
  const created = await apiUpload(name, `Synthetic row-400 fixture ${STAMP}\n`);

  await page.route("**/api/v1/sources/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    // INJECTED definite rejection — outcome provably known.
    return route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ detail: "synthetic injected rejection" }),
    });
  });

  await gotoEvidence(page);
  await page.getByLabel("Search titles").fill(titleOf(name));
  const row = page.locator("tr", { hasText: name });
  await expect(row).toBeVisible({ timeout: 30_000 });

  await row.getByTestId(`include-${created.id}`).click();
  const rowError = page.getByTestId(`row-error-${created.id}`);
  await expect(rowError).toBeVisible({ timeout: 30_000 });
  await expect(rowError).toContainText("synthetic injected rejection");
  await expect(rowError).toContainText("The row is unchanged");
  expect(await rowError.textContent()).not.toContain("not known whether");

  // The row really is unchanged (real API read-back).
  const viaApi = (await (await fetch(`${API}/sources`)).json()) as SourceRow[];
  expect(viaApi.find((s) => s.id === created.id)?.included_flag).toBe(false);
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
  await page.getByLabel("Search titles").fill(titleOf(name));
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
  await page.getByLabel("Search titles").fill(titleOf(name));
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
