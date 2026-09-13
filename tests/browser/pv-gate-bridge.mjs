// PV-GATE — ground-truth bridge for the independent owner-preview gate.
//
// The browser spec proves what the USER SEES; this helper reads the other two
// layers of the same running stack so a claim can be correlated by exact ID:
//
//   API 202 {queued, job_id}  ->  RQ job (decoded with rq's OWN API)  ->
//   sources / source_pages / source_metadata rows  ->  UI text
//
// Deliberate properties:
//   * RQ jobs are decoded with `rq.job.Job.fetch()` / `get_status()` /
//     `.result` — rq's supported deserialization — never by hand-parsing raw
//     redis payload bytes. The decoded payload records which API was used.
//   * NO synchronous child process: `execFileSync` would block the Node event
//     loop, so a Playwright timeout could never interrupt a stuck read. Every
//     read runs in an async `spawn` child with a hard wall-clock timeout that
//     SIGKILLs the child, explicit AbortSignal cancellation, and bounded
//     stdout/stderr accumulation (cap => SIGKILL + fixed failure).
//   * THE PYTHON SIDE BOUNDS ITS OWN I/O: Postgres `connect_timeout` plus
//     `statement_timeout`/`lock_timeout`/`idle_in_transaction_session_timeout`
//     and redis socket connect/read timeouts, so a hung server cannot hold the
//     child open either.
//   * ERRORS CARRY FIXED REASON CODES AND BOUNDED NUMERIC STATUS ONLY. Child
//     output is NEVER part of a thrown error, not even a regex-"redacted"
//     excerpt: the integrator demonstrated (comment 5649650869) that a
//     sanitizer cannot remove arbitrary diagnostics — a synthetic
//     `{"password": "SYNTHETIC_SENTINEL"}` or plain trace text survives any
//     credential-shaped regex. Code + exit/signal/byte counts are safe to log;
//     the payloads are not. `PV_GATE_BRIDGE_PRIVATE_DIAGNOSTICS=<file>` is an
//     explicit opt-in that writes raw child output to a mode-0600 local file
//     for private debugging only — it is unset by default and never used by
//     the tests (`tests/browser/pv-gate-negative-checks.mjs` asserts that no
//     sentinel reaches an error message).
//   * The stored-file read validates containment inside LOCAL_STORAGE_ROOT
//     (resolved, symlink-aware) before reading any bytes.
//   * Nothing here has a default that could silently point at a real case
//     database or queue: PV_GATE_DATABASE_URL and PV_GATE_REDIS_URL must be
//     set explicitly, otherwise the helper throws before touching anything.

import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const REPO = REPO_ROOT;

/** Hard bound for one ground-truth read. Override with PV_GATE_BRIDGE_TIMEOUT_MS. */
export const BRIDGE_TIMEOUT_MS = Number(process.env.PV_GATE_BRIDGE_TIMEOUT_MS ?? 20_000);
/** Cap on accumulated stdout/stderr per child (bytes); exceeding it kills the child. */
export const MAX_OUTPUT_BYTES = Number(
  process.env.PV_GATE_MAX_OUTPUT_BYTES ?? 1_048_576,
);
/** Server-side bound for SQL statements and the redis socket (milliseconds/seconds). */
const SQL_TIMEOUT_MS = Number(process.env.PV_GATE_SQL_TIMEOUT_MS ?? 5_000);
const REDIS_SOCKET_TIMEOUT_S = Number(process.env.PV_GATE_REDIS_TIMEOUT_S ?? 3);

/**
 * Fixed public failure codes. Every error thrown by this helper is exactly one
 * of these plus bounded numeric/status fields — never child output.
 */
