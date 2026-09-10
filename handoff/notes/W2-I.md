# W2-I — `/ai-review` inbox UI (proposal queue + accepted-facts tab)

Contract: `docs/contracts/wave2_intake_core.md` v1.0 (frozen)
Branch: `arena/01a089cd-casevault` · Base: integration tip `adcb1b8` (= `arena/01a0899f-casevault`)

## What changed

Write set only — no file outside it was touched (`git status --short` shows exactly
the paths below).

**New / replaced UI (Screen 6 + Screen 7 tab)**

| Path | What it is |
|---|---|
| `apps/web/app/ai-review/page.tsx` | Placeholder → two tabs (**Inbox** / **Accepted facts**) + the amber review-state-floor banner. |
| `apps/web/components/review-inbox.tsx` | Inbox tab: left filter pane, card feed (20/page, offset paging), per-card actions, bulk bar (accept behind a confirm panel), “Generate proposals from a source” (`POST /proposals/generate`), manual-proposal form (`POST /proposals`), §5.2 empty state verbatim. |
| `apps/web/components/review-proposal-card.tsx` | One proposal: type badge, system/manual mark, matter, source anchor link `/evidence/{id}`, excerpt, proposed text, confidence, linked actors/dates from `proposed_structured_json`, actions Accept / Accept with edits / Reject / Defer / Uncertain, optional review note. |
| `apps/web/components/review-filters.tsx` | Inbox filters (type, matter, review state, source, min confidence) + query mapping. |
| `apps/web/components/review-facts-table.tsx` | Accepted facts tab: filters (matter, review-state chips incl. “Trusted only” / “Awaiting approval”, type, material, search), stats (trusted / awaiting approval / in view), table with review state + confidence + material flag, row actions Approve · Reject · Defer · Dispute · Supersede…, §5.2 empty state verbatim. |
| `apps/web/components/review-fact-detail.tsx` | Expanded row inspector: full statement + provenance, source-support link add/remove, actor link add/remove, supersede form with replacement statement. |
| `apps/web/components/review-labels.tsx` | Review-state copy/trust predicate, labels, badges, formatters, `proposed_structured_json` actor/date extractors, `apiErrorMessage`. |

**Append-only hub sections (AGENT_POLICY §2.4)**

- `apps/web/lib/types.ts` **+257 / −0**: `ProposalType`, `ReviewState`, `FactType`,
  `SupportType`, `StrengthLabel`, `ProposalReviewAction`,
  `FactReviewStateTarget`, `ProposedStructuredJson`, `ProposalSourceRef`,
  `ProposalExcerptRef`, `Proposal`, `ProposalPage`, `ProposalEdits`,
  `NewProposalInput`, `ProposalReviewResult`, `BulkReviewResult`,
  `ProposalGenerateResult`, `FactSourceLink`, `FactActorLink`, `Fact`, `FactPage`,
  `FactSupersedeResult` + `PROPOSAL_TYPES` / `REVIEW_STATES` / `FACT_TYPES` /
  `SUPPORT_TYPES` / `STRENGTH_LABELS`.
- `apps/web/lib/api.ts` **+180 / −0**: `listProposals`, `createProposal`,
  `getProposal`, `updateProposal`, `reviewProposal`, `bulkReviewProposals`,
  `generateProposals`, `listFacts`, `getFact`, `updateFact`, `approveFact`,
  `setFactReviewState`, `supersedeFact`, `addFactSourceLink`,
  `deleteFactSourceLink`, `addFactActorLink`, `deleteFactActorLink`, plus
  `ProposalListParams` / `FactListParams` (repeatable `review_state`) and the
  `intakeQuery` helper. WS-I's `import type { … } from "./types"` lives at the end
  of the file, in the WS-I section, so the shared top import block stays untouched.

**Floor rule (contract §4.1), the visible half**

- `api.approveFact` has exactly one call site — the **Approve** button in
  `review-facts-table.tsx`. No other control can produce `accepted`; the
  review-state control offers only `rejected | deferred | uncertain | disputed |
  accepted_with_edits | superseded`.
