# Legal Matter Intelligence Workspace — Screen-by-Screen UX Specification

**Status:** UX planning draft  
**Companion documents:**
- `Legal_Matter_Intelligence_PRD.md`
- `Legal_Matter_Intelligence_Roadmap.md`
- `Legal_Matter_Intelligence_Technical_Spec.md`

**Product posture:** Local-testable, evidence-centered legal workspace with reviewed fact intake, New York-first legal workflow, and multi-agent analysis support.

---

## 1. Purpose of This UX Specification

This document defines the primary screens, navigation, interaction patterns, review flows, and information architecture for the Legal Matter Intelligence Workspace.

Its purpose is to ensure the app is not only structurally sound but also genuinely usable for serious legal analysis. The product must support dense, linked information without feeling chaotic. The interface should help the user move fluidly from:

- evidence
- to facts
- to chronology
- to claims
- to relief
- to drafting

while always preserving traceability and review state.

---

## 2. UX Design Principles

## 2.1 Core principles

### 1. Traceability should always be visible
A user should rarely wonder:
- where this fact came from
- what source supports this claim element
- whether this is approved or just proposed

### 2. Review state must be obvious
The app should visually distinguish:
- raw source material
- machine proposals
- reviewed facts
- disputed items
- excluded evidence

### 3. Dense information, calm presentation
The product is for legal analysis, so it cannot be excessively simplified. It should support high information density, but with:
- good spacing
- collapsible details
- strong filtering
- predictable layout zones

### 4. One object, many views
Chronology, claim chart, and source-ledger data should appear in multiple views without becoming separate inconsistent records.

### 5. Side-by-side comparison is essential
Legal work often involves comparing:
- source and extracted fact
- support and adverse facts
- matter and proceeding overlap
- outputs from multiple AI agents

### 6. Keyboard-driven workflows matter
The UI should support fast navigation, selection, filtering, and review actions for power users.

### 7. Modern, professional, non-gimmicky visual language
This is not a consumer chat app. Avoid playful visual metaphors that undermine legal seriousness.

---

## 3. Global Information Architecture

## 3.1 Primary app navigation
Top-level left navigation:

1. Workspace Home
2. Matters
3. Evidence
4. Chronology
5. Claims
6. Relief
7. Research
8. Drafting
9. AI Review
10. Tasks
11. Settings / Integrations

### Notes
- These are global entry points.
- Most work will happen inside a selected matter context.
- Users should be able to jump between workspace-wide and matter-specific views.

---

## 3.2 Matter-level navigation
When a matter is selected, show a matter sub-navigation:

- Overview
- Sources
- Facts
- Chronology
- Claims
- Relief
- Research
- Drafts
- Tasks
- Activity

If the selected record is a proceeding/overlay matter, add a badge such as:
- `Proceeding`
- `Overlay`
- `Linked to 2 matters`

---

## 3.3 Global layout pattern
Recommended layout for most main screens:

### Left pane
- global navigation
- matter switcher
- filters/saved views
- object list or hierarchy

### Center pane
- primary working surface
- document viewer, chart, timeline, or form

### Right pane
- details/inspector
- metadata
- linked objects
- AI suggestions
- review actions
- comments

This 3-zone structure should be consistent across most modules.

---

## 3.4 Global header contents
Top header should include:
- current workspace name
- current matter name
- quick search box
- command palette trigger
- notifications/review count
- pending jobs indicator
- user/profile menu

---

## 4. Global UI Building Blocks

## 4.1 Common components

### A. Status badges
Used throughout for:
- review state
- support strength
- source status
- AI sharing mode
- matter type
- task priority

### B. Link chips
Small clickable chips linking related objects:
- source IDs
- fact IDs
- event IDs
- claim codes
- actor names
- authority references

### C. Inspector panel
Standard right-side detail panel that can show:
- metadata
- links
- notes
- comments
- history
- AI actions

### D. Evidence anchor block
Standard reference card with:
- source title
- page/locator
- excerpt snippet
- support type
- confidence
- open-in-viewer action

### E. Review action bar
Repeated wherever review occurs:
- accept
- accept with edits
- reject
- defer
- mark uncertain

### F. Saved filters / saved views
Highly useful for legal workflows such as:
- unsupported elements
- testimony-only support
- all excluded evidence
- open verification tasks

