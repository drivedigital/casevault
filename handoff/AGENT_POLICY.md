# Agent Policy — division of labor & coordination

**Owner:** integrator session (`arena/01a0899f-casevault`) · **Status:** in force
from 2026-09-10 · **Applies to:** every agent session that touches this repo,
plus the human local tester.

This is the rulebook. `handoff/PARALLEL_PLAN.md` is the *plan* (who builds what,
this wave); `docs/contracts/*.md` are the *interfaces* (exact schema and API);
this file is *how we work together* — and it is binding. If a rule here blocks
you, escalate (see §6) rather than improvise.

---

## 1. Roles

| Role | Who | Owns | Never does |
|---|---|---|---|
| **Owner** | the human | priorities, permissions, real-evidence testing | — |
| **Integrator** | this session (`arena/01a0899f-casevault`) | contracts, review, merges, gate runs, `handoff/WORKLOG.md` + `BACKLOG.md` + `KNOWN_ISSUES.md` + `TESTING.md` + `DECISIONS.md`, releases to the tester | writing feature code inside another workstream's write set |
| **Implementer** | one agent session per workstream | the files listed in its workstream brief | touching files outside its write set |
| **Verifier** | one agent session per wave (WS-*V/J) | integration tests, smoke scripts, CI job, a written deviation report | fixing product bugs itself (reports them instead) |
| **Local tester** | the human (+ local agents on their machine) | running the stack with real evidence, reporting failures | — |

One workstream = one session = one branch = one PR. If a session is asked to do
two workstreams, they must be in **different waves** (or the integrator splits
the write sets explicitly).

---

## 2. How work is divided

1. **By file, not by task.** Every workstream owns an explicit list of paths.
   Overlap between two write sets is a planning bug — report it, don't share.
2. **One migration per wave, one owner.** Alembic revisions are reserved up
   front (revision number → workstream → table list). Nobody else creates a
   migration, edits `alembic/env.py`, or adds models to an existing revision.
3. **Hub files have a single owner per wave** (table below). Everyone else
   treats them as read-only.
4. **Append-only hubs.** `apps/web/lib/api.ts` and `apps/web/lib/types.ts` are
   edited by multiple workstreams, so the rule is: **append at the end, in your
   own commented section, never reorder or reformat existing lines.** If a
   conflict still happens there, the integrator resolves it — do not hand-fix.
5. **No breaking response-shape changes mid-wave.** An endpoint's response shape
   is frozen while a wave is in flight; if a shape is wrong, it is a contract
   change (§4.1) scheduled for the next wave.

### Hub-file ownership — Wave 2

| File | Owner | Notes |
|---|---|---|
| `apps/api/app/main.py` | WS-E | registers the wave's routers |
| `apps/api/app/models/enums.py`, `models/__init__.py` | WS-E | append-only per wave |
| `apps/api/alembic/versions/0004_*.py` | WS-E | the wave's only migration |
| `apps/api/requirements.txt` | integrator | request changes in your handoff note |
| `workers/queues.py` | integrator | queue names are frozen |
| `apps/web/components/nav.tsx` | WS-H | adds the Ledger entry |
| `apps/web/lib/api.ts`, `lib/types.ts` | WS-H + WS-I | append-only sections |
| `.github/workflows/ci.yml` | WS-J | append a job; do not restructure |
| `Makefile` | integrator | request targets in your note |
| `tests/api/conftest.py` | WS-E | shared fixtures |
| `handoff/WORKLOG.md`, `BACKLOG.md`, `KNOWN_ISSUES.md`, `TESTING.md`, `DECISIONS.md` | integrator | implementers write `handoff/notes/<WS>.md` |
| `docs/contracts/*` | integrator | §4.1 change control |
| `docs/specs/*` | nobody in a wave | spec edits are their own reviewed change |

---

## 3. Lifecycle of a workstream

1. **Read** `handoff/AGENT_POLICY.md`, your brief in `handoff/kickoff/`, and your
   contract in `docs/contracts/`. Do not start on a draft contract.