- `proposed` facts render with an amber badge **and** the copy “Not yet trusted”;
  `accepted` renders “Trusted — explicitly approved”; `accepted_with_edits` is
  deliberately **not** trusted (it is not `accepted`) and keeps Approve available.
- Accepting a proposal reports “created as `proposed` … not trusted until it is
  approved in the Accepted facts tab”; the bulk confirm panel says “none of them
  is approved or trusted by this action”.

## Proof

### 1. Web gates (required by the brief)

```
$ npx tsc --noEmit -p apps/web/tsconfig.json            → exit 0 (no output)
$ npm run lint --workspace=web                          → ✔ No ESLint warnings or errors
$ npm run build --workspace=web                         → exit 0
   ✓ Compiled successfully · ✓ Generating static pages (15/15)
   ├ ○ /ai-review      12 kB    117 kB First Load JS
```

### 2. Append-only hubs unchanged apart from appends

```
$ git diff --numstat
180  0  apps/web/lib/api.ts
257  0  apps/web/lib/types.ts
 76  7  apps/web/app/ai-review/page.tsx     # owned file: placeholder replaced
$ git diff -- apps/web/lib/api.ts apps/web/lib/types.ts | grep -c '^-[^-]'
0
```

### 3. Single approve site

```
$ grep -rn "approveFact" apps/web --include=*.tsx --include=*.ts
apps/web/lib/api.ts:  approveFact: (id) => apiFetch<Fact>(`/facts/${id}/approve`, …)
apps/web/components/review-facts-table.tsx:  const approve = useMutation({ mutationFn: (id) => api.approveFact(id) … })
```

### 4. Screen-6 walk — driven DOM run against a contract-shaped API

No browser binary can be installed in this sandbox (playwright/Chromium CDNs are
unreachable: `curl https://cdn.playwright.dev/…` → `SSL_ERROR_SYSCALL`, exit 35;
`@sparticuz/chromium` extracts to `/tmp/chromium` but dies on a missing
`libnss3.so`, and apt cannot reach `deb.debian.org`). The walk therefore runs the
**real components** in jsdom + Testing Library against a stub that implements
§4.2/§4.3 exactly. Harness lives in `/tmp` (`/tmp/w2i_stub_api.py`,
`/tmp/w2i_walk/{walk.tsx,build.mjs,link-stub.tsx}`) — **nothing of it is in the
repo, and it must not be committed** (AGENT_POLICY §5 / brief “no mocks may merge”).

Re-run:

```bash
python3 /tmp/w2i_stub_api.py 8123 &      # contract-shaped, in-memory
cd /tmp/pw && node /tmp/w2i_walk/build.mjs && node /tmp/pw/w2i_walk.mjs
```

```
[1] Inbox loads with the §5.2 empty state
   ✅ empty-state copy is verbatim
   ✅ no Approve affordance in the inbox — approve lives only in the Accepted facts tab
[2] Generate proposals from a text source (POST /proposals/generate)
   ✅ generator reports created/skipped — 5 generated, 0 skipped
   ✅ queue shows the generated cards
[3] Accept one proposal (Accept ≠ Approve)
   ✅ accept reports a `proposed` fact, not a trusted one
[4] Accepted facts tab: the new fact is `proposed` / not trusted
   ✅ proposed fact renders with the not-trusted badge + copy
   ✅ no fact is marked trusted yet
   ✅ Approve is the row affordance for a proposed fact
[5] Approve → the fact becomes `accepted` (trusted)
   ✅ trusted copy appears only after Approve
   ✅ trusted total moves to 1
   ✅ proposed total drops back to 0
   ✅ the approved fact no longer offers Approve — already-accepted facts show Approved
[6] Reject and defer two other proposals
   ✅ defer applied to proposal #1
   ✅ reject applied to a second proposal
[7] Bulk action on the queue (POST /proposals/bulk-review)
   ✅ bulk accept asks for confirmation first (UX guardrail) and says nothing becomes trusted — 5 proposals selected
   ✅ bulk review reports per-id results and creates only `proposed` facts — 3/5 accepted, 3 facts proposed
   ✅ partial success is surfaced (already-reviewed ids report their 409, they do not silently pass)
[8] Floor probes
   ✅ every fact created by accept/bulk-accept is `proposed` — 3 proposed facts
   ✅ no fact landed in another state
   ✅ review-state can never set `accepted` (422 from the contract-shaped API) — status 422
   ✅ exactly the approved fact is in the trusted set
WALK COMPLETE — all checks passed
```

