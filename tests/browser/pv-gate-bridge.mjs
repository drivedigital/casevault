// PV-GATE — ground-truth bridge for the independent owner-preview gate.
//
// The browser spec proves what the USER SEES; this helper reads the other two
// layers of the same running stack so a claim can be correlated by exact ID:
//
//   API 202 {queued, job_id}  ->  RQ job (decoded with rq's OWN API)  ->
//   sources / source_pages / source_metadata rows  ->  UI text
//
// Deliberate properties (integrator review 2026-09-12, comment 5649551113):
//   * RQ jobs are decoded with `rq.job.Job.fetch()` / `get_status()` /
//     `.result` — rq's supported deserialization — never by hand-parsing raw
//     redis payload bytes. The decoded payload records which API was used.
//   * NO synchronous child process: `execFileSync` would block the Node event
//     loop, so a Playwright timeout could never interrupt a stuck read. Every
//     read runs in an async `spawn` child with (a) a hard wall-clock timeout
//     that SIGKILLs the child, (b) explicit cancellation propagation through
//     an AbortSignal, and (c) the child in the parent's process group so it
//     cannot outlive the runner as an orphan.
//   * The Python side bounds its own I/O: Postgres `connect_timeout` plus
//     `statement_timeout`/`lock_timeout`, and redis socket connect/read
//     timeouts, so a hung server cannot hold the child open either.
//   * Child stdout/stderr are NEVER copied into errors verbatim: only a
//     bounded (<=240 char) excerpt with credential-shaped text redacted, so a
//     misconfigured URL or a row leaked by a traceback cannot enter a log.
//   * The stored-file read validates containment inside LOCAL_STORAGE_ROOT
//     (resolved, symlink-aware) before reading any bytes.
//   * Nothing here has a default that could silently point at a real case
//     database or queue: PV_GATE_DATABASE_URL and PV_GATE_REDIS_URL must be
//     set explicitly, otherwise the helper throws before touching anything.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const REPO = REPO_ROOT;

/** Hard bound for one ground-truth read. Override with PV_GATE_BRIDGE_TIMEOUT_MS. */
export const BRIDGE_TIMEOUT_MS = Number(process.env.PV_GATE_BRIDGE_TIMEOUT_MS ?? 20_000);
/** Server-side bound for SQL statements and the redis socket (seconds). */
const SQL_TIMEOUT_MS = Number(process.env.PV_GATE_SQL_TIMEOUT_MS ?? 5_000);
const REDIS_SOCKET_TIMEOUT_S = Number(process.env.PV_GATE_REDIS_TIMEOUT_S ?? 3);

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

/**
 * Redact credential-shaped text and bound the length. Used for any child
 * output that could reach a log or an error message.
 */
export function sanitize(text, limit = 240) {
  let out = String(text ?? "");
  out = out.replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/@\s]+@/g, "$1***@"); // user:pass@host
  out = out.replace(
    /\b(password|passwd|secret|token|api[_-]?key|authorization)\b\s*[=:]\s*\S+/gi,
    "$1=***",
  );
  out = out.replace(/\s+/g, " ").trim();
  return out.length > limit ? `${out.slice(0, limit)}…[truncated]` : out;
}

/**
 * Run one bounded Python ground-truth read.
 *
 * @param {string} source  Python program text (piped on stdin, no temp file).
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<string>} the child's stdout
 */
function runPython(source, opts = {}) {
  const env = {
    ...process.env,
    PYTHONUNBUFFERED: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PV_GATE_DATABASE_URL: requireEnv("PV_GATE_DATABASE_URL"),
    PV_GATE_REDIS_URL: requireEnv("PV_GATE_REDIS_URL"),
    PV_GATE_SQL_TIMEOUT_MS: String(SQL_TIMEOUT_MS),
    PV_GATE_REDIS_TIMEOUT_S: String(REDIS_SOCKET_TIMEOUT_S),
  };

  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new Error("[pv-gate-bridge] read cancelled before it started"));
      return;
    }

    const child = spawn(pythonBin(), ["-"], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
      // Same process group: the child cannot survive as an orphan of the runner.
      detached: false,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let killReason = null;

    const timer = setTimeout(() => {
      killReason = `hard timeout after ${BRIDGE_TIMEOUT_MS}ms`;
      child.kill("SIGKILL");
    }, BRIDGE_TIMEOUT_MS);

    const onAbort = () => {
      killReason = "cancelled";
      child.kill("SIGKILL");
    };
    if (opts.signal) opts.signal.addEventListener("abort", onAbort, { once: true });

    const cleanup = () => {
      clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`[pv-gate-bridge] cannot start ${pythonBin()}: ${sanitize(err.message)}`));
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (killReason) {
        reject(
          new Error(
            `[pv-gate-bridge] ground-truth read ${killReason} (child ${signal ?? code}); ` +
              `no partial result is reported. stderr: ${sanitize(stderr) || "(none)"}`,
          ),
        );
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            `[pv-gate-bridge] ground-truth read failed (exit ${code}). ` +
              `stderr: ${sanitize(stderr) || "(none)"} | stdout: ${sanitize(stdout) || "(none)"}`,
          ),
        );
        return;
      }
      resolve(stdout);
    });

    // The program itself carries no secrets; env vars are inherited, not echoed.
    child.stdin.end(source);
  });
}

