# Legal Matter Intelligence Workspace — Build Roadmap / Sprint Plan

**Status:** Planning document  
**Companion document:** `Legal_Matter_Intelligence_PRD.md`  
**Build posture:** Incremental, local-testable, continuous-improvement workflow  
**Jurisdiction focus:** New York-first  
**Priority order:** Claims → Evidence → Chronology → Relief → Drafting  
**Additional integration requirement:** MCP connector support for external data sources and knowledge bases

---

## 1. Roadmap Goals

This roadmap translates the PRD into a progressive build sequence that:

1. delivers useful functionality early
2. supports local testing with real evidence
3. preserves strict review of facts before they enter the trusted record
4. builds the proof graph incrementally rather than all at once
5. supports continuous improvement through a visible backlog and rapid testing loop
6. leaves room for MCP-based external knowledge and evidence connectors

---

## 2. Recommended Delivery Cadence

### Sprint cadence
Use **1-week sprints** with a short remote-agent/local-user test loop inside each sprint.

### Why 1-week sprints
- fast feedback on interface and workflow
- easier to test with real evidence locally
- lower risk of long branches drifting from product intent
- better fit for handoff logging and `-logs` branch diagnostics

### End-of-sprint rhythm
At the end of each sprint:
- remote coding agent updates handoff logs and backlog
- remote coding agent commits and pushes branch changes
- user tests locally with real evidence
- user runs log-collection script if needed
- next sprint priorities are updated from observed friction and bugs

---

## 3. Delivery Strategy

### Guiding implementation rule
Build the app in layers:

1. **operating discipline and local safety**
2. **workspace and evidence foundation**
3. **reviewed fact intake**
4. **chronology and claim analysis**
5. **integrated AI review and retrieval**
6. **exports and drafting**

### Product sequencing principle
Do not overinvest in polished outputs before the underlying interaction model is working well.

---

## 4. Milestone Overview

| Milestone | Outcome | Approx. sprints |
|---|---|---:|
| M0 | Repo safety, handoff discipline, local testability | 1 |
| M1 | Workspace, matters, actors, and secure source ingestion | 3 |
| M2 | Reviewed fact intake and source ledger workflow | 2 |
| M3 | Chronology and proof-linking foundation | 2 |
| M4 | Claim chart engine and gap analysis | 2 |
| M5 | Search, MCP connectors, and external retrieval | 2 |
| M6 | Relief matrix, research, and multi-agent review | 3 |
| M7 | PDF exports and drafting foundation | 2 |
| M8 | Stabilization, UX refinement, and continuous-improvement hardening | ongoing |

**Total initial roadmap:** approximately **17 sprints** (Sprint 0 through Sprint 16), with meaningful utility beginning around Sprint 4–6 and strong core value around Sprint 7–9.

---

## 5. Detailed Sprint Plan

## Sprint 0 — Project Operating System / Local-Safe Foundations

### Objective
Create the development and testing discipline required to build safely with real legal evidence.

### Scope
- initialize repository conventions
- create strong `.gitignore`
- create `handoff/` files
- define branch workflow including `-logs` branches
- define environment variable strategy
- define local run/test commands
- create diagnostic collection script skeleton
- create initial backlog format and priority structure

### Deliverables
- `.gitignore` with evidence and secret protection
- `handoff/WORKLOG.md`
- `handoff/BACKLOG.md`
- `handoff/TESTING.md`
- `handoff/KNOWN_ISSUES.md`
- `handoff/DECISIONS.md`
- diagnostic script placeholder/spec
- initial README for local setup

### Acceptance criteria
- no sensitive runtime or evidence directories are committed by default
- user can understand local setup expectations
- remote agent handoff process is documented

### Dependencies
None

### Risks
- if skipped, later local testing with real data becomes error-prone and unsafe

---

## Sprint 1 — App Shell / Workspace / Matter Architecture

### Objective
Stand up the core app shell and domain scaffolding.

### Scope
- application layout and navigation shell
- workspace model
- matter model
- overlay proceeding model
- matter overview page
- New York-first settings defaults
- basic local persistence/database wiring