Request journey observed in the same run (the UI only uses §4.2/§4.3 routes):

```
GET  /api/v1/proposals?limit=20&offset=0 ×5      GET  /api/v1/matters ×3   GET /api/v1/sources ×2
GET  /api/v1/facts?limit=20&offset=0 ×2          GET  /api/v1/facts?review_state=accepted&limit=1 ×2
GET  /api/v1/facts?review_state=proposed&limit=1 ×2
GET  /api/v1/facts?limit=200&review_state=accepted&review_state=proposed   (repeatable filter)
POST /api/v1/proposals/generate                  POST /api/v1/proposals/{id}/review ×3
POST /api/v1/proposals/bulk-review               POST /api/v1/facts/{id}/approve
POST /api/v1/facts/{id}/review-state → 422       (floor probe)
```

### 5. Walk description (human steps, same order)

1. Open `/ai-review` → reading pane shows the floor banner (“Nothing on this screen
   is trusted until it is approved”), tabs **Inbox** / **Accepted facts**, and the
   queue’s empty state: “No proposals waiting. Generate proposals from a source or
   add one manually.”
2. **Generate proposals from a source** → pick the text source → *Generate
   proposals* → “Generated 5 proposal(s); 0 paragraph(s) were already proposed and
   skipped”, and five cards appear (type badge, matter, source anchor → `/evidence/{id}`,
   proposed text, confidence, actor/date chips when present).
3. **Accept** on a card → inline confirmation “Accepted — fact … created as
   `proposed` … not trusted until it is approved”. (Accept here is a queue
   decision; the card has no Approve button.)
4. Switch to **Accepted facts** → the new row shows **Proposed** + “Not yet
   trusted”, and the header reads “Trusted (accepted): 0 · Awaiting approval
   (proposed): 1”.
5. **Approve** that row → “Approved — this fact is now `accepted`”; the row badge
   flips to **Accepted** + “Trusted — explicitly approved”, header → “Trusted
   (accepted): 1”, and the row no longer offers Approve.
6. Back to **Inbox** → **Defer** one card (“Marked defer…”) and **Reject** another
   (“Marked reject…”); both leave the queue.
7. **Bulk**: select the page (or several cards) → **Accept selected** → confirm
   panel “Accept N proposal(s) as-is? … none of them is approved or trusted” →
   *Confirm accept N* → result line “3/5 accept · 3 fact(s) created as `proposed` ·
   failures: 409: not reviewable” (partial success, per-id).
8. Floor probes: `POST /facts/{id}/review-state {"review_state":"accepted"}` → 422;
   the only fact in the trusted set is the one that went through Approve.

### 6. Live preview (scratch data, for the integrator)

Built app served by `next start -H 0.0.0.0 -p 3100` with the Next rewrite pointed at
the stub (`curl /ai-review` → 200; `curl /api/v1/matters` through the proxy → 200).
This is a stub-backed preview only — the real API arrives with W2-G.

## Contract gaps

1. **§4.2 vs §2 — accepting a proposal with no matter.** §2 makes
   `fact_assertions.matter_id` NOT NULL, and §4.2 derives the fact’s matter from
   `proposal.matter_id ?? edits.matter_id`, while `proposals.matter_id` is
   nullable. Expected: `POST /proposals/{id}/review {action: accept}` on a
   matter-less proposal returns a clear 422. Observed: nothing in the contract says
   what happens — as written it is a DB/500 path. *Minimum change:* state in §4.2
   that `accept` returns 422 when neither `proposal.matter_id` nor `edits.matter_id`
   is present. UI mitigation shipped: Accept is disabled for such proposals with
   the hint “use Accept with edits to pick a matter”, and the edit form requires a
   matter.