export const BRIDGE_CODES = Object.freeze({
  ENV_MISSING_DB: "PVGATE_BRIDGE_ENV_MISSING_DB",
  ENV_MISSING_REDIS: "PVGATE_BRIDGE_ENV_MISSING_REDIS",
  CANCELLED_BEFORE_START: "PVGATE_BRIDGE_CANCELLED_BEFORE_START",
  START_FAILED: "PVGATE_BRIDGE_CHILD_START_FAILED",
  CHILD_TIMEOUT: "PVGATE_BRIDGE_CHILD_TIMEOUT",
  CHILD_CANCELLED: "PVGATE_BRIDGE_CHILD_CANCELLED",
  CHILD_EXIT_NONZERO: "PVGATE_BRIDGE_CHILD_EXIT_NONZERO",
  CHILD_SIGNAL: "PVGATE_BRIDGE_CHILD_SIGNAL",
  STDIN_ERROR: "PVGATE_BRIDGE_CHILD_STDIN_ERROR",
  STDOUT_OVERFLOW: "PVGATE_BRIDGE_STDOUT_OVERFLOW",
  STDERR_OVERFLOW: "PVGATE_BRIDGE_STDERR_OVERFLOW",
  INVALID_JSON: "PVGATE_BRIDGE_INVALID_JSON",
  EMPTY_OUTPUT: "PVGATE_BRIDGE_EMPTY_OUTPUT",
});

/** Error type carrying only a fixed reason code and bounded numeric status. */
export class BridgeError extends Error {
  constructor(code, detail = {}) {
    const parts = Object.entries(detail)
      .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
      .map(([key, value]) => `${key}=${value}`);
    const codeOnly = Object.entries(detail)
      .filter(([, value]) => typeof value === "string" && /^[A-Z][A-Z0-9_]{1,31}$/.test(value))
      .map(([key, value]) => `${key}=${value}`);
    const suffix = [...codeOnly, ...parts].join(" ");
    super(`[pv-gate-bridge] ${code}${suffix ? ` (${suffix})` : ""}`);
    this.name = "BridgeError";
    this.code = code;
    this.detail = Object.freeze({ ...detail });
  }
}

/** Absolute path of the interpreter used for ground-truth reads. */
export function pythonBin() {
  return process.env.PV_GATE_PYTHON ?? path.join(REPO_ROOT, ".venv", "bin", "python");
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new BridgeError(
      name === "PV_GATE_DATABASE_URL" ? BRIDGE_CODES.ENV_MISSING_DB : BRIDGE_CODES.ENV_MISSING_REDIS,
    );
  }
  return value;
}

/**
 * Test-only fault injection. Unset (the default) for every real run; set only by
 * tests/browser/pv-gate-negative-checks.mjs to exercise the failure paths with
 * synthetic payloads. It replaces the program the child would run.
 */
function faultProgram() {
  const fault = (process.env.PV_GATE_FAULT ?? "").trim();
  if (!fault) return null;
  switch (fault) {
    case "json_sentinel":
      // Valid-first-line, invalid-last-line output containing sentinels.
      return [
        "print('plain synthetic trace text {\"password\": \"SYNTHETIC_SENTINEL\"}')",
        "print('TRAILING NOT JSON SYNTHETIC_SENTINEL')",
      ].join("\n");
    case "stderr_sentinel":
      return [
        "import sys",
        "sys.stdout.write('SYNTHETIC_SENTINEL stdout trace\\n')",
        "sys.stderr.write('SYNTHETIC_SENTINEL stderr trace\\n')",
        "sys.exit(3)",
      ].join("\n");
    case "overflow_stdout":
      return [
        "import sys, time",
        `sys.stdout.write('B' * ${MAX_OUTPUT_BYTES + 65_536})`,
        "sys.stdout.flush()",
        "time.sleep(60)",
      ].join("\n");
    case "stdin_epipe":
      // Padding only: the program is written to a child that (in the negative
      // check) is NOT a python interpreter reading stdin — a program larger
      // than the pipe buffer makes the parent's write hit a closed pipe, which
      // must surface as the fixed STDIN_ERROR failure.
      return `# ${"P".repeat(MAX_OUTPUT_BYTES + 65_536)}`;
    default:
      throw new BridgeError("PVGATE_BRIDGE_UNKNOWN_FAULT", { fault_name: "UNKNOWN_FAULT" });
  }
}

