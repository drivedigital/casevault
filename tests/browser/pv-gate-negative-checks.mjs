// PV-GATE — synthetic negative checks for the ground-truth bridge failure paths.
//
// Requested by the integrator (PR20 comment 5649650869) after an independent
// import of the helper showed that a regex "sanitizer" cannot remove arbitrary
// diagnostics: a synthetic `{"password": "SYNTHETIC_SENTINEL"}` and plain
// trace text survived it. The revised bridge throws FIXED REASON CODES plus
// bounded numeric/OS status only, so these checks assert non-disclosure, the
// output caps, safe stdin handling and cancellation — with synthetic payloads
// and no database, queue, browser or case data.
//
// Run:  node tests/browser/pv-gate-negative-checks.mjs
// Exit: 0 = all checks passed, 1 = a check failed (each prints code + numbers).
// This file is NOT collected by Playwright (testMatch is `pv-gate-*.spec.mjs`)
// and is not part of the three-test preview gate.

import { BRIDGE_CODES, BridgeError, decodeRqJob, sqlSourceState, MAX_OUTPUT_BYTES } from "./pv-gate-bridge.mjs";

const SENTINEL = "SYNTHETIC_SENTINEL";
const results = [];

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then((detail) => results.push({ name, ok: true, detail }))
    .catch((err) => results.push({ name, ok: false, detail: err?.message ?? String(err) }));
}

function expectError(promise, expectedCode, { forbid = [SENTINEL], note = "" } = {}) {
  return promise.then(
    () => {
      throw new Error(`expected ${expectedCode}, but the call succeeded`);
    },
    (err) => {
      if (!(err instanceof BridgeError)) throw new Error(`expected BridgeError, got ${err?.name}: ${err?.message}`);
      if (err.code !== expectedCode) throw new Error(`expected ${expectedCode}, got ${err.code}`);
      for (const needle of forbid) {
        if (err.message.includes(needle) || JSON.stringify(err.detail).includes(needle)) {
          throw new Error(`DISCLOSURE: ${needle} appeared in the error (${err.code})`);
        }
      }
      const detail = err.detail ?? {};
      const numeric = Object.entries(detail).filter(([, v]) => typeof v === "number");
      const nonNumericStrings = Object.entries(detail).filter(
        ([, v]) => typeof v === "string" && !/^[A-Z][A-Z0-9_]{1,31}$/.test(v),
      );
      if (nonNumericStrings.length) {
        throw new Error(`non-code string in detail: ${JSON.stringify(nonNumericStrings)}`);
      }
      return {
        code: err.code,
        ...(typeof detail.elapsed_ms === "number" ? { elapsed_ms: detail.elapsed_ms } : {}),
        ...(typeof detail.exit_code === "number" ? { exit_code: detail.exit_code } : {}),
        ...(detail.signal_name ? { signal_name: detail.signal_name } : {}),
        ...(detail.os_code ? { os_code: detail.os_code } : {}),
        ...(typeof detail.stdout_bytes === "number" ? { stdout_bytes: detail.stdout_bytes } : {}),
        ...(typeof detail.stdout_total_bytes === "number"
          ? { stdout_total_bytes: detail.stdout_total_bytes }
          : {}),
        numeric_field_count: numeric.length,
        message_bytes: Buffer.byteLength(err.message, "utf8"),
        ...(note ? { note } : {}),
      };
    },
  );
}

// The checks never touch a real service: fault programs short-circuit before any
// connection, and these synthetic URLs only satisfy the helper's explicit-env rule.
process.env.PV_GATE_DATABASE_URL ??= "postgresql://pv-gate-synthetic@127.0.0.1:1/none";
process.env.PV_GATE_REDIS_URL ??= "redis://127.0.0.1:1/0";
delete process.env.PV_GATE_BRIDGE_PRIVATE_DIAGNOSTICS; // assert: no raw output anywhere

const FAULT = (name) => {
  process.env.PV_GATE_FAULT = name;
};

// 1. Invalid JSON whose payload contains the sentinel — parse errors must not echo it.
await check("json/parse error carries a fixed code, no payload", () => {
  FAULT("json_sentinel");
  return expectError(decodeRqJob("00000000-0000-0000-0000-000000000000"), BRIDGE_CODES.INVALID_JSON);
});

