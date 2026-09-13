// -----------------------------------------------------------------------------
// EU-ERR — focused regressions for the TRUSTED VALIDATION MAPPING on the
// evidence list surfaces (upload + row include/exclude).
// Contract: docs/contracts/evidence_ui_closure.md v1.0 §EU-L (2).
//
// WHAT THIS PINS: the disclosure fix must NOT flatten real validation
// feedback. Known, curated server validation outcomes are preserved through a
// deliberate allowlist mapping (authored UI copy — server text itself is
// never rendered), while ARBITRARY/untrusted 4xx `detail` text is reduced to
// a generic rejection message. Proven-outcome (4xx ⇒ "not added" / "row
// unchanged") and uncertainty copy stay intact.
//
// Honesty label: "REAL API" tests use the real FastAPI validation path with a
// synthetic empty file — no injection. "INJECTED" tests force one status/body
// via route interception; browser, app code and queries stay real. Fixtures
// are synthetic in-memory TXT — no real evidence.
// -----------------------------------------------------------------------------

import { expect, test, type Page } from "@playwright/test";

const API = process.env.EU_API_BASE ?? "http://localhost:8100/api/v1";
const STAMP = `eu-err-val-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.setTimeout(90_000);

function titleOf(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

interface SourceRow {
  id: string;
  included_flag: boolean;
}

async function gotoEvidence(page: Page) {
  await page.goto("/evidence", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("upload-button")).toBeEnabled({ timeout: 30_000 });
}

/**
 * Drives the REAL upload flow (click-armed onChange → single-flight guard →
 * size guard → mutation) by handing a synthetic File to the hidden input at
 * the DOM boundary — the same downstream React path a native picker selection
 * takes. The click matters: ReactDOM's ChangeEventPlugin arms a file input's
 * onChange from the click that opens the picker, so a bare change dispatch is
 * swallowed (observed here 2026-09-12); EU-L's keyboard helper clicks the
 * input the same way before its DOM hand-off. Keyboard operability itself is
 * proven by the EU-L suite and is not this file's scope.
 */
async function uiUpload(page: Page, fileName: string, content: string) {
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("file input not found");
    input.click();
  });
  await page.waitForTimeout(300); // let the click-armed change pipeline settle
  await page.evaluate(
    ([n, text]) => {
      const input = document.querySelector<HTMLInputElement>('input[type="file"]');
      if (!input) throw new Error("file input not found");
      const dt = new DataTransfer();
      dt.items.add(new File([text as string], n as string, { type: "text/plain" }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    [fileName, content],
  );
}

test("REAL API known validation: empty-file upload keeps curated feedback with proven outcome (no injection)", async ({
  page,
}) => {
  const name = `${STAMP}-empty.txt`;
  await gotoEvidence(page);

  // Synthetic EMPTY file through the real UI flow → real 422 from the API:
  // apps/api/app/services/source_service.py: "Uploaded file is empty."
  await uiUpload(page, name, "");

  const errorBox = page.getByTestId("upload-error");
  await expect(errorBox).toBeVisible({ timeout: 30_000 });
  await expect(errorBox).toContainText(`Upload failed for “${name}”`);
  // Trusted mapping fires: the curated validation reason is preserved as
  // authored UI copy (the exact allowlisted server sentence maps to it).
  await expect(errorBox).toContainText("The uploaded file was empty");
  await expect(errorBox).toContainText("Choose a file with content and try again");
  // Proven outcome (4xx): caller copy stays definitive — no hedging.
  await expect(errorBox).toContainText("was not added to the evidence list");
  expect(await errorBox.textContent()).not.toContain("not known whether");
  // Retry remains available and labelled for the attempted file.
  await expect(errorBox.getByRole("button", { name: `Retry upload of ${name}` })).toBeVisible();

  // And the real state matches the proven claim (Node-side read-back).
  const list = (await (await fetch(`${API}/sources`)).json()) as Array<{ title: string }>;
  expect(list.some((s) => s.title === titleOf(name))).toBe(false);
});

test("INJECTED arbitrary 4xx upload detail is not rendered; generic rejection + proven outcome kept [INJECTED 422]", async ({
  page,
}) => {
  const name = `${STAMP}-rej.txt`;
  const injected = `synthetic untrusted rejection ${STAMP} :: Traceback (most recent call last) SELECT * FROM secrets`;

  await page.route("**/api/v1/sources", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    // INJECTED: 4xx rejection whose detail is arbitrary untrusted text —
    // outcome is provably known, but the text must NOT reach the UI.
    return route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ detail: injected }),
    });
  });

  await gotoEvidence(page);
  await uiUpload(page, name, `Synthetic rejection fixture ${STAMP}\n`);

  const errorBox = page.getByTestId("upload-error");
  await expect(errorBox).toBeVisible({ timeout: 30_000 });
  await expect(errorBox).toContainText(`Upload failed for “${name}”`);
  const errorText = (await errorBox.textContent()) ?? "";
  expect(errorText, "untrusted detail text must not be rendered").not.toContain(
    `synthetic untrusted rejection ${STAMP}`,
  );
  expect(errorText).not.toMatch(/traceback|select\s+\*|secrets/i);
  expect(errorText, "generic rejection names the HTTP status").toContain(
    "The server rejected this request (HTTP 422)",
  );
  await expect(errorBox).toContainText("was not added to the evidence list");
  expect(errorText).not.toContain("not known whether");
});

test("INJECTED arbitrary 4xx row detail is not rendered; 'row unchanged' proven outcome kept [INJECTED 400]", async ({
  page,
}) => {
  const name = `${STAMP}-row-rej.txt`;
  const form = new FormData();
  form.append("file", new Blob([`Synthetic row rejection ${STAMP}\n`], { type: "text/plain" }), name);
  form.append("title", titleOf(name));
  const created = (await (
    await fetch(`${API}/sources`, { method: "POST", body: form })
  ).json()) as SourceRow;
  const stem = titleOf(name);

  const injected = `synthetic untrusted row rejection ${STAMP} :: INTERNAL PATH /srv/app/db.sql`;
  await page.route("**/api/v1/sources/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    // INJECTED: definite 4xx rejection, arbitrary detail text.
    return route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ detail: injected }),
    });
  });

  await gotoEvidence(page);
  await page.getByLabel("Search titles").fill(stem);
  const row = page.locator("tr", { hasText: name });
  await expect(row).toBeVisible({ timeout: 30_000 });

  await row.getByTestId(`include-${created.id}`).click();
  const rowError = page.getByTestId(`row-error-${created.id}`);
  await expect(rowError).toBeVisible({ timeout: 30_000 });
  await expect(rowError).toContainText(`Couldn’t include “${stem}”`);

  const rowText = (await rowError.textContent()) ?? "";
  expect(rowText, "untrusted detail text must not be rendered").not.toContain(
    `synthetic untrusted row rejection ${STAMP}`,
  );
  expect(rowText).not.toMatch(/INTERNAL PATH|db\.sql/i);
  expect(rowText, "generic rejection names the HTTP status").toContain(
    "The server rejected this request (HTTP 400)",
  );
  await expect(rowError).toContainText("The row is unchanged");
  expect(rowText).not.toContain("not known whether");

  // The row really is unchanged (Node-side read-back against the real API).
  const viaApi = (await (await fetch(`${API}/sources`)).json()) as SourceRow[];
  expect(viaApi.find((s) => s.id === created.id)?.included_flag).toBe(false);
});