### Deliverables
- left-nav + center-panel base UI
- workspace home screen
- matter create/edit flow
- overlay proceeding create/edit flow
- matter relationship fields

### Acceptance criteria
- user can create a master workspace with multiple linked matters
- user can create a proceeding linked to more than one matter
- navigation supports matter-specific views even if placeholders initially

### Dependencies
Sprint 0

---

## Sprint 2 — Parties / Actors / Relationship Layer

### Objective
Create the actor registry and matter relationship system.

### Scope
- actor registry
- actor aliases and normalization
- actor roles by matter
- actor dossier page
- matter/actor linking
- basic relationship map structure

### Deliverables
- actor CRUD
- role tagging
- actor appearances placeholder hooks for later sources/events
- actor dossier UI

### Acceptance criteria
- user can define plaintiff, counterparties, witnesses, and custodians
- one actor can appear in multiple matters and roles
- actor dossier can be opened from matter pages

### Dependencies
Sprint 1

---

## Sprint 3 — Evidence Repository / Upload / OCR Pipeline

### Objective
Make source ingestion real and useful.

### Scope
- file upload UI
- source records
- local evidence storage structure
- OCR pipeline stub/worker
- image-description/VLM pipeline stub/worker
- source metadata extraction
- source classification
- duplicate detection basics
- source viewer

### Deliverables
- source upload flow
- evidence repository page
- source detail page
- OCR job state indicator
- extracted text storage
- source status fields

### Acceptance criteria
- user can upload PDF/image/text evidence and see a source record
- OCR text appears when available
- source status and evidence-log status can be set manually

### Dependencies
Sprint 1, Sprint 2

### Notes
This is the first sprint where the user can test with actual evidence in a meaningful way.

---

## Sprint 4 — Source Ledger / Evidence Log UI

### Objective
Turn the current spreadsheet-style fact/source approach into a first-class structured module.

### Scope
- source ledger table view
- detail/edit drawer or page
- CSV import/export
- filters and tags
- authentication/witness fields
- confidence and verification-task fields
- inclusion/exclusion rationale
- restrictions/notes fields

### Deliverables
- in-app source ledger
- mapping of uploaded sources to ledger rows
- bulk edit support for tags/statuses
- import flow for existing CSV-style material

### Acceptance criteria
- user can maintain source-ledger rows inside the app
- user can filter by claim use, source status, confidence, and verification state
- imported ledger rows persist and remain editable

### Dependencies
Sprint 3

---

## Sprint 5 — Proposal Review Inbox / Fact Intake Workflow

### Objective
Build the high-trust review workflow that separates raw source from approved fact.

### Scope
- proposal object model
- proposal review queue UI
- source-to-proposal generation pipeline
- accept/edit/reject/defer actions
- audit trail for review decisions
- fact assertion object model
- trust-state system

### Deliverables
- review inbox screen
- fact proposal cards with source anchor references
- proposal action system
- approved facts store

### Acceptance criteria
- AI or extraction proposals do not enter the trusted fact set without review
- user can compare proposal text to source anchor before accepting
- review actions are captured in audit history

### Dependencies
Sprint 3, Sprint 4

### Milestone
At the end of this sprint, the app has a credible **reviewed factual core**.

---

## Sprint 6 — Chronology Engine / Timeline Views

### Objective
Turn approved facts into chronology entries and chronology analysis views.

### Scope
- event model
- fact-to-event linking
- date parsing and normalization
- approximate/range/undated support
- chronology table view
- basic timeline visualization
- significance tags
- actor and theory tags
- duplicate event detection

### Deliverables
- chronology page
- event review/edit flow
- linked source anchors on events
- timeline and table views

### Acceptance criteria
- user can build chronology from approved events
- chronology entries show source support and linked actors
- duplicate/near-duplicate events can be merged or flagged

### Dependencies
Sprint 5

---

## Sprint 7 — Cross-Linking / Proof Graph Foundation

### Objective
Create the relational glue that powers “connect the dots.”

### Scope
- link tables or relationship layer for:
  - source ↔ excerpt
  - excerpt ↔ fact
  - fact ↔ event
  - fact ↔ actor
  - fact ↔ matter
  - fact ↔ task
