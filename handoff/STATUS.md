# Current coordination status

Updated 2026-10-03; Integrator session on `arena/01a0899f-casevault`.
This is the entry point for current assignments, verified proof, and environment status.
Update this page when assignments, tools, edge gateways, or merge statuses change.

## Product and Infrastructure Status

- **Integration Branch:** `arena/01a0899f-casevault` (up to date with remote origin)
- **Live Deployments:**
  - **Web Application (Cloudflare Pages):** [https://casevault-web.pages.dev](https://casevault-web.pages.dev)
  - **Edge Worker Gateway & KV API:** [https://casevault-worker.dan-2eb.workers.dev/api/v1](https://casevault-worker.dan-2eb.workers.dev/api/v1)
- **Real Litigation Dataset Integration:**
  - 404 real discovery documents populated from `drivedigital/510W42`.
  - 3 interconnected active matters:
    1. **230 CPS** (Housing Part summary eviction, RPAPL 768 / 853, Chattel Conversion).
    2. **510 W 42** (Hotel conversion, Civil Rights Law § 51, Quantum Meruit).
    3. **Part 19** (Supreme Court MHL Article 81 Guardianship, Index No. 153243/2026).
  - Real actors normalized with aliases: Dan George, Ian Reisner, Andre K. Cizmarik, 230 Park South Apartments Inc., Urban Resort LLC.
- **Wave 3 Integrated Workstreams:**
  - **WS-CLAIMS (`/claims`, `/claims/[id]`):** Fully operational. Element-by-element burden health (`proven`, `partially_supported`, `unsupported`), fact-element linking with polarities (`support`, `adverse`, `context`), conflict warnings, and instant recomputation (`POST /claim-instances/{id}/recompute-support`).
  - **WS-CHRONO (`/chronology`):** Fully operational. Multi-precision timeline (`exact`, `range`, `approximate`, `unknown`), significance tagging, fact-evidence backlinks, and strict review floors.
  - **WS-EVIDENCE (`/evidence`, `/evidence/[id]`):** Fully operational. Autoloading PDF/JPEG previews served directly from edge KV, OCR page transcriptions, and review state controls.
  - **WS-AI-INTEL (`/ai-review`):** Proposal review inbox with strict human-in-the-loop review floor (`review_state = proposed` $\to$ `accepted`).
  - **WS-LEDGER (`/ledger`):** Cryptographic immutable transaction ledger tracking all mutations and evidentiary links.
- **Cloudflare Edge Gateway & Persistent KV:**
  - Cloudflare Worker (`infra/cloudflare-worker/src/index.ts`) routes all `/api/v1/*` requests to persistent KV (`CASEVAULT_KV`, id: `d707525cc924472aadf3bd3eeccec3db`).
  - Edge binary exhibit serving (`GET /api/v1/sources/:id/file`) supporting image/jpeg, application/pdf, and text/markdown.
  - Bidirectional matter links, actor roles, and source-matter linking with KV persistence.

## Documentation Map

- [Agent policy](AGENT_POLICY.md): permissions, write sets, PR/merge rules, accelerators & tools.
- [Recovery](RECOVERY.md): interruptions, stale metadata, closed sessions, evidence preservation.
- [Testing](TESTING.md): safe gate prerequisites; archived phase checklists.
- [Verification workflows](VERIFICATION_WORKFLOWS.md): CI coverage, edge gateway proof, OCR engine verification, and backups.
- [Backlog](BACKLOG.md), [known issues](KNOWN_ISSUES.md), [decisions](DECISIONS.md).
- [Kickoffs](kickoff/README.md): current roster; historical assignment scopes are not reactivation.
- [Arena Dispatcher](file:///Users/dangeorge/Documents/GitHub/casevault/scripts/arena_dispatcher/README.md): CDP automation guide for live Arena agent mode.