---

## 4.2 Color and visual semantics
Suggested semantic color usage:
- **Green:** approved / strong support
- **Blue:** informational / linked / active context
- **Amber:** review needed / caution / weak support
- **Red:** conflict / excluded / risk / error
- **Gray:** background / archived / inactive / unresolved

Use color sparingly and always pair with text labels.

---

## 5. Screen Priority Recommendation

Recommended UX implementation order:
1. App shell and navigation
2. Matter overview
3. Evidence repository
4. Source detail viewer with proposal sidecar
5. Proposal review inbox
6. Chronology workspace
7. Claim chart workspace
8. Global search
9. Relief matrix
10. AI Review / multi-agent comparison
11. Research
12. Drafting

---

## 6. Screen Specifications

# Screen 1 — Workspace Home

## Purpose
Provide a high-level command center across all matters.

## Primary users
- workspace owner
- attorney reviewer

## Layout
### Left pane
- navigation
- workspace switcher (if future multi-workspace support exists)

### Center pane
- summary cards
- active matter list
- recent uploads
- recent approvals/proposals
- open high-priority tasks

### Right pane
- activity feed
- quick metrics
- agent run summaries
- unresolved warnings

## Key modules on screen
- Matter status board
- Open review count
- Unsupported-elements summary by matter
- Recent evidence ingest jobs
- Recent chronology additions
- Upcoming testing/build notes (optional admin block)

## Core actions
- create matter
- create proceeding
- upload source
- review proposals
- run AI review
- open claim chart

## Important UX behavior
- show cross-matter procedural overlays clearly
- make unresolved review items impossible to miss

---

# Screen 2 — Matters Index

## Purpose
Provide a browsable list of all matters and overlay proceedings.

## Layout
### Left pane
- matter filters
- saved views
  - active merits matters
  - proceedings only
  - archived
  - matters with unsupported claims

### Center pane
- table or card list of matters

### Right pane
- selected matter preview/details

## Matter list columns
- name
- slug
- type
- status
- theory summary
- next work
- related matters count
- sources count
- claims count
- last activity

## Core actions
- create matter
- archive matter
- open matter
- relate matters

---

# Screen 3 — Matter Overview

## Purpose
This is the main working dashboard for a single matter.

## Layout
### Left pane
- matter sub-nav
- saved matter views

### Center pane
Matter summary dashboard with stacked modules:
1. matter header
2. theory/status/next work
3. chronology highlights
4. claims summary
5. evidence summary
6. relief summary
7. open tasks

### Right pane
- linked matters/proceedings
- recent comments
- recent AI runs
- review queue summary

## Matter header contents
- matter title
- matter type badge
- status badge
- jurisdiction badge (`NY`)
- AI sharing policy badge
- related matters count

## Key cards
### A. Claims health card
- number of live claims
- number unsupported or conflicted
- claims needing authority verification

### B. Evidence health card
- number of sources
- number unreviewed
- excluded count
- duplicate candidates

### C. Chronology health card
- approved events count
- unresolved date issues
- duplicate event warnings

### D. Relief card
- active relief requests
- requests missing factual support

## Primary actions
- upload evidence
- review proposals
- open chronology
- open claims
- run AI review on matter

---

# Screen 4 — Evidence Repository / Sources Index

## Purpose
Provide searchable, filterable access to all source evidence for the selected matter or workspace.

## Layout
### Left pane
- filters
- source categories
- saved views

### Center pane
- source table or gallery list

### Right pane
- selected source summary

## Filter categories
- matter
- source type
- source status
- evidence review status
- included/excluded
- duplicate candidate
- OCR complete/incomplete
- privileged/restricted
- actor mentions

## List columns
- source title
- original filename
- matter(s)
- source type
- source status
- review status
- included/excluded
- page count
- OCR status
- last updated

## Key actions
- upload source
- bulk tag
- bulk link to matter
- mark included/excluded
- open source viewer
- request reprocess

## UX notes
- list view should be default for legal work
- optional thumbnail/gallery view for image-heavy evidence

---

# Screen 5 — Source Detail Viewer with Proposal Sidecar

## Purpose
This is one of the most important screens in the app. It is where raw evidence becomes usable structured analysis.