2. **Base the branch on the integration tip** (mandatory — `origin/main` has
   unrelated history and will not merge):
   ```bash
   git fetch origin arena/01a0899f-casevault
   git reset --hard FETCH_HEAD          # your session branch = integration tip
   git push --force-with-lease origin HEAD   # only if the branch was already pushed
   ```
3. **Implement inside your write set.** Small commits; no drive-by refactors, no
   reformatting, no dependency changes without approval.
4. **Self-verify** with the wave gate (§5) plus your brief's specific proof.
5. **Write `handoff/notes/<WS>.md`** in the fixed format (§4.4).
6. **Open a PR into `arena/01a0899f-casevault`** using
   `.github/pull_request_template.md`. If GitHub rejects the operation for
   permissions (happens with this installation), push the branch and report
   **branch name + commit sha + proof output** in your note and to the owner;
   the integrator merges by sha. Do not treat a failed `gh` call as a reason to
   hand work over unreviewed.
7. **Stop work on merge order.** The integrator merges in the order in
   `PARALLEL_PLAN.md` and re-runs the full gate after each merge. Do not merge
   your own branch; do not rebase someone else's.
8. **Post-merge:** the integrator consolidates your note into `WORKLOG.md`,
   updates backlog/known-issues, and archives the note. Only then take the next
   workstream.

---

## 4. Coordination protocols

### 4.1 Contract protocol (the single most important rule)

- A contract is written and **frozen by the integrator before** any session for
  that workstream starts. Wave 2's contract is `docs/contracts/wave2_intake_core.md`.
- Implement the contract **as written**. When it is wrong, incomplete, or
  conflicts with reality:
  1. keep the code compliant with the frozen contract,
  2. add a `## Contract gaps` section to your handoff note citing the section
     number, expected vs observed, and the minimum change you need,
  3. the integrator either issues a version bump (1.x additive / 2.0 breaking)
     into `docs/contracts/`, or records the deviation as a follow-up.
  **Never** silently diverge "because the code works better that way" — Wave 1
  proved that costs a full integration pass.
- Schemas, status vocabularies, endpoint paths, error codes, and job payloads
  are shared surfaces: changing one is a contract change, not an implementation
  detail.

### 4.2 Branch, PR, and merge protocol

- **Integration branch:** `arena/01a0899f-casevault`. PRs target it. **`main` is
  never touched by an agent session.**
- **Branch names:** `feature/w2-<ws>-<topic>` for local agents; Arena sessions
  use their own session branch.
- **Force-push** is allowed only to your own session branch, only with
  `--force-with-lease`, and only for the step-2 reset.
- **Merge order** within a wave is fixed in `PARALLEL_PLAN.md` (Wave 2:
  E → F → G → J, with H/I in parallel behind E). If you finish early, say so in
  your note; do not jump the queue.
- **Conflict policy:** if a rebase conflicts inside your write set, resolve it.
  If it conflicts **outside** your write set, `git rebase --abort`, report the
  files and the branches involved to the integrator, and wait. Guesswork here
  is how a wave gets corrupted.
- **Post-merge:** the integrator runs the full gate on the merge commit. A red
  gate blocks the next merge.

### 4.3 Verification protocol

- Every claim of "done" needs command output in the PR/note:
  `bash scripts/verify_all.sh` (or `--no-web` for API-only work) **plus** the
  workstream-specific proof from your brief.
- **Real Postgres, no mocks.** Sandboxes without Docker use
  `python scripts/agent_pg.py start` (see `PARALLEL_PLAN.md` §6). Tests that
  silently skip on the normal path are not proof.
- **Never write to `data/`** in tests: use a scratch `LOCAL_STORAGE_ROOT`
  (see `tests/api/conftest.py`) and synthetic fixtures only. No real evidence in
  this repo, ever — not in tests, not in fixtures, not in logs, not in commits.
- A test that fails only on the integrator's machine is a bug in the
  workstream's setup instructions: fix the instructions in your note.

