# Agent Policy — division of labor & coordination

**Owner:** integrator session (`arena/01a0899f-casevault`) · **Status:** in force
from 2026-10-03 · **Applies to:** every agent session and parallel subagent that touches this repo,
plus the human local tester. Current assignments/holds: STATUS.md; recovery: RECOVERY.md.

This is the rulebook. `handoff/PARALLEL_PLAN.md` is the *plan* (who builds what,
this wave); `docs/contracts/*.md` are the *interfaces* (exact schema and API);
this file is *how we work together* — and it is binding. If a rule here blocks
you, escalate (see §6) rather than improvise.

---

## 0. Development Acceleration Tools & Environment Secrets

The repository is equipped with local and cloud accelerators configured in `.env.local`
and the deployment infrastructure:

| Tool / Provider | Endpoint / Service | Purpose & Usage |
|---|---|---|
| **OCR.space Engine** | `https://api.ocr.space/parse/image` (`K88494079788957`) | High-speed cloud extraction for scanned PDFs & images via `workers/pipeline/ocr_engine.py`. Automatic hybrid fallback from local `pypdf`. |
| **Cloudflare Worker** | `https://casevault-worker.dan-2eb.workers.dev` | Edge gateway for GitHub webhooks, webhook signature verification (`/webhooks/github`), and Supabase REST proxying. Source in `infra/cloudflare-worker/`. |
| **Supabase Integration** | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Managed Postgres, edge storage buckets, and future vector embedding/pgvector acceleration. |
| **AI Providers** | NVIDIA API (`nvapi-iCso...`), Ollama Cloud (`111a5d...`), OpenAI, Anthropic | Fast automated proposal generation, entity extraction, and VLM image descriptions. |
| **Local Worktrees** | `git worktree add ../casevault-<ws> -b feat/<ws>` | Isolated filesystem checkouts for concurrent subagents avoiding working tree collisions. |

---

## 1. Roles

| Role | Who | Owns | Never does |
|---|---|---|---|
| **Owner** | the human | priorities, permissions, environment decisions | — |
| **Integrator** | this session (`arena/01a0899f-casevault`) | contracts, review, merges, gate runs, `handoff/*`, releases to tester | writing feature code inside another workstream's write set |
| **Subagent / Implementer** | isolated agent in dedicated git worktree | files explicitly assigned in its workstream brief | touching files outside its write set or self-merging |
| **Verifier** | verification subagent | integration tests, smoke scripts, CI job, written deviation report | fixing product bugs itself (reports them instead) |
| **Local tester** | the human (+ local agents) | authorized synthetic local checks and redacted reports | real-evidence operations or unapproved schema changes |

One workstream = one subagent session = one git worktree = one branch = one PR.

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
   own commented section, never reorder or reformat existing lines.**
5. **No breaking response-shape changes mid-wave.** An endpoint's response shape
   is frozen while a wave is in flight.
6. **Worktree Isolation.** Subagents must always spawn inside a separate git
   worktree (e.g. `../casevault-<ws>`). Never run multiple subagents in the
   primary workspace root simultaneously.

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
2. **Confirm the assigned branch and checkpoint access before work.** Read
   STATUS.md/RECOVERY.md, preserve local changes, fetch integration only if remote
   access is available, and inspect ancestry/diffs. Incorporate it by an approved
   normal merge/rebase on your assigned branch. No blanket hard reset or force-push;
   metadata repair requires full comparison and explicit recovery approval.
3. **Implement inside your write set.** Small commits; no drive-by refactors, no
   reformatting, no dependency changes without approval.
4. **Self-verify** with the wave gate (§5) plus your brief's specific proof.
5. **Write `handoff/notes/<WS>.md`** in the fixed format (§4.4).
6. **Open a PR into `arena/01a0899f-casevault`** using
   `.github/pull_request_template.md`. If GitHub rejects the operation for
   permissions while git push remains authorized, push the branch and report
   **branch name + commit sha + proof output** in your note and to the owner;
   the integrator reviews by sha. If remote access is closed, export the authorized
   note and report BLOCKED; do not attempt alternate access or branch takeover.
7. **Stop work on merge order.** The integrator sequences current work per
   `STATUS.md` and the active contract and re-runs the full gate after each merge. Do not merge
   your own branch; do not rebase someone else's.
8. **Post-merge:** the integrator consolidates your note into `WORKLOG.md`,
   updates backlog/known-issues, and archives the note. Only then take the next
   workstream, only if the session remains active and checkpoint access is confirmed.
   Closed merged sessions are retired; follow-up work requires a fresh session.

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
- **Branch names:** Arena sessions use only their assigned branch. Local report
  branches require explicit agreed workflow; no automatic feature/log branch creation.
- **Force-push:** not authorized in current closure/recovery work. Never reset
  or rewrite another session's branch.
- **Merge order:** current sequencing is in STATUS.md and the active contract.
  Historical Wave2 order is reference only. If ready early, report; do not self-merge.
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
2. Never paste or store credentials in a branch, note, PR, or log. Never commit
   .env* or case data. Never bypass an approval block using another tool.
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
9. Checkpoint and push authorized work when available. If access is closed or
   approval-blocked, preserve/export notes and report delivery blocked; do not bypass.
10. Never mark work "done" without gate output in the note.

---

## 6. Definition of done (per workstream)

- [ ] Assigned deliverable complete; zero edits outside the write set (review-only notes
      explicitly distinguish blocked review from completed acceptance)
- [ ] Applicable scoped proof recorded; implementation merge requires full strict gate
      on a verified disposable database. `--no-web` is partial, not full merge proof.
      Documentation-only reviews need content/link/diff checks, not destructive tests.
- [ ] Workstream-specific proof from the brief, output pasted in the note/PR
- [ ] New behavior has regression coverage in owned tests; review/docs-only work
      instead records sources, limitations and required next verification
- [ ] `handoff/notes/<WS>.md` written in the fixed format
- [ ] Branch pushed; PR opened (or branch + sha reported if permissions block it)
- [ ] No `data/`, secrets, or evidence in the diff

---

## 7. Historical Wave 2 roster (current roster: STATUS.md)

See `handoff/PARALLEL_PLAN.md` §4a for the assignment table and merge order, and
`handoff/kickoff/README.md` for the paste-ready prompt per workstream.
Archived waves: `handoff/notes/archive/` (Wave 1 = Sprint 3 evidence module,
delivered by a single in-flight session and integrated by the integrator).