/**
 * Opt-in, private raw diagnostics. Default: child output is discarded on
 * failure (never thrown, never logged). When PV_GATE_BRIDGE_PRIVATE_DIAGNOSTICS
 * names a file, a bounded excerpt is appended there with mode 0600 for local
 * debugging only.
 */
function writePrivateDiagnostics(entry) {
  const target = process.env.PV_GATE_BRIDGE_PRIVATE_DIAGNOSTICS;
  if (!target) return;
  try {
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    appendFileSync(target, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  } catch {
    /* diagnostics must never break a read */
  }
}

// Children currently spawned by this module. Killed best-effort when the runner
// exits. See the orphan note in runPython(): this is a mitigation, not a promise.
const liveChildren = new Set();
process.once("exit", () => {
  for (const child of liveChildren) {
    try {
      child.kill("SIGKILL");
    } catch {
      /* process already gone */
    }
  }
});

/**
 * Run one bounded Python ground-truth read.
 *
 * Orphan behaviour, stated exactly (integrator review 2026-09-12): children are
 * spawned in the parent's process group and `detached:false` does NOT by itself
 * guarantee that a child dies if this parent dies — a hard SIGKILL of the runner
 * can leave a short-lived re-parented process (no portable pdeathsig is
 * available in this stack). What this module actually provides: SIGKILL on
 * timeout/cancel/output-overflow/stdin-error, a best-effort kill in the `exit`
 * handler, and server-side timeouts inside the child so an orphan cannot hold a
 * database or redis connection open indefinitely. No hard no-orphan guarantee
 * is claimed or implied.
 *
 * @param {string} source  Python program text (piped on stdin, no temp file).
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<string>} the child's stdout
 */
async function runPython(source, opts = {}) {
  const env = {
    ...process.env,
    PYTHONUNBUFFERED: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PV_GATE_DATABASE_URL: requireEnv("PV_GATE_DATABASE_URL"),
    PV_GATE_REDIS_URL: requireEnv("PV_GATE_REDIS_URL"),
    PV_GATE_SQL_TIMEOUT_MS: String(SQL_TIMEOUT_MS),
    PV_GATE_REDIS_TIMEOUT_S: String(REDIS_SOCKET_TIMEOUT_S),
  };
  const program = faultProgram() ?? source;

  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new BridgeError(BRIDGE_CODES.CANCELLED_BEFORE_START, {}));
      return;
    }

    const startedAt = Date.now();
    const child = spawn(pythonBin(), ["-"], { env, stdio: ["pipe", "pipe", "pipe"] });
    liveChildren.add(child);

    let stdout = "";
    let stderr = "";
    let stdoutTotal = 0;
    let stderrTotal = 0;
    let osCode = null;
    let settled = false;
    let killCode = null;

    const kill = (code) => {
      killCode ??= code;
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    };

    const timer = setTimeout(() => kill(BRIDGE_CODES.CHILD_TIMEOUT), BRIDGE_TIMEOUT_MS);
    const onAbort = () => kill(BRIDGE_CODES.CHILD_CANCELLED);
    if (opts.signal) opts.signal.addEventListener("abort", onAbort, { once: true });

    const cleanup = () => {
      clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
      liveChildren.delete(child);
    };

    const finish = (code, detail) => {
      if (settled) return;
      settled = true;
      cleanup();
      // Bounded numeric status + fixed-shape OS codes only — never output text.
      const enriched = {
        elapsed_ms: Date.now() - startedAt,
        stdout_bytes: stdout.length,
        stderr_bytes: stderr.length,
        stdout_total_bytes: stdoutTotal,
        stderr_total_bytes: stderrTotal,
        ...(osCode ? { os_code: osCode } : {}),
        ...detail,
      };
      writePrivateDiagnostics({
        at: new Date().toISOString(),
        code,
        ...enriched,
        // Bounded excerpt, private file only (never part of the error).
        stdout_excerpt: stdout.slice(0, 2048),
        stderr_excerpt: stderr.slice(0, 2048),
      });
      reject(new BridgeError(code, enriched));
    };

    // Bounded accumulation: memory never exceeds MAX_OUTPUT_BYTES per stream; the
    // byte counter keeps counting, and crossing the cap kills the child.
    const accumulate = (stream, chunk) => {
      const limit = MAX_OUTPUT_BYTES;
      if (stream === "stdout") {
        stdoutTotal += chunk.length;
        if (stdout.length < limit) stdout += chunk.subarray(0, limit - stdout.length).toString("utf8");
        if (stdoutTotal > limit) kill(BRIDGE_CODES.STDOUT_OVERFLOW);
      } else {
        stderrTotal += chunk.length;
        if (stderr.length < limit) stderr += chunk.subarray(0, limit - stderr.length).toString("utf8");
        if (stderrTotal > limit) kill(BRIDGE_CODES.STDERR_OVERFLOW);
      }
    };

    child.stdout.on("data", (chunk) => accumulate("stdout", chunk));
    child.stderr.on("data", (chunk) => accumulate("stderr", chunk));

    // A stdin failure (EPIPE on an early-exiting child, etc.) is a fixed failure,
    // never a silent hang and never an echoed system message.
    child.stdin.on("error", (err) => {
      osCode = typeof err?.code === "string" && /^[A-Z][A-Z0-9_]{1,31}$/.test(err.code) ? err.code : "STDIN_ERROR";
      kill(BRIDGE_CODES.STDIN_ERROR);
    });

    child.on("error", (err) => {
      osCode = typeof err?.code === "string" && /^[A-Z][A-Z0-9_]{1,31}$/.test(err.code) ? err.code : "START_FAILED";
      const errno = typeof err?.errno === "number" ? err.errno : undefined;
      finish(BRIDGE_CODES.START_FAILED, { ...(errno === undefined ? {} : { errno }) });
    });

    child.on("close", (code, signal) => {
      if (killCode) {
        finish(killCode, {
          ...(code === null || code === undefined ? {} : { exit_code: code }),
          ...(signal ? { signal_name: signal } : {}),
        });
        return;
      }
      if (code !== 0) {
        finish(
          code === null && signal ? BRIDGE_CODES.CHILD_SIGNAL : BRIDGE_CODES.CHILD_EXIT_NONZERO,
          {
            ...(code === null ? {} : { exit_code: code }),
            ...(signal ? { signal_name: signal } : {}),
          },
        );
        return;
      }
      if (stdout.trim() === "") {
        // One bounded grace turn: an EPIPE from our own stdin write may still be
        // pending on the event loop, and misreporting it as "empty output" would
        // hide the real failure. The timer always fires, so this cannot hang.
        setTimeout(() => finish(killCode ?? BRIDGE_CODES.EMPTY_OUTPUT, {}), 25);
        return;
      }
      settled = true;
      cleanup();
      resolve(stdout);
    });

    try {
      child.stdin.end(program, (err) => {
        if (!err) return;
        osCode = typeof err?.code === "string" && /^[A-Z][A-Z0-9_]{1,31}$/.test(err.code) ? err.code : "STDIN_ERROR";
        kill(BRIDGE_CODES.STDIN_ERROR);
      });
    } catch (err) {
      osCode = typeof err?.code === "string" && /^[A-Z][A-Z0-9_]{1,31}$/.test(err.code) ? err.code : "STDIN_ERROR";
      kill(BRIDGE_CODES.STDIN_ERROR);
    }
  });
}

/** Parse the child's last stdout line as JSON without ever echoing its content. */
function parseJson(out) {
  const text = String(out ?? "");
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const lastLine = lines[lines.length - 1] ?? "";
  if (!lastLine) throw new BridgeError(BRIDGE_CODES.EMPTY_OUTPUT, { stdout_bytes: text.length });
  try {
    return JSON.parse(lastLine);
  } catch {
    throw new BridgeError(BRIDGE_CODES.INVALID_JSON, { stdout_bytes: text.length });
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