- object side panels showing linked items
- graph-aware breadcrumbs
- reusable relationship UI components

### Deliverables
- proof-link side panel
- linked object cards across views
- reusable relationship selectors

### Acceptance criteria
- user can navigate from a fact to its source, event, and actor links
- relationship data is stable enough to support claim mapping next

### Dependencies
Sprint 5, Sprint 6

---

## Sprint 8 — Claim Template Library / Claim Instance Engine

### Objective
Introduce structured causes of action and element lists.

### Scope
- claim template library
- New York-first claim template model
- claim instance creation from template
- element row model
- authority source metadata
- matter-specific claim notes and status

### Deliverables
- claims module skeleton
- create claim from template flow
- element list view
- authority verification state fields

### Acceptance criteria
- user can create a claim from a template and assign target defendants
- element rows exist as discrete objects ready for proof mapping

### Dependencies
Sprint 7

---

## Sprint 9 — Claim Chart / Element Mapping / Gap Detection v1

### Objective
Deliver one of the product's highest-value features: live element-by-element proof mapping.

### Scope
- fact-to-element linking
- support status scoring labels
- adverse/conflicting fact support area
- highest-priority gap field
- unsupported element detection
- weak-support warnings
- testimony-only support warning
- claim summary dashboard

### Deliverables
- claim chart screen
- support heatmap or matrix view
- element detail drawer
- gap summary panel

### Acceptance criteria
- user can inspect a claim and see what approved facts support each element
- unsupported elements are clearly visible
- chart updates when facts or sources change

### Dependencies
Sprint 8

### Milestone
At the end of this sprint, the app reaches the first major product promise: **evidence-connected claim analysis**.

---

## Sprint 10 — Search / Hybrid Retrieval v1

### Objective
Make long-record navigation practical.

### Scope
- full-text search
- metadata filters
- vector/semantic search foundation
- reranking layer
- source-anchor search results
- search within matter / across workspace

### Deliverables
- global search UI
- matter search view
- “show support for this element” query flow
- exact quote + semantic result blending

### Acceptance criteria
- user can find both exact quotes and semantically related evidence
- search results point to source anchors or linked facts/events

### Dependencies
Sprint 3 onward; most value after Sprints 6–9

---

## Sprint 11 — MCP Connector Framework / External Evidence & Knowledge Connectors

### Objective
Add a generalized connector layer so the app can query external data sources and knowledge bases for relevant evidence.

### Scope
- define MCP integration architecture
- connector registry
- connector permissions model
- external source ingestion workflow
- external result review queue
- provenance labeling for externally sourced material
- initial connector types for:
  - file-system-like repositories
  - document knowledge bases
  - notes/knowledge stores
  - external search endpoints

### Intended uses
- scan external document stores for relevant evidence
- query legal knowledge bases or research notes
- pull candidate documents/excerpts into review
- support external evidence discovery without auto-trusting results

### Deliverables
- MCP connector configuration screen
- connector run job flow
- external evidence candidate results page
- review/import action flow

### Acceptance criteria
- user can configure at least one MCP-backed data source
- connector results are treated as candidates, not trusted facts
- imported material preserves provenance and review state

### Dependencies
Sprint 3, Sprint 5, Sprint 10

### Product rule
MCP connectors should expand retrieval and discovery, not bypass the review model.

---

## Sprint 12 — Relief Matrix Module

### Objective
Translate the evidence and claim structure into practical requested relief analysis.

### Scope
- relief request model
- risk/fallback fields
- links to facts, claims, and authorities
- recommendation states
- relief matrix table and detail view

### Deliverables
- relief workspace
- relief request detail panel
- linked support and risk display

### Acceptance criteria
- user can assess a relief request with supporting facts and fallback options in one place
- relief stays distinct from merits claims while remaining linked

### Dependencies
Sprint 9

---

## Sprint 13 — Research Library / Authority Linking

### Objective
Add a minimal but useful legal research layer tied directly to elements and relief.

### Scope
- authority upload and storage
- proposition notes
- authority-to-element links
- controlling-authority tags
- built-in basic lookup/import path