## Layout
### Left pane
- source navigation within selected matter/filter
- page thumbnails or outline

### Center pane
Document/image viewer:
- PDF page viewer
- image viewer
- text/markdown viewer
- spreadsheet preview where practical

### Right pane
Tabbed inspector:
1. Metadata
2. Proposals
3. Facts
4. Events
5. Links
6. Comments
7. History

## Core interactions
- select text or region to create excerpt
- click page/excerpt to view related proposals
- accept/reject proposals without leaving source
- manually create fact from excerpt
- manually create event from excerpt
- link excerpt to actor, claim, or task

## Proposal sidecar details
Each proposal card should show:
- proposal type
- confidence
- proposed text
- source anchor reference
- action buttons
- if applicable: actor/date suggestions

## Metadata tab should show
- source title
- source type
- upload date
- linked matters
- source status
- evidence review status
- authentication notes
- restrictions
- duplicate warnings

## Critical UX requirement
The user must be able to compare the proposed fact directly to the underlying page/snippet without context switching.

## Nice-to-have interactions
- split viewer with current page and OCR text
- jump from proposal to highlighted anchor
- see all claims that currently cite this source

---

# Screen 6 — Proposal Review Inbox

## Purpose
Provide a dedicated queue for reviewing AI/system-generated proposals before they affect the trusted record.

## Layout
### Left pane
- proposal type filters
- matter filters
- confidence filters
- source filters
- review state filters

### Center pane
- proposal queue list
- selectable proposal detail panel or stacked card feed

### Right pane
- source anchor preview
- related object preview
- comments/history

## Queue views
- All proposals
- Fact proposals
- Event proposals
- Contradiction flags
- Merge/duplicate suggestions
- Verification-task suggestions

## Proposal card elements
- type badge
- matter
- source reference
- proposed text
- confidence
- linked actors/dates if identified
- review action bar

## Bulk actions
- accept selected
- reject selected
- assign for review
- defer selected

## UX guardrail
Bulk-accept should be available, but only after showing enough context to avoid reckless approval.

## Key shortcuts
- `A` accept
- `E` edit + accept
- `R` reject
- `D` defer
- `J/K` move through queue

---

# Screen 7 — Facts Index / Approved Fact Workspace

## Purpose
Provide a stable workspace for approved or review-state fact assertions.

## Layout
### Left pane
- filters and saved views

### Center pane
- table of facts

### Right pane
- selected fact inspector

## Table columns
- fact ID
- short label
- fact statement
- review state
- confidence
- linked source count
- linked event count
- linked claim count
- actor tags
- verification status

## Right-pane inspector tabs
- Support
- Actors
- Events
- Claims
- Relief
- Comments
- History

## Core actions
- edit fact
- supersede fact
- link/unlink source support
- link to event
- link to claim element
- create task from fact gap

## UX notes
This is where power users will clean up the factual core. It should feel table-driven and efficient.

---

# Screen 8 — Chronology Workspace

## Purpose
Translate approved facts into a flexible, source-backed chronology.

## Layout
### Left pane
- chronology filters
- saved views
- display mode switcher

### Center pane
One of several views:
- Table view
- Timeline view
- Actor swimlane
- Theory swimlane
- Printable report preview

### Right pane
- selected event inspector
- linked support
- open issues
- comments

## Default table columns
- date / date range
- event title
- description
- actors
- significance
- source support count
- linked claims
- confidence
- review state

## Event inspector tabs
- Description
- Support
- Actors
- Claims
- Relief
- Comments
- History

## Critical interactions
- merge duplicate events
- split overbroad events
- adjust date precision
- drag or reorder in timeline view only where appropriate
- create event from selected fact(s)
- filter chronology by actor or claim

## Important UX behavior
Switching between chronology views should not feel like switching modules. It is one dataset, multiple visualizations.

## Printable report mode
Should present:
- date
- event title
- concise description
- support citations
- significance tags if selected

---

# Screen 9 — Claim Templates Library

## Purpose
Let the user inspect and select New York-first claim and defense templates.

## Layout
### Left pane
- jurisdiction filter
- category filter
- search

### Center pane
- template list

### Right pane
- selected template detail

## Template detail sections
- name
- jurisdiction
- source authority note
- element list
- caveats
- create claim from template button

