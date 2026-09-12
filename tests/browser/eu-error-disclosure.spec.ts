// -----------------------------------------------------------------------------
// EU-ERR — focused regressions for the LIST error-disclosure boundary.
// Contract: docs/contracts/evidence_ui_closure.md v1.0 §EU-L (1)–(3)
// ("…without leaking raw server traces").
//
// WHY THIS EXISTS: EU-V's L3.2–L3.4 browser case injected a 500 whose `detail`
// carried a traceback/SQL payload and observed it rendered verbatim in the UI.
// Root cause: describeError() returned ANY Error.message. These tests pin the
// fixed behaviour: untrusted error text (injected or otherwise unexpected)
// MUST surface as a generic, actionable message with honest attribution,
// while accessible retry, the pending guard and outcome-uncertainty copy keep
// working. They are EU-ERR's own files; no EU-L/EU-V assertion is edited.
//
// Honesty label: every test below that says "INJECTED" uses Playwright route
// interception to force a status/body/abort on SPECIFIC calls. The browser,
// app code and queries are real; only the forced network outcome is
// synthetic. Fixtures are synthetic in-memory TXT — no real evidence, no
// identifying names/hashes. Seeding/assertion calls go Node-side directly to
// the API and are never intercepted.
// -----------------------------------------------------------------------------

import { expect, test, type Page } from "@playwright/test";