### Deliverables
- research library page
- authority detail page
- proposition note workflow
- linked-authority panels in claims/relief

### Acceptance criteria
- user can connect statutes/cases/rules to specific claim elements or relief issues
- unresolved legal questions can be tracked separately from factual gaps

### Dependencies
Sprint 8, Sprint 9

---

## Sprint 14 — Multi-Agent Review / AI Council v1

### Objective
Enable side-by-side AI analysis of strengths, weaknesses, defenses, and gaps.

### Scope
- multi-provider AI connector layer
- agent persona registry
- agent-run object model
- side-by-side result comparison UI
- synthesis panel
- convert-to-task / convert-to-note actions
- matter-level AI-sharing policy enforcement

### Deliverables
- AI Review module
- provider settings page
- saved agent personas
- comparison run screen

### Acceptance criteria
- user can ask multiple models/agents to analyze a claim or chronology issue
- app records what context was sent to which provider
- agent output can be saved as notes/tasks without altering approved facts

### Dependencies
Sprint 5, Sprint 9, Sprint 13; optionally enhanced by Sprint 11

---

## Sprint 15 — PDF Export for Chronology and Claim Charts

### Objective
Create practical attorney-reviewable exports once the underlying modules are stable.

### Scope
- print styles and print routes
- PDF export for chronology
- PDF export for claim chart
- optional export filters
- page-break logic
- clean heading and source-reference rendering

### Deliverables
- export controls on chronology and claim chart screens
- PDF preview/print path
- export settings for inclusion of notes or hidden details

### Acceptance criteria
- user can export chronology and claim chart to legible PDF
- ordering, structure, and key support notes survive export

### Dependencies
Sprint 6, Sprint 9

---

## Sprint 16 — Drafting Studio Foundation

### Objective
Generate draft text from approved facts and linked authorities.

### Scope
- draft section model
- chronology narrative generation
- statement-of-facts drafting
- claim section drafting stub
- paragraph support inspector
- warnings for unsupported sentences

### Deliverables
- drafting studio screen
- paragraph-to-support trace panel
- basic chronology narrative generator

### Acceptance criteria
- user can generate a chronology narrative or simple claim section from approved facts
- the app can show what facts and authorities support each paragraph

### Dependencies
Sprint 6, Sprint 9, Sprint 13, Sprint 14

---

## Sprint 17+ — Stabilization / UX Refinement / Advanced Intelligence

### Ongoing objective
Continuously improve usability, trust, and analytical leverage.

### Candidate ongoing work
- contradiction detection
- authentication/foundation planner
- damages schedules
- stronger graph visualization
- red-team workflows
- performance optimization
- collaboration refinement
- better bulk actions
- expanded PDF/report templates
- more MCP connectors
- connector health monitoring
- sanitized evidence-sharing controls by provider

---

## 6. Feature Dependency Map

### Foundational dependency chain
1. Repo safety and handoff workflow
2. Workspace and matter architecture
3. Actor registry
4. Source ingestion
5. Source ledger
6. Proposal review
7. Chronology and proof graph
8. Claim chart
9. Search and MCP retrieval
10. Relief and research
11. Multi-agent review
12. Export and drafting

### Hard dependencies
- claim chart depends on approved facts and proof links
- chronology depends on fact/event review workflow
- multi-agent review depends on permissions and AI-sharing controls
- MCP ingestion depends on source provenance and review queue
- PDF export depends on stable view structure

---

## 7. Definition of Done for Each Sprint

A sprint should only be considered done when:
- code runs locally on the user's machine
- basic test instructions are added to `handoff/TESTING.md`
- known issues are documented
- backlog priorities are updated
- work log is updated
- any discovered defects are triaged
- branch is committed and pushed
- user is given a concise testing checklist

---

## 8. Suggested Initial Backlog Seed

## P0 — Foundation
- create local-safe `.gitignore`
- define env strategy and secrets handling
- add handoff docs
- create diagnostic collection script
- set branch conventions
- define evidence-storage directory strategy
- add CI workflow (lint/typecheck/test) and secret scanning
- create workspace backup/export script

