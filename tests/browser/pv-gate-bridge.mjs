// PV-GATE — ground-truth bridge for the independent owner-preview gate.
//
// The browser spec proves what the USER SEES; this helper reads the other two
// layers of the same running stack so a claim can be correlated by exact ID:
//
//   API 202 {queued, job_id}  ->  RQ job (decoded with rq's OWN API)  ->
//   sources / source_pages / source_metadata rows  ->  UI text
//
// Two deliberate choices:
//   1. RQ jobs are decoded with `rq.job.Job.fetch()` / `get_status()` /
//      `.result` — rq's supported deserialization — never by hand-parsing raw
//      redis payload bytes. The decoded payload records which API was used.
//   2. Nothing here has a default that could silently point at a real case
//      database or queue: PV_GATE_DATABASE_URL and PV_GATE_REDIS_URL must be
//      set explicitly, otherwise the helper throws before touching anything.
//
// The Python side runs in the repository venv (PV_GATE_PYTHON overrides the
// interpreter); the script text is piped on stdin, so no temporary file is
// created and no repository file outside tests/browser/pv-gate-* is touched.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const REPO = REPO_ROOT;

/** Absolute path of the interpreter used for ground-truth reads. */
export function pythonBin() {
  return process.env.PV_GATE_PYTHON ?? path.join(REPO_ROOT, ".venv", "bin", "python");
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[pv-gate-bridge] ${name} is not set. Point it at the DISPOSABLE PV-GATE ` +
        `database/queue explicitly; this helper refuses to guess.`,
    );
  }
  return value;
}

function runPython(source, extraEnv = {}) {
  try {
    return execFileSync(pythonBin(), ["-"], {
      input: source,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        PV_GATE_DATABASE_URL: requireEnv("PV_GATE_DATABASE_URL"),
        PV_GATE_REDIS_URL: requireEnv("PV_GATE_REDIS_URL"),
        ...extraEnv,
      },
    });
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr) : "";
    const stdout = err.stdout ? String(err.stdout) : "";
    throw new Error(
      `[pv-gate-bridge] python ground-truth read failed (exit ${err.status ?? "?"})\n` +
        `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`,
    );
  }
}

function parseJson(out) {
  const text = out.trim();
  const lastLine = text.split("\n").filter(Boolean).pop() ?? "";
  try {
    return JSON.parse(lastLine);
  } catch {
    throw new Error(`[pv-gate-bridge] expected a JSON line, got:\n${out}`);
  }
}

/**
 * Decode one RQ job through rq's own API.
 *
 * @returns {Promise<object>|object} {id, status, origin, func_name, args,
 *   kwargs, result, exc_info, enqueued_at, started_at, ended_at,
 *   decoded_via}
 */
export function decodeRqJob(jobId) {
  const source = `
import json, os
import redis
from rq.job import Job

conn = redis.Redis.from_url(os.environ["PV_GATE_REDIS_URL"])
job = Job.fetch(${JSON.stringify(String(jobId))}, connection=conn)
status = job.get_status()
payload = {
    "id": job.id,
    "status": getattr(status, "value", str(status)),
    "origin": job.origin,
    "func_name": job.func_name,
    "args": list(job.args or []),
    "kwargs": dict(job.kwargs or {}),
    "result": job.result,
    "exc_info": (job.exc_info or "")[:400],
    "enqueued_at": str(job.enqueued_at),
    "started_at": str(job.started_at),
    "ended_at": str(job.ended_at),
    "decoded_via": "rq.job.Job.fetch + get_status + result",
}
print(json.dumps(payload, default=str))
`;
  return parseJson(runPython(source));
}

/**
 * Read the exact-ID database state for one source, plus the sha256 of the
 * original bytes actually stored on disk for that row.
 *
 * @returns {object} {source, pages, metadata, stored_file}
 */
export function sqlSourceState(sourceId) {
  const source = `
import hashlib, json, os, pathlib
from sqlalchemy import create_engine, text

engine = create_engine(os.environ["PV_GATE_DATABASE_URL"])
sid = ${JSON.stringify(String(sourceId))}
with engine.connect() as conn:
    row = conn.execute(text("""
        select id, title, source_type, source_status, original_filename, mime_type,
               sha256, file_size_bytes, processing_status, ocr_status, page_count,
               included_flag, excluded_flag, evidence_review_status,
               storage_path, created_at, updated_at
        from sources where id = :i
    """), {"i": sid}).mappings().first()
    pages = conn.execute(text("""
        select id, page_number, page_label, coalesce(ocr_text, '') as ocr_text
        from source_pages where source_id = :i order by page_number
    """), {"i": sid}).mappings().all()
    meta = conn.execute(
        text("select metadata_json from source_metadata where source_id = :i"), {"i": sid}
    ).scalar()

page_out = []
for page in pages:
    text_value = page["ocr_text"] or ""
    page_out.append({
        "id": page["id"],
        "page_number": page["page_number"],
        "page_label": page["page_label"],
        "ocr_text_sha256": hashlib.sha256(text_value.encode()).hexdigest(),
        "ocr_text_len": len(text_value),
        "ocr_head": text_value[:60],
        "ocr_tail": text_value[-40:],
    })

stored = None
root = os.environ.get("LOCAL_STORAGE_ROOT")
if root and row and row["storage_path"]:
    abs_path = pathlib.Path(root) / row["storage_path"]
    if abs_path.is_file():
        data = abs_path.read_bytes()
        stored = {
            "path_under_root": str(pathlib.Path(row["storage_path"])),
            "size_bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
    else:
        stored = {"path_under_root": str(row["storage_path"]), "missing": True}

print(json.dumps({
    "source": dict(row) if row else None,
    "pages": page_out,
    "metadata": meta,
    "stored_file": stored,
}, default=str))
`;
  return parseJson(runPython(source));
}