## UX notes
This screen may be used less often than the live claim chart, so it can be simpler.

---

# Screen 10 — Claim Chart Workspace

## Purpose
This is the core legal-analysis screen. It should make it easy to see, element by element, what supports the claim and what is missing.

## Layout
### Left pane
- claim list within matter
- claim status filters
- saved views:
  - unsupported elements
  - authority gaps
  - conflicted claims
  - strongest claims

### Center pane
Claim chart grid or stacked element view

### Right pane
Selected claim element inspector

## Claim header
- claim code
- claim name
- target defendants
- status
- theory summary
- authority verification state
- highest-priority gap

## Main center-pane options
### A. Matrix view
Rows = elements  
Columns = support status / support facts / adverse facts / authorities / gap / notes

### B. Stacked element cards
Useful when reading deeply rather than scanning.

### C. Heatmap summary
Condensed visual overview of coverage strength across claim elements.

## Element row contents
- element label
- element description
- support status badge
- support fact count
- adverse fact count
- authority status
- gap summary
- warning icons for:
  - testimony-only support
  - no controlling authority linked
  - conflict present

## Right-pane element inspector tabs
1. Support Facts
2. Adverse / Conflicting Facts
3. Source Anchors
4. Authorities
5. Tasks / Gaps
6. Comments
7. History

## Critical interactions
- link fact to element
- unlink fact from element
- change weight/notes
- create verification task from element gap
- run AI review on selected claim or element
- launch search for more support
- jump from element to sources

## Best UX behavior
If a user clicks “weak support,” the system should immediately explain why:
- only one fact linked
- no primary source anchor
- support is testimony only
- adverse fact also present

That explanation is more useful than a bare label.

---

# Screen 11 — Cross-Matter Proof Map / Relationship View

## Purpose
Provide a visual “connect the dots” view across facts, actors, events, claims, and relief.

## Layout
### Left pane
- node filters
- scope controls

### Center pane
- graph visualization or relational map

### Right pane
- selected node inspector

## Node types
- matter
- actor
- source
- fact
- event
- claim
- element
- relief
- authority
- task

## Edge labels
- supports
- contradicts
- mentions
- linked to
- affects
n- cited by
- shares actor with

## UX warning
Graph views can become noisy. This should be optional and filter-driven, not the default working view.

## Recommended use
Best for:
- debugging theory overlap
- showing cross-matter links
- spotting single points of proof dependency

---

# Screen 12 — Relief Matrix Workspace

## Purpose
Keep requested relief separate from merits claims while showing support, risk, and fallback strategy.

## Layout
### Left pane
- relief request list
- filters by type/status

### Center pane
- relief matrix table or card view

### Right pane
- relief request inspector

## Matrix columns
- request
- category
- practical objective
- supporting facts count
- supporting claims count
- principal risk
- fallback
- recommendation state

## Inspector tabs
- Summary
- Facts
- Claims
- Authorities
- Risks
- Fallback
- Comments

## Important UX behavior
A relief request should immediately show whether it is:
- well-supported
- strategically risky
- procedurally blocked
- better framed as fallback relief

---

# Screen 13 — Research Library

## Purpose
Keep legal authorities tied to analytical use rather than buried in disconnected notes.

## Layout
### Left pane
- authority type filters
- jurisdiction filters
- saved views

### Center pane
- authority list

### Right pane
- authority detail/proposition inspector

## Authority list columns
- title
- type
- citation
- jurisdiction
- linked claims/elements count
- matter scope
- controlling/background tag

## Detail sections
- citation
- proposition notes
- pinpoints
- linked claim elements
- linked relief issues
- uploaded source or external link

## Core actions
- add proposition note
- link authority to element
- mark as controlling
- attach authority upload

---

# Screen 14 — AI Review / Multi-Agent Council

## Purpose
Allow the user to pose questions about strengths, weaknesses, risks, and missing proof to multiple AI agents/providers.

## Layout
### Left pane
- saved agent sets
- prior runs
- run filters

### Center pane
- current question and results grid

### Right pane
- run manifest
- synthesis panel
- disposition actions

## Primary sections
### A. Prompt/setup panel
- question text
- matter scope
- claim/event/fact selection
- sharing policy
- agent persona selection