// 2. Non-zero exit with sentinel trace text on BOTH streams.
await check("non-zero exit: code + numeric exit, no trace text", () => {
  FAULT("stderr_sentinel");
  return expectError(sqlSourceState("00000000-0000-0000-0000-000000000000"), BRIDGE_CODES.CHILD_EXIT_NONZERO);
});

// 3. Runaway stdout: bounded memory, child killed, fixed overflow code.
await check("stdout over cap: killed, bounded buffer, fixed code", () => {
  FAULT("overflow_stdout");
  return expectError(sqlSourceState("00000000-0000-0000-0000-000000000000"), BRIDGE_CODES.STDOUT_OVERFLOW).then(
    (detail) => {
      if (detail.stdout_bytes > MAX_OUTPUT_BYTES) {
        throw new Error(`accumulated stdout ${detail.stdout_bytes} exceeded cap ${MAX_OUTPUT_BYTES}`);
      }
      if (detail.stdout_total_bytes <= MAX_OUTPUT_BYTES) {
        throw new Error(`expected the child to overrun the cap, saw ${detail.stdout_total_bytes}`);
      }
      if (detail.message_bytes > 512) {
        throw new Error(`error message grew to ${detail.message_bytes} bytes`);
      }
      return { ...detail, cap_bytes: MAX_OUTPUT_BYTES };
    },
  );
});

// 4. Child that exits without reading stdin: the oversized write hits a closed
//    pipe, which must surface as the fixed STDIN_ERROR code. /bin/true is a real
//    process that never reads stdin (the fault only pads the program past the
//    pipe buffer); no data is processed and no interpreter state is involved.
await check("stdin error on closed pipe: fixed code", () => {
  FAULT("stdin_epipe");
  const previous = process.env.PV_GATE_PYTHON;
  process.env.PV_GATE_PYTHON = "/bin/true";
  return expectError(sqlSourceState("00000000-0000-0000-0000-000000000000"), BRIDGE_CODES.STDIN_ERROR).finally(
    () => {
      if (previous === undefined) delete process.env.PV_GATE_PYTHON;
      else process.env.PV_GATE_PYTHON = previous;
    },
  );
});

// 5. Cancellation before start (per-test abort path).
await check("pre-aborted signal: fixed cancellation code", () => {
  delete process.env.PV_GATE_FAULT;
  const controller = new AbortController();
  controller.abort();
  return expectError(
    sqlSourceState("00000000-0000-0000-0000-000000000000", { signal: controller.signal }),
    BRIDGE_CODES.CANCELLED_BEFORE_START,
    { forbid: [SENTINEL] },
  );
});

// 6. Missing interpreter: start failure reported as a code, not a message dump.
await check("unspawnable interpreter: fixed start-failure code", () => {
  delete process.env.PV_GATE_FAULT;
  const previous = process.env.PV_GATE_PYTHON;
  process.env.PV_GATE_PYTHON = "/nonexistent/pv-gate/python";
  return expectError(sqlSourceState("00000000-0000-0000-0000-000000000000"), BRIDGE_CODES.START_FAILED).finally(
    () => {
      if (previous === undefined) delete process.env.PV_GATE_PYTHON;
      else process.env.PV_GATE_PYTHON = previous;
    },
  );
});

// 7. Explicit env requirement (no accidental default to a real database/queue).
await check("missing explicit env: fixed code, no fallback", () => {
  const db = process.env.PV_GATE_DATABASE_URL;
  delete process.env.PV_GATE_DATABASE_URL;
  return expectError(sqlSourceState("00000000-0000-0000-0000-000000000000"), BRIDGE_CODES.ENV_MISSING_DB).finally(
    () => {
      process.env.PV_GATE_DATABASE_URL = db;
    },
  );
});

delete process.env.PV_GATE_FAULT;

const failed = results.filter((r) => !r.ok);
for (const entry of results) {
  console.log(`${entry.ok ? "PASS" : "FAIL"}  ${entry.name}  ${JSON.stringify(entry.detail)}`);
}
console.log(
  `\npv-gate negative checks: ${results.length - failed.length}/${results.length} passed; ` +
    `max_output_bytes=${MAX_OUTPUT_BYTES}; sentinel=${SENTINEL}`,
);
process.exit(failed.length === 0 ? 0 : 1);