const API = process.env.EU_API_BASE ?? "http://localhost:8100/api/v1";
const STAMP = `eu-err-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.setTimeout(90_000);

interface SourceRow {
  id: string;
  title: string;
  original_filename: string | null;
}

/** The server derives the title from the filename minus extension. */
function titleOf(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/** Node-side synthetic upload (never intercepted; not browser proof). */
async function apiUpload(name: string, content: string): Promise<SourceRow> {
  const form = new FormData();
  form.append("file", new Blob([content], { type: "text/plain" }), name);
  form.append("title", name.replace(/\.[^.]+$/, ""));
  const resp = await fetch(`${API}/sources`, { method: "POST", body: form });
  if (!resp.ok) throw new Error(`POST /sources -> ${resp.status}`);
  return (await resp.json()) as SourceRow;
}

async function gotoEvidence(page: Page) {
  await page.goto("/evidence", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("upload-button")).toBeEnabled({ timeout: 30_000 });
}

/**
 * Synthetic INJECTED payload whose `detail` carries exactly the kind of text
 * EU-V observed disclosed: a traceback fragment and a SQL statement. If any
 * of it reaches the UI, the leakDetector assertions below fail.
 */
const INJECTED_500_DETAIL =
  'Traceback (most recent call last): File "app/api/app.py", line 42, in boom; SELECT * FROM sources';

/** Substrings that must never appear in user-facing failure UI. Anchored to
 *  the injected payload + typical backend tokens; not a redaction mechanism —
 *  the product must not render ANY of the untrusted detail in the first place. */
const LEAK_DETECTOR =
  /traceback|select\s+\*|app\.py|line 42|"app\.py"|sqlalchemy|psycopg|insert\s+into|postgres/i;

test("INJECTED 500 on row matter badge: generic reason, no traceback/SQL, retry recovers [injected500]", async ({
  page,
}) => {
  const name = `${STAMP}-badge.txt`;
  const created = await apiUpload(name, `Synthetic badge fixture ${STAMP}\n`);
  const stem = titleOf(name);
  const endpoint = new RegExp(`/api/v1/sources/${created.id}/matters(?:\\?|$)`);

  let fail = true;
  await page.route(endpoint, async (route) => {
    if (!fail) return route.fallback();
    // INJECTED: server 500 whose body detail is a traceback/SQL payload.
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: INJECTED_500_DETAIL }),
    });
  });

  await gotoEvidence(page);
  const row = page.locator("table tbody tr", { hasText: name });
  await expect(row, "the exact seeded source row is visible").toContainText(stem, {
    timeout: 30_000,
  });

  const badgeError = row.getByTestId(`badge-error-${created.id}`);
  await expect(badgeError.getByRole("alert")).toContainText("Couldn’t load linked matters", {
    timeout: 30_000,
  });

  const badgeText = (await badgeError.textContent()) ?? "";
  expect(badgeText, "raw injected detail must not be rendered").not.toMatch(LEAK_DETECTOR);
  expect(badgeText, "reason is a generic actionable server-error message").toContain(
    "The server had a problem with this request",
  );

  const retry = badgeError.getByRole("button", { name: `Retry loading linked matters for ${stem}` });
  await expect(retry, "badge exposes an accessible, labelled retry").toBeVisible();

  // INJECTED phase over: the same accessible retry recovers the real state.
  fail = false;
  await retry.click();
  await expect(row.getByLabel(`No linked matters for ${stem}`)).toBeVisible({ timeout: 30_000 });
  await expect(badgeError).toHaveCount(0);
});

test("INJECTED 500 on list load: failure stays distinct from empty, generic reason, retry loads real data [injected500]", async ({
  page,
}) => {
  const name = `${STAMP}-list.txt`;
  await apiUpload(name, `Synthetic list fixture ${STAMP}\n`);

  let fail = true;
  await page.route("**/api/v1/sources**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    if (!fail) return route.fallback();
    // INJECTED: list GET fails with a traceback/SQL detail payload.
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: INJECTED_500_DETAIL }),
    });
  });

  await gotoEvidence(page);

  const listError = page.getByTestId("list-error");
  await expect(listError).toBeVisible({ timeout: 30_000 });
  await expect(listError).toContainText("Couldn’t load the evidence list");
  await expect(page.getByTestId("list-empty")).toHaveCount(0);

  const listText = (await listError.textContent()) ?? "";
  expect(listText, "raw injected detail must not be rendered").not.toMatch(LEAK_DETECTOR);
  expect(listText, "reason is a generic actionable server-error message").toContain(
    "The server had a problem with this request",
  );
  // Honest failure framing: never rendered as an empty list.
  expect(listText).toContain("not an empty list");
  await expect(
    listError.getByRole("button", { name: "Retry loading the evidence list" }),
  ).toBeVisible();

  fail = false;
  await listError.getByRole("button", { name: "Retry loading the evidence list" }).click();
  await expect(page.locator("table tbody tr", { hasText: name })).toBeVisible({ timeout: 30_000 });
  await expect(listError).toHaveCount(0);
});

test("INJECTED network failure on matter badge: honest network message, no browser error text, retry recovers [INJECTED network abort]", async ({
  page,
}) => {
  const name = `${STAMP}-net.txt`;
  const created = await apiUpload(name, `Synthetic network fixture ${STAMP}\n`);
  const stem = titleOf(name);
  const endpoint = new RegExp(`/api/v1/sources/${created.id}/matters(?:\\?|$)`);

  let fail = true;
  await page.route(endpoint, async (route) => {
    if (!fail) return route.fallback();
    // INJECTED: request never reaches a server (connection-level failure).
    return route.abort("connectionrefused");
  });

  await gotoEvidence(page);
  const row = page.locator("table tbody tr", { hasText: name });
  await expect(row).toContainText(stem, { timeout: 30_000 });

  const badgeError = row.getByTestId(`badge-error-${created.id}`);
  await expect(badgeError.getByRole("alert")).toContainText("Couldn’t load linked matters", {
    timeout: 30_000,
  });

  const badgeText = (await badgeError.textContent()) ?? "";
  expect(badgeText, "network message is honest and actionable").toContain(
    "Network error — the server could not be reached",
  );
  expect(badgeText, "raw browser error text must not be rendered").not.toContain("Failed to fetch");
  expect(badgeText).not.toMatch(LEAK_DETECTOR);

  fail = false;
  await badgeError
    .getByRole("button", { name: `Retry loading linked matters for ${stem}` })
    .click();
  await expect(row.getByLabel(`No linked matters for ${stem}`)).toBeVisible({ timeout: 30_000 });
  await expect(badgeError).toHaveCount(0);
});

test("INJECTED 500 on row include + matter filter: attribution, uncertainty copy and generic reasons hold on both surfaces, retries recover [injected500]", async ({
  page,
}) => {
  const name = `${STAMP}-row-filter.txt`;
  const created = await apiUpload(name, `Synthetic row/filter fixture ${STAMP}\n`);
  const stem = titleOf(name);

  let failWrites = true;
  let failMatters = true;
  await page.route("**/api/v1/sources/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    if (!failWrites) return route.fallback();
    // INJECTED: row PATCH 500 with a SQL-flavoured detail payload.
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        detail: `sqlalchemy.exc.OperationalError: (psycopg2.errors.CheckViolation) ${INJECTED_500_DETAIL}`,
      }),
    });
  });
  await page.route("**/api/v1/matters**", async (route) => {
    if (!failMatters) return route.fallback();
    // INJECTED: matter-filter query 500 with the same kind of payload.
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: INJECTED_500_DETAIL }),
    });
  });

  await gotoEvidence(page);

  // --- matter filter surface (evidence-list-filters) -------------------------
  const filterError = page.getByTestId("matter-filter-error");
  await expect(filterError.getByRole("alert")).toContainText("Couldn’t load the matter list", {
    timeout: 30_000,
  });
  const filterText = (await filterError.textContent()) ?? "";
  expect(filterText).not.toMatch(LEAK_DETECTOR);
  expect(filterText).toContain("The server had a problem with this request");
  await expect(
    filterError.getByRole("button", { name: "Retry loading the matter filter options" }),
  ).toBeVisible();

  // --- row include surface (evidence-list-row) -------------------------------
  const row = page.locator("tr", { hasText: name });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByTestId(`include-${created.id}`).click();

  const rowError = page.getByTestId(`row-error-${created.id}`);
  await expect(rowError).toBeVisible({ timeout: 30_000 });
  await expect(rowError).toContainText(`Couldn’t include “${stem}”`);
  const rowText = (await rowError.textContent()) ?? "";
  expect(rowText, "raw injected detail must not be rendered").not.toMatch(LEAK_DETECTOR);
  expect(rowText).toContain("The server had a problem with this request");
  // A 5xx does NOT prove the outcome: honest uncertainty must survive.
  expect(rowText).toContain("not known whether the change was saved");
  expect(rowText).toContain("Refresh the list first");
  await expect(rowError.getByRole("button", { name: `Retry include for ${stem}` })).toBeVisible();
  await expect(row.getByTestId(`include-${created.id}`)).not.toHaveText("Included");

  // Real API read-back while injected failure stands: the row truly changed.
  const mid = (await (await fetch(`${API}/sources`)).json()) as SourceRow[];
  expect(mid.find((s) => s.id === created.id)?.included_flag).toBe(false);

  // INJECTED phases over: both retries recover their real state.
  failWrites = false;
  await rowError.getByRole("button", { name: `Retry include for ${stem}` }).click();
  await expect(rowError).toBeHidden({ timeout: 30_000 });
  await expect(row.getByTestId(`include-${created.id}`)).toHaveText("Included", { timeout: 30_000 });

  failMatters = false;
  await filterError.getByRole("button", { name: "Retry loading the matter filter options" }).click();
  await expect(filterError).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByLabel("Filter by matter")).toBeVisible();
});