## P1 — Core product value
- workspace shell
- matter CRUD
- proceeding/overlay matter model
- actor registry
- source upload
- OCR worker
- VLM description worker
- source ledger UI
- proposal review inbox
- chronology table
- claim chart v1

## P2 — Intelligence
- hybrid search
- gap detection
- contradiction detection
- relief matrix
- research library
- multi-agent review
- MCP connector framework
- first MCP data-source adapter

## P3 — Leverage and polish
- PDF export
- drafting studio
- graph view improvements
- performance tuning
- collaborative review refinement
- advanced filters and bulk actions

---

## 9. Suggested Bug Triage Policy

### Critical
- data loss
- evidence corruption
- incorrect permissions exposure
- source/fact mismapping that alters trusted record
- app cannot start locally

### High
- OCR failures on common evidence
- proposal review actions not persisting
- chronology ordering errors
- claim chart support not updating correctly

### Medium
- search relevance issues
- UI glitches in review panels
- export formatting errors that do not affect analysis correctness

### Low
- minor style issues
- non-blocking layout inconsistencies
- low-priority workflow friction

---

## 10. Testing Strategy by Stage

### Early-stage testing focus
#### Sprints 0–3
- install/setup reliability
- file upload stability
- evidence storage safety
- OCR/VLM processing visibility

#### Sprints 4–6
- source-ledger correctness
- proposal review trust flow
- chronology generation reliability

#### Sprints 7–9
- proof-link integrity
- claim mapping correctness
- gap detection usefulness

#### Sprints 10–14
- retrieval quality
- MCP connector provenance handling
- AI provider controls
- multi-agent comparison usefulness

#### Sprints 15+
- export fidelity
- drafting trustworthiness
- performance and collaboration refinement

---

## 11. Specific Notes on MCP Connector Planning

The MCP connector requirement should be treated as a **platform capability**, not a single one-off integration.

### Design goals for MCP support
- configurable connector registry
- per-connector permission controls
- provenance retention on imported results
- read-only ingestion first
- result review before import into trusted workspace records
- connector health/error logging
- support for evidence discovery and research discovery separately

### Recommended first MCP use cases
1. search a local or remote document knowledge base for names, events, or addresses
2. pull candidate documents into the evidence review queue
3. search a research library or legal note repository for linked authorities
4. support external “find related material” runs from a claim or event page

### Recommended sequencing
Implement MCP after core source, review, and search models exist. Otherwise, external results will arrive before the app has a safe place to put them.

---

## 12. Roadmap Recommendation Summary

### Best first 7 sprints
If the goal is fastest route to a valuable demo-quality system, prioritize:
1. Sprint 0 — foundations
2. Sprint 1 — workspace/matters
3. Sprint 2 — actors (a minimal actor-registry stub is acceptable on the demo path, but Sprint 2 cannot be skipped entirely: Sprint 3 depends on it)
4. Sprint 3 — source ingestion
5. Sprint 4 — source ledger
6. Sprint 5 — proposal review
7. Sprint 6 — chronology

### Best first 11 sprints for core product value
Add:
8. Sprint 7 — proof graph foundation
9. Sprint 8 — claim templates
10. Sprint 9 — claim chart
11. Sprint 10 — search

At that point the app should already be highly useful.

---

## 13. Exit Criteria for “Useful v1”

The app should be considered a useful first version when the user can:
- manage multiple linked matters in one workspace
- upload evidence and run OCR
- maintain a source ledger inside the app
- review and approve factual/event proposals
- build a chronology from approved facts
- map approved facts to claim elements
- identify major proof gaps
- search sources and linked objects effectively
- export a chronology or claim chart to PDF for attorney review

---

## 14. Recommended Next Planning Artifact

After this roadmap, the next strongest planning step is:

### Option A — Technical Implementation Spec
- database schema draft
- API surface
- background worker architecture
- file storage conventions
- AI provider abstraction
- MCP connector abstraction

### Option B — Screen-by-Screen UX Spec
- layout
- navigation
- interactions
- states
- edge cases

### Recommendation
Do the **technical implementation spec next**, because the roadmap now clearly defines build order and dependencies.

---

**End of Build Roadmap / Sprint Plan**
