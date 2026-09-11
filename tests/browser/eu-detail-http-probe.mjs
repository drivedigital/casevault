// EU-D — evidence UI closure · HTTP-ONLY PROBE (no browser involved).
// docs/contracts/evidence_ui_closure.md v1.0 §EU-D.2.
//
// Verifies, against a REAL running API, the server-side facts the detail
// page's download/preview behavior depends on:
//   1. GET /sources/{id}/file answers 200 with `Content-Disposition:
//      attachment` and the original filename — i.e. anything that NAVIGATES
//      to it (the old <iframe src>) would download on page load.
//   2. The served bytes are byte-equal (sha256) to the uploaded synthetic
//      fixture, for every type (txt / pdf / png) — "preserves bytes".
//   3. POST /sources/{id}/reprocess answers 202 with the {queued, job_id,
//      reason} shape; with no Redis available it must report queued:false +
//      a reason (never a fabricated job).
//
// This is explicitly NOT browser proof: it proves the HTTP contract the
// browser tests rely on. Browser interactions are covered separately by
// tests/browser/eu-detail.spec.mjs (see tests/browser/eu-detail-README.md).
//
// Usage (run against a DISPOSABLE database — synthetic rows are created):
//   API_BASE_URL=http://localhost:8100 node tests/browser/eu-detail-http-probe.mjs
//
// Safety: refuses non-local API hosts unless EU_PROBE_CONFIRM_REMOTE=1.

import { syntheticFixtures, sha256 } from "./eu-detail-fixtures.mjs";

const API = process.env.API_BASE_URL ?? "http://localhost:8100";
const BASE = `${API}/api/v1`;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function check(label, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const host = new URL(API).host;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) && process.env.EU_PROBE_CONFIRM_REMOTE !== "1") {
    fail(`refusing non-local API host ${host} (set EU_PROBE_CONFIRM_REMOTE=1 to override)`);
    return;
  }

  const fixtures = syntheticFixtures();

  // --- upload all three synthetic types -----------------------------------
  const uploads = [];
  for (const [kind, fixture] of Object.entries(fixtures)) {
    const form = new FormData();
    form.append("file", new Blob([fixture.content], { type: fixture.contentType }), fixture.filename);
    form.append("title", `EU-D HTTP probe ${kind}`);
    const resp = await fetch(`${BASE}/sources`, { method: "POST", body: form });
    if (!resp.ok) {
      fail(`upload ${kind}: HTTP ${resp.status} ${await resp.text()}`);
      return;
    }
    const source = await resp.json();
    check(`upload ${kind} (${fixture.filename})`, resp.status === 201, `source ${source.id}`);
    uploads.push({ kind, fixture, source });
  }

  // --- download endpoint: attachment header, filename, byte equality ------
  for (const { kind, fixture, source } of uploads) {
    const resp = await fetch(`${BASE}/sources/${source.id}/file`);
    check(`GET file ${kind}: 200`, resp.status === 200, `got ${resp.status}`);
    const disposition = resp.headers.get("content-disposition") ?? "";
    check(
      `GET file ${kind}: attachment disposition`,
      /attachment/i.test(disposition),
      disposition || "(none)",
    );
    check(
      `GET file ${kind}: original filename preserved`,
      disposition.includes(fixture.filename),
      disposition,
    );
    const bytes = Buffer.from(await resp.arrayBuffer());
    const digest = sha256(bytes);
    check(
      `GET file ${kind}: byte-equal to uploaded fixture`,
      digest === fixture.sha256,
      `sha256 ${digest} vs ${fixture.sha256} (${bytes.length} bytes)`,
    );
  }

  // --- reprocess: 202 + honest queued:false without redis ------------------
  for (const { kind, source } of uploads) {
    const resp = await fetch(`${BASE}/sources/${source.id}/reprocess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stages: ["ocr"] }),
    });
    check(`POST reprocess ${kind}: 202`, resp.status === 202, `got ${resp.status}`);
    const body = await resp.json();
    const shapeOk =
      typeof body.queued === "boolean" &&
      (body.job_id === null || typeof body.job_id === "string") &&
      (body.reason === null || typeof body.reason === "string");
    check(`POST reprocess ${kind}: {queued, job_id, reason} shape`, shapeOk, JSON.stringify(body));
    if (body.queued === false) {
      check(
        `POST reprocess ${kind}: queued:false carries a reason`,
        typeof body.reason === "string" && body.reason.length > 0,
        String(body.reason),
      );
    } else {
      console.log(`note  POST reprocess ${kind}: queued=true (Redis/worker present) — job ${body.job_id}`);
    }
  }

  // --- detail sanity: source fields the UI renders -------------------------
  const { source } = uploads[0];
  const detail = await (await fetch(`${BASE}/sources/${source.id}`)).json();
  check(
    "GET source detail: processing/ocr status fields present",
    typeof detail.processing_status === "string" && typeof detail.ocr_status === "string",
    `processing=${detail.processing_status} ocr=${detail.ocr_status}`,
  );
  check(
    "GET source detail: source_status vocabulary",
    ["primary", "derived", "testimony", "working_note", "public_record"].includes(detail.source_status),
    detail.source_status,
  );

  console.log(process.exitCode ? "\nHTTP PROBE: FAILURES (see above)" : "\nHTTP PROBE: all checks passed");
}

main().catch((err) => {
  fail(`probe crashed: ${err?.stack ?? err}`);
});