### B. Side-by-side results
Columns or cards for each agent/model:
- provider/model
- persona name
- answer
- strengths found
- weaknesses found
- missing proof
- suggested next steps

### C. Synthesis area
Generated or user-written synthesis showing:
- consensus
- disagreements
- likely next actions

## Right-pane manifest should show
- what context was sent
- whether excerpts or full docs were shared
- provider used
- prompt version
- timestamp

## Key actions
- convert finding to task
- save as note
- create fact proposal
- create claim risk note
- rerun with narrower scope

## Critical guardrail
The user must always know what left the local app and went to an external model.

---

# Screen 15 — Drafting Studio

## Purpose
Generate structured legal work product from approved facts and linked authorities.

## Layout
### Left pane
- draft list
- draft type selector

### Center pane
- rich-text draft editor/viewer

### Right pane
- support inspector
- comments
- AI drafting controls

## Draft types
- chronology narrative
- statement of facts
- claim section
- relief section
- memo section
- demand/preservation letter

## Paragraph support inspector
When a paragraph is selected, show:
- linked facts
- linked authorities
- support state
- missing support warning

## Core actions
- generate from selected facts
- refine paragraph
- reveal support chain
- add comment
- export/print preview

## UX rule
The drafting experience should feel like supported composition, not freeform hallucination.

---

# Screen 16 — Tasks / Verification Queue

## Purpose
Track proof gaps, research tasks, and build/test follow-up items.

## Layout
### Left pane
- task filters
- saved views

### Center pane
- task table or kanban toggle

### Right pane
- task details

## Task categories
- verification
- research
- drafting
- evidence follow-up
- claim gap
- bug
- feature
- connector review

## Columns
- title
- matter
- priority
- status
- type
- linked object
- assigned to
- due date

## Notes
This screen should also support the product-development workflow at least lightly if desired, though legal matter tasks remain the primary focus.

---

# Screen 17 — Activity / Audit Log

## Purpose
Provide transparency into changes, approvals, imports, and AI runs.

## Layout
### Left pane
- filters by object/action/user

### Center pane
- activity feed / audit table

### Right pane
- event detail / before-after comparison

## Important activity types
- fact approved
- event edited
- source excluded
- claim element linked
- AI run completed
- connector import completed
- export generated

## UX note
For legal trust and collaborator review, this screen matters more than in a typical app.

---

# Screen 18 — Settings / Integrations

## Purpose
Configure workspace behavior, AI providers, sharing policy, connectors, and defaults.

## Tabs
1. Workspace
2. Members & Permissions
3. AI Providers
4. Agent Personas
5. MCP Connectors
6. Storage & Processing
7. Export Settings
8. Diagnostics

## AI Providers tab
Show:
- provider list
- enabled/disabled
- model defaults
- local-only vs external markers
- credential status (never raw secrets)

## MCP Connectors tab
Show:
- connector list
- scope (`evidence`, `research`, `both`)
- enabled/disabled
- health status
- last run
- test connection action

## Diagnostics tab
Show:
- current branch/build info
- worker health
- log collection instructions
- create diagnostic bundle action

---

## 7. Cross-Screen Interaction Patterns

## 7.1 Source → fact → event → claim workflow
Ideal user flow:
1. open source
2. review proposed fact
3. accept or edit fact
4. create/link event
5. open affected claim element
6. link fact to element
7. view change in chronology and claim chart

This workflow should feel seamless.

---

## 7.2 Matter-context persistence
When a user moves from chronology to claim chart, preserve:
- selected matter
- active filters where appropriate
- recently viewed object context

---

## 7.3 Deep linking
Every major object should have a stable URL:
- matter
- source
- excerpt
- fact
- event
- claim
- element
- relief request
- authority
- agent run

This is important for collaboration and handoff.

---

## 7.4 Comments everywhere
Users should be able to comment on almost any major object without leaving context.

---

## 8. Empty States, Edge States, and Warnings

## 8.1 Empty states
Good empty states should guide action.

### Examples
#### Evidence repository empty
“Upload your first source to begin evidence analysis.”

#### No chronology events
“No approved events yet. Review source proposals or create an event manually.”

#### No claims
“Create a claim from a New York template or enter a custom claim.”