function parseJson(out) {
  const text = String(out ?? "").trim();
  const lastLine = text.split("\n").filter(Boolean).pop() ?? "";
  try {
    return JSON.parse(lastLine);
  } catch {
    throw new Error(`[pv-gate-bridge] expected a JSON line, got: ${sanitize(text)}`);
  }
}

/** Shared Python preamble: bounded SQL + redis connections, containment check. */
function preamble() {
  return `
import hashlib, json, os, pathlib, sys
from sqlalchemy import create_engine, text

SQL_TIMEOUT_MS = int(os.environ["PV_GATE_SQL_TIMEOUT_MS"])
REDIS_TIMEOUT_S = float(os.environ["PV_GATE_REDIS_TIMEOUT_S"])


def connect_db():
    """Postgres connection with connect + statement/lock timeouts."""
    engine = create_engine(
        os.environ["PV_GATE_DATABASE_URL"],
        connect_args={"connect_timeout": max(1, SQL_TIMEOUT_MS // 1000)},
    )
    conn = engine.connect()
    conn.execute(text(f"SET statement_timeout = {SQL_TIMEOUT_MS}"))
    conn.execute(text(f"SET lock_timeout = {SQL_TIMEOUT_MS // 2}"))
    conn.execute(text(f"SET idle_in_transaction_session_timeout = {SQL_TIMEOUT_MS}"))
    return conn


def redis_conn():
    """Redis connection with connect/read socket timeouts."""
    import redis
    return redis.Redis.from_url(
        os.environ["PV_GATE_REDIS_URL"],
        socket_connect_timeout=REDIS_TIMEOUT_S,
        socket_timeout=REDIS_TIMEOUT_S,
    )


def stored_file_state(relative_path):
    """sha256/size of the stored original, ONLY after proving containment.

    The configured root is resolved (symlinks included) and the candidate path
    must live inside it; anything else is reported, never read.
    """
    root_env = os.environ.get("LOCAL_STORAGE_ROOT")
    if not root_env:
        return {"skipped": "LOCAL_STORAGE_ROOT not set"}
    root = pathlib.Path(root_env).resolve()
    candidate = (root / pathlib.Path(relative_path)).resolve()
    state = {"path_under_root": str(relative_path), "storage_root_resolved": str(root)}
    try:
        candidate.relative_to(root)
    except ValueError:
        state["outside_storage_root"] = True
        state["resolved_path_shown"] = False
        return state
    state["resolved_path_shown"] = True
    if not candidate.is_file():
        state["missing"] = True
        return state
    data = candidate.read_bytes()
    state["size_bytes"] = len(data)
    state["sha256"] = hashlib.sha256(data).hexdigest()
    return state


def emit(payload):
    print(json.dumps(payload, default=str))
`;
}

/**
 * Decode one RQ job through rq's own API.
 *
 * @param {string} jobId
 * @param {{signal?: AbortSignal}} [opts] cancellation (kills the child process)
 * @returns {Promise<object>} {id, status, origin, func_name, args, kwargs,
 *   result, exc_info, enqueued_at, started_at, ended_at, decoded_via}
 */
export function decodeRqJob(jobId, opts = {}) {
  const source = `${preamble()}
from rq.job import Job

conn = redis_conn()
job = Job.fetch(${JSON.stringify(String(jobId))}, connection=conn)
status = job.get_status()
emit({
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
})
`;
  return runPython(source, opts).then(parseJson);
}

/**
 * Read the exact-ID database state for one source, plus the sha256 of the
 * original bytes actually stored on disk for that row (containment-checked).
 *
 * @param {string} sourceId
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<object>} {source, pages, metadata, stored_file}
 */
export function sqlSourceState(sourceId, opts = {}) {
  const source = `${preamble()}
sid = ${JSON.stringify(String(sourceId))}
conn = connect_db()
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
    value = page["ocr_text"] or ""
    page_out.append({
        "id": page["id"],
        "page_number": page["page_number"],
        "page_label": page["page_label"],
        "ocr_text_sha256": hashlib.sha256(value.encode()).hexdigest(),
        "ocr_text_len": len(value),
        "ocr_head": value[:60],
        "ocr_tail": value[-40:],
    })

emit({
    "source": dict(row) if row else None,
    "pages": page_out,
    "metadata": meta,
    "stored_file": stored_file_state(row["storage_path"]) if row and row["storage_path"] else None,
})
`;
  return runPython(source, opts).then(parseJson);
}