### 4.4 Handoff protocol

`handoff/notes/<WS>.md`, one file per workstream, exactly these sections:

```markdown
# WS-X — <title>
Contract: docs/contracts/<file>.md v<version>
## What changed            (files, endpoints, tables — no prose essays)
## Proof                   (commands + observed results, pasted)
## Contract gaps           (section number, expected vs observed, minimum change)
## Risks / follow-ups
## What the next agent must know
```

Implementers do **not** edit `WORKLOG.md`, `BACKLOG.md`, `KNOWN_ISSUES.md`,
`TESTING.md`, or `DECISIONS.md` — five concurrent writers on those files is a
guaranteed conflict. The integrator consolidates per wave.

### 4.5 Communication protocol

- The **repo is the channel**: contract = interfaces, brief = assignment, note =
  status, PR = review request, `DECISIONS.md` = durable rulings.
- The **integrator is the hub**. Route questions there; do not negotiate
  interfaces directly with another workstream (peer-to-peer "we agreed" is how
  two branches end up incompatible).
- The **owner relays between sessions** when a session itself cannot be
  messaged. Keep messages to: what you need, from whom, by when, and what you
  will do meanwhile.
- GitHub issues/PR automation is unreliable with the current installation
  permissions. Treat the repo files as authoritative, and say so in your note if
  a `gh` command fails.
- Report blockers **immediately**, in the note and to the owner — a blocked
  workstream that stays quiet is the most expensive failure mode we have.

### 4.6 Escalation ladder

| Situation | Escalate to | Do meanwhile |
|---|---|---|
| Contract is wrong/incomplete | integrator (note §`Contract gaps`) | continue on non-blocked parts |
| Dependency on another workstream | integrator (sequences merges) | code against the frozen interface |
| Conflict outside your write set | integrator | abort the rebase, keep your branch |
| Test environment broken (no DB, no Docker) | integrator | use `scripts/agent_pg.py`, document it |
| Anything touching evidence, secrets, or real case data | **stop** → integrator + owner | nothing |
| Perceived security/privacy risk | **stop** → integrator + owner | nothing |
| GitHub permissions/credential needed | owner (never paste credentials into chat) | continue offline in the repo |

---

## 5. Hard rules (never)

1. Never commit anything under `data/`, any real case material, or any secret.
2. Never paste or store credentials in a branch, note, PR, or log.
3. Never push to `main`; never force-push a shared branch; never rewrite another
   session's branch.
4. Never add a migration outside your reservation, or edit a merged migration
   (including "fixing" `downgrade()` — report it).
5. Never add a mandatory dependency without an approved note (optional imports
   are fine and must be guarded).
6. Never change a response shape, endpoint path, status vocabulary, or queue
   name without a contract version bump.
7. Never delete or rewrite evidence records as a side effect of another action
   (duplicates are flagged, not removed).
8. Never edit another workstream's tests to make your change pass.
9. Never leave a workstream branch un-pushed at the end of a session.
10. Never mark work "done" without gate output in the note.

---

## 6. Definition of done (per workstream)

- [ ] Contract implemented; zero edits outside the write set
- [ ] `bash scripts/verify_all.sh` (or `--no-web`) green on a fresh database
- [ ] Workstream-specific proof from the brief, output pasted in the note/PR
- [ ] At least one test in the workstream's own test file covers the new behavior
- [ ] `handoff/notes/<WS>.md` written in the fixed format
- [ ] Branch pushed; PR opened (or branch + sha reported if permissions block it)
- [ ] No `data/`, secrets, or evidence in the diff

---

## 7. Wave roster (current)

See `handoff/PARALLEL_PLAN.md` §4a for the assignment table and merge order, and
`handoff/kickoff/README.md` for the paste-ready prompt per workstream.
Archived waves: `handoff/notes/archive/` (Wave 1 = Sprint 3 evidence module,
delivered by a single in-flight session and integrated by the integrator).