2. **§5.2 “bulk select with the same actions” vs §4.2 bulk body.** The bulk body is
   `{ids, action, review_notes?}` — there is no `edits`, so “Accept with edits”
   cannot be a bulk action. Shipped: bulk Accept (as-is) / Reject / Defer /
   Uncertain, plus a disabled “Accept with edits” with an explanatory title.
   *Minimum change:* note in §5.2 that accept-with-edits is per-card.
3. **§5.2 tab name vs its contents.** The tab is called “Accepted facts” but §7’s
   own W2-I walk requires a `proposed` fact to *appear in the Facts tab*. Shipped:
   the tab is the trusted-set view (trusted = `accepted` only) with every other
   state visible but marked not trusted, defaulting to no state filter. No code
   change needed — a wording clarification would do.
4. **§4.2 `POST /proposals/generate` response shape.** §4.2 documents
   `{created, skipped}` while §4.4’s enqueue helper returns
   `{queued, job_id, reason}`. Shipped: the client type tolerates both and the UI
   shows a “queued as a job” message when `queued` is true. *Minimum change:* none
   if W2-G always answers `{created, skipped}`; otherwise document the union.

## Risks / follow-ups

- **Unmerged dependency:** W2-G’s real endpoints do not exist yet, so every
  dynamic result above comes from the contract-shaped stub. The first integration
  run should repeat step 4/5/7 of the walk; W2-J should assert the floor from the
  other side (422 on `review_state=accepted`, 409 on already-accepted approve).
- **Evidence anchor links:** cards link to `/evidence/{id}` per §5.2, but this
  checkout has no `/evidence` route (KNOWN_ISSUES, Sprint 3 UI). Links will 404
  until that lands on the integration tip — the link target itself is correct.
- **Not implemented (not required by §5.2):** Screen 6 keyboard shortcuts
  (`A/E/R/D/J/K`), the right-pane source-anchor preview, “assign for review”,
  dispute on proposal cards, saved views, per-card proposal PATCH UI
  (`api.updateProposal` exists but nothing calls it yet).
- **Extra requests:** the facts-tab header issues two `limit=1` totals queries per
  view (trusted / awaiting approval); acceptable locally, worth folding into one
  endpoint if the API grows an aggregate.
- Careful with `accepted_with_edits`: the row shows “Reviewed” (not trusted) and
  keeps Approve; if the integrator decides `accepted_with_edits` should also be
  trusted, that is a contract change (§4.1), not a UI tweak.

## What the next agent must know

- Everything the UI needs is in `apps/web/lib/types.ts` (§5.3 IDs match the
  contract verbatim) and `apps/web/lib/api.ts` (WS-I section at the end of the
  object + the helper block after it). When WS-H’s ledger section lands, the merge
  is append-vs-append: take both sections, keep both `intakeQuery`-style helpers
  separate if H adds one.
- The floor is enforced in two places only: `api.approveFact` is called from the
  Approve button in `review-facts-table.tsx`, and `api.setFactReviewState` is typed
  with `FactReviewStateTarget`, which excludes `accepted`. Do not widen either.
- Review states the queue can re-review are `proposed | deferred | uncertain`
  (`REVIEWABLE_STATES` in `review-proposal-card.tsx`); everything else renders the
  409 note instead of action buttons.
- Empty-state strings are verbatim from §5.2 and asserted by the walk —
  `No proposals waiting. Generate proposals from a source or add one manually.`
  and `No facts yet. Accept a proposal to create one.` (a second, smaller filter
  hint may appear under them when filters are active).
- The walk harness is throwaway and lives outside the repo (see §4 above). If you
  re-run it, restart the stub first (it is in-memory) or `POST /__reset`.
- Local checks: `npm run lint|typecheck|build --workspace=web`. The full
  `scripts/verify_all.sh` cannot run in this sandbox (no `.venv`); the python half
  is unchanged by this workstream.
- **Branch state:** this session branch also carries `ca38ab1` (W2-J: intake e2e
  verification + CI job), which was on `arena/01a089cd-casevault` before W2-I's
  commit was pushed. W2-I's commit is rebased on top of it; the two write sets do
  not overlap (W2-I touched only its own paths — see `git show --stat`). Confirm
  the split with the integrator when opening PRs: W2-I = the commit titled
  “W2-I: /ai-review proposal inbox + accepted-facts tab”.