#### No AI providers configured
“Add a provider or local model connector to run multi-agent review.”

---

## 8.2 Warning states
The UI should clearly warn when:
- a claim element has no support
- a claim is based only on testimony
- a source is excluded but still linked downstream
- chronology events conflict on date or actor
- a connector result lacks clear provenance
- an AI run would violate matter sharing policy

---

## 8.3 Error states
Errors should be human-readable and actionable.

Example:
- bad: “Processing failed.”
- good: “OCR failed for this PDF. The file may be image-corrupted or password-protected. You can retry, upload a different copy, or mark this source for manual review.”

---

## 9. Review-State Visual Language

## 9.1 Recommended labels
- Proposed
- Approved
- Approved with edits
- Rejected
- Deferred
- Uncertain
- Disputed
- Superseded

## 9.2 Where to show them
- facts
- events
- proposals
- connector results
- AI-generated suggestions
- draft paragraphs if support-checked

---

## 10. Search and Command Experience

## 10.1 Global search
Search should allow:
- object-type filtering
- matter filtering
- exact phrase search
- semantic search
- recent searches

## 10.2 Command palette
Suggested commands:
- Upload source
- Create matter
- Open chronology
- Open claim chart
- Review next proposal
- Run AI review
- Create task
- Export chronology PDF
- Search this matter for actor

---

## 11. Accessibility and Usability Requirements

### Minimum requirements
- keyboard navigable tables and lists
- visible focus states
- sufficient color contrast
- non-color-only status indicators
- readable print styles
- resizable panels where practical

### Important legal-workflow requirement
Tables and dense views must remain usable without requiring mouse-only interaction.

---

## 12. Responsive Strategy

This is primarily a desktop/laptop application.

### Recommended responsive posture
- **desktop-first**
- tablet support acceptable but secondary
- mobile support limited to light review, not full matter analysis

### On narrower widths
- right inspector may become slide-over
- graph view may be disabled or simplified
- large claim-chart matrices may switch to stacked element cards

---

## 13. Visual Tone Recommendation

### Overall tone
- professional
- contemporary
- quiet
- evidence-forward
- not flashy

### Recommended style signals
- subtle panel borders
- light/dark theme support later, not required early
- restrained typography hierarchy
- crisp table layouts
- thoughtful spacing around evidence citations and status chips

---

## 14. UX Risks to Avoid

1. **Too much hidden automation**  
   Users should not feel the app is changing the case file behind their backs.

2. **Too many modal dialogs**  
   Use side panels/drawers more than modal interruption.

3. **Graph view becoming the whole product**  
   Graph is secondary; table and document workflows are primary.

4. **Evidence viewer disconnected from downstream analysis**  
   The source viewer must be richly connected to facts, events, and claims.

5. **AI review feeling like generic chat**  
   It should feel structured, inspectable, and tied to matter objects.

6. **Export-first design pressure**  
   Printable outputs matter, but the in-app analysis experience is the core product.

---

## 15. Recommended UX Milestones

### UX Milestone A — Trustworthy intake
- Evidence repository
- Source detail viewer
- Proposal review inbox

### UX Milestone B — Analytical core
- Chronology workspace
- Claim chart workspace
- Search

### UX Milestone C — Strategic overlay
- Relief matrix
- Research library
- AI Review

### UX Milestone D — Work product
- Drafting studio
- export polish

---

## 16. Recommended First Interactive Prototype Set

If creating wireframes/prototypes next, prioritize these 6 screens first:
1. Matter Overview
2. Evidence Repository
3. Source Detail Viewer with Proposal Sidecar
4. Proposal Review Inbox
5. Chronology Workspace
6. Claim Chart Workspace

These six screens cover the main product promise.

---

## 17. Final UX Definition

The interface should behave like a legal analysis cockpit: evidence on one side, structured reasoning in the middle, and review/control on the other. Users should be able to move from raw source material to approved facts, chronology, claim support, and strategic review without losing context or traceability.

---

## 18. Recommended Next Planning Artifact

After this UX specification, the strongest next artifact is:

### Database schema draft
with:
- concrete field types
- SQLAlchemy model outline
- migration-ready definitions
- enum implementation plan
- sample records for core flows

That will let the product move from planning into implementation with less ambiguity.

---

**End of UX Specification**
