# Legal Matter Intelligence Workspace — Formal Build Specification / PRD

**Status:** Planning draft for product and build alignment  
**Product type:** Full-stack web application  
**Primary deployment posture:** Local-first testing with real evidence on the user's machine; future private cloud capable  
**Jurisdiction focus:** New York-first  
**Primary outputs:** Claim analysis, evidence analysis, chronology, relief planning, attorney-reviewable work product
**Product-value priority:** Claims → Evidence → Chronology → Relief → Drafting  
**Implementation order:** Foundations → Evidence → Facts → Chronology → Claims → Relief → Drafting

---

## 1. Executive Summary

This product is a **matter intelligence workspace** for legal claims and associated evidence. It is not a generic document manager and not a generic AI chat wrapper. Its central purpose is to help a user **connect the dots** between:

- factual background
- source evidence
- dated events
- parties and actors
- claim elements and causes of action
- defenses and risks
- requested relief
- draft legal work product

The app's core differentiator is a **reviewed proof graph** that links source material to approved factual propositions, chronology entries, claim elements, and relief requests. AI should assist throughout the workflow, but **AI must not silently alter the trusted factual record**.

The app will support:
- a **master workspace** with multiple linked matters and overlay proceedings
- structured evidence ingestion with OCR and image understanding
- event extraction and chronology review
- element-by-element claim charts with gap detection
- evidence inclusion/exclusion tracking and explanation
- collaborator and attorney review workflows
- multi-agent analysis via multiple AI providers
- printable and PDF-exportable legal analysis views
- disciplined local testing and remote build handoff workflow

---

## 2. Product Vision

### Vision statement
Create a New York-optimized legal workspace where every important theory, claim element, and relief request can be traced back to approved facts and actual evidence, while enabling human review, attorney collaboration, and AI-assisted analysis.

### Product promise
A user should be able to answer, at any time:
1. **What happened?**
2. **What evidence supports it?**
3. **What claim elements does it matter to?**
4. **What is missing, disputed, or risky?**
5. **What relief is practical to request?**
6. **Can I export a clean chronology or claim chart for attorney review?**

---

## 3. Problem Statement

Legal claims are often developed across scattered notes, PDFs, screenshots, emails, timelines, and draft pleadings. Existing tools typically fail in one or more of the following ways:

- documents are stored but not meaningfully linked to claim elements
- AI summarizes without preserving citation fidelity
- chronology and claim charts become stale static files
- facts, inferences, and legal conclusions are mixed together
- it is hard to distinguish primary proof from derived summaries or testimony
- collaborators cannot easily review what AI proposed and what humans approved
- legal theories and requested relief are not connected to the underlying proof

This product addresses those gaps by making **reviewed factual propositions** the foundation of downstream analysis.

---

## 4. Product Goals

### Primary goals
1. **Evidence-to-claim traceability**  
   Support a direct chain from source document to fact to event to element to claim to relief.

2. **High-trust factual workflow**  
   Ensure chronology entries and material fact assertions are reviewed before becoming part of the trusted record.

3. **Useful legal analysis structure**  
   Make claim charts, chronology, evidence logs, and relief analysis live structured modules rather than disconnected documents.

4. **Attorney collaboration**  
   Allow invited reviewers to inspect, comment on, and approve or critique analytical artifacts.

5. **AI-augmented, not AI-substituted**  
   Use AI for extraction, tagging, drafting, red-teaming, and synthesis, while preserving human control.

6. **Modern interface for serious legal work**  
   Deliver a clean, fast, multi-panel interface optimized for document review and analytical linking.

### Secondary goals
- support multi-matter workspaces with overlap across actors, sources, and proceedings
- support New York-focused claim and procedural workflows
- enable printable/PDF-ready outputs when analysis views mature
- support continuous improvement through disciplined backlog and testing loops

### Priority clarification
- **Product-value priority** reflects which outputs matter most to the user once the system is useful.
- **Implementation order** reflects dependency order. Claims are the top-value output, but reviewed evidence and facts must be built first so claims remain defensible and traceable.

---

## 5. Non-Goals

The initial product will **not** aim to be:
- a complete practice-management suite with billing, calendaring, or trust accounting
- a full e-discovery review platform
- a court e-filing system
- a fully autonomous legal reasoning engine
- a replacement for attorney judgment or legal advice
- a final polished reporting engine before core analysis workflows are robust

---

## 6. Target Users and Roles

### Primary user
- **Workspace Owner**: the principal user managing real evidence, claims, chronology, and strategy

### Secondary users
- **Attorney Reviewer**: invited collaborator who reviews facts, claims, risks, and outputs
- **Collaborator / Analyst**: invited reviewer who may comment, propose edits, and perform structured review
- **Local Tester**: the person running the app locally with real evidence and returning logs to the remote coding agent

### Internal/system roles
- **AI Agent**: performs proposal-generation, analysis, and drafting assistance
- **Remote Coding Agent**: updates codebase, writes work logs, and provides testing instructions

---

## 7. Product Principles

1. **Proof first**  
   Every major output should trace back to source-backed facts.

2. **Facts are reviewed; suggestions are cheap**  
   AI may propose, but humans decide what enters the trusted record.

3. **Separate source, fact, event, and legal conclusion**  
   Do not collapse raw evidence and analytical inference into one object.

4. **Live analytical objects beat static memos**  
   Claim charts, chronology, and relief matrices should be interactive views over structured data.

5. **Explicit uncertainty is a feature**  
   Confidence, source status, restrictions, and verification tasks must be visible.

6. **Designed for lawyering, not generic note-taking**  
   The product should reflect how litigators think: proof, elements, defenses, remedies, procedure, and risks.

7. **Local-first safety for real evidence**  
   Assume users may handle sensitive material and need strong defaults against accidental remote publication.

---

## 8. Scope Summary

### In scope for the intended product
- master workspace with linked matters
- overlay matters/proceedings (e.g., leave/preservation proceedings)
- parties and actor registry
- evidence repository with OCR and image understanding
- source ledger and evidence log
- AI proposal review inbox
- chronology builder and views
- claim chart builder and gap detection
- relief matrix
- research library with uploads and basic built-in lookup
- drafting studio using approved facts
- multi-agent review module across multiple AI APIs
- audit trail, comments, approval states, export to PDF
- build handoff logs, local test instructions, and backlog discipline

### Not in initial MVP
- full external docket sync
- enterprise IAM/SSO
- comprehensive discovery productions and privilege logs
- offline mobile app
- advanced court rules automation beyond light procedural support

---

## 9. Core Domain Model

The app should be built around a structured, relational proof model.

### 9.1 Top-level objects

#### Workspace
The umbrella container for all matters, shared settings, AI connectors, users, and audit history.

#### Matter
A substantive case file or dispute thread.

#### Proceeding / Overlay Matter
A related proceeding that affects one or more matters procedurally or strategically, such as a leave/preservation proceeding.

#### Party / Actor
A person or entity appearing in the evidence or analysis.

#### Source
An uploaded file or record: PDF, email, image, screenshot, transcript, spreadsheet, note, etc.

#### Excerpt / Anchor
A page, paragraph, Bates range, timestamp, highlighted quote, or image region within a source.

#### Fact Assertion
A structured proposition extracted from a source or asserted by a user, with status and review metadata.

#### Ledger Entry
A structured source-ledger row that can remain as a working note, be promoted into a proposal, or be linked to one or more approved facts.

#### Event
A dated or date-ranged occurrence suitable for chronology and theory mapping.

#### Claim Template
A jurisdiction-aware cause-of-action or defense template with baseline elements.

#### Claim Instance
A matter-specific cause of action with targets, status, support, and gap tracking.

#### Element
An individual legal element or issue row within a claim instance.

#### Relief Request
A request for relief, preservation, accounting, inspection, access, damages, or procedural permission.

#### Research Authority
A case, statute, rule, jury instruction, or research note linked to legal propositions.

#### Task
A verification task, proof task, research task, or drafting task.

#### Agent Run
A record of a multi-step AI analysis or discussion.

#### Agent Run Artifact
A stored synthesis, consensus summary, disagreement note, or user-edited memo produced from one or more agent runs.

#### Draft Section / Work Product
A draft chronology, statement of facts, claim section, memo section, or relief section generated or edited in-app.

#### Draft Span
A paragraph- or sentence-level unit of draft text used for support validation and citation traceability.

### 9.2 Required relationships
- Workspace has many Matters and Proceeding records
- Matter has many Sources, Facts, Events, Claims, Relief Requests, Drafts, and Tasks
- A Source has many Excerpts
- An Excerpt may support or contradict many Facts
- A Fact may link to many Events, Claims, Elements, and Relief Requests
- An Event may involve many Actors and support many Claims
- A Claim has many Elements and may link to many Facts and Authorities
- A Relief Request may link to many Facts, Claims, Authorities, and Risks
- A Research Authority may link to many Claims, Elements, and Relief Requests
- An Agent Run may reference many Sources, Facts, Claims, and Drafts

### 9.3 Data-state separation
The app must clearly distinguish:
- raw uploaded source
- machine-extracted text or image description
- proposed facts/events
- reviewed/approved facts/events
- legal analysis and inference
- final exportable work product

---

## 10. Functional Requirements

## 10.1 Workspace and Matter Management

### Objectives
Support one master workspace containing multiple linked matters and overlay proceedings.

### Requirements
- Create a master workspace with a dashboard of all active matters
- Create, edit, archive, and relate matters
- Support matter metadata:
  - title
  - slug
  - status
  - theory summary
  - controlling memo
  - next work
  - jurisdiction
  - tags
- Support related-matter links:
  - overlaps with
  - procedurally affected by
  - shares sources with
  - shares actors with
- Support overlay proceedings that affect multiple matters
- Show cross-matter impacts in a visible manner

### Acceptance criteria
- User can create multiple linked matters under one workspace
- User can relate a proceeding to multiple merits matters
- Dashboard surfaces open tasks, recent uploads, unresolved gaps, and recent agent activity by matter

---

## 10.2 Parties and Actor Registry

### Objectives
Track all relevant people and entities across matters with role clarity.

### Requirements
- Create a unified actor registry across the workspace
- Support actor types:
  - plaintiff
  - co-party
  - counterparty
  - witness
  - custodian
  - counsel
  - court actor
  - other non-party
- Support aliases and normalized names
- Support role-by-matter distinctions
- Show actor appearances across sources, events, claims, and relief issues
- Allow tagging for authentication/foundation relevance

### Acceptance criteria
- User can open an actor dossier showing linked matters, sources, events, and claims
- Same actor can appear in multiple roles across multiple matters without data duplication

---

## 10.3 Evidence Repository and Source Management

### Objectives
Make sources searchable, reviewable, citable, and usable in downstream analysis.

### Requirements
- Upload documents, images, spreadsheets, notes, and PDFs
- Automatically classify source type when possible
- Run OCR on image/scanned documents
- Run VLM/image description for photos, screenshots, and image-only evidence
- Extract basic metadata where possible
- Detect likely duplicates and near-duplicates
- Support page-level and excerpt-level anchors
- Track source status:
  - primary
  - derived
  - testimony
  - working note
  - public docket material
- Track evidence-log status:
  - uploaded
  - processing
  - reviewed
  - cited
  - included
  - excluded
  - duplicate
  - privileged
  - settlement-use restricted
  - background only
  - impeachment only
- Track inclusion/exclusion rationale
- Track authentication/foundation fields
- Track restrictions/notes
- Permit linking a source to multiple matters where appropriate

### Acceptance criteria
- User can upload a file and inspect OCR text and extracted metadata
- User can mark a source included or excluded and record why
- User can search across source text and metadata
- Duplicate warnings appear before users create redundant source records

---

## 10.4 Source Ledger Module

### Objectives
Turn the source ledger into a first-class structured UI, not just an import format.

### Required fields
- source/fact ID
- date or date range
- short fact/event name
- factual statement
- claim use / relief use
- source path
- source locator
- source status
- authentication or witness
- confidence
- verification task
- restrictions or notes

### Requirements
- Provide spreadsheet-like and detail views
- Filter by claim, actor, matter, source status, confidence, and verification state
- Support import/export via CSV
- Support promoting a ledger row into a proposal or directly into a reviewed fact with audit history
- Allow one ledger row to map to one or more approved facts when the working row must be split
- Link ledger rows to claim elements and chronology entries
- Support bulk tagging and bulk review actions

### Acceptance criteria
- User can maintain source-ledger rows inside the app without leaving for a separate spreadsheet
- User can promote a ledger row into a proposal or fact without re-entering the source anchor manually
- Changes to approved rows update related chronology and claim views

---

## 10.5 Proposal Review Inbox

### Objectives
Make AI-generated extractions inspectable before they affect the trusted record.

### Proposal types
- fact proposals
- event proposals
- actor/entity proposals
- duplicate/merge proposals
- date normalizations
- claim-use suggestions
- contradiction flags
- verification task suggestions
- evidence restriction suggestions

### Review actions
- accept
- edit and accept
- merge
- reject
- defer
- mark uncertain

### Requirements
- Every proposal must show its source basis
- Users must be able to compare proposed text to source anchor
- All actions must be logged in audit history
- Review queues should be filterable by matter, proposal type, source, and confidence

### Acceptance criteria
- No chronology fact enters approved status without review when configured in review-required mode
- Accepted proposals generate or update linked fact/event records with audit entries

---

## 10.6 Chronology Module

### Objectives
Build reliable chronology views from approved or reviewable event data.

### Requirements
- Create chronology entries from approved facts and accepted event proposals
- Support date, date range, approximate date, and undated entries
- Tag chronology entries by:
  - significance
  - actor
  - claim theory
  - matter
  - source strength
- Detect duplicate or near-duplicate events
- Allow merge and split actions
- Show event confidence and unresolved verification tasks
- Link each chronology event to supporting source anchors and related claims

### Views
- tabular chronology
- timeline view
- actor swimlane view
- theory swimlane view
- graph/node view
- printable report view

### Acceptance criteria
- User can build a chronology from approved events and sort/filter it by matter, actor, and claim
- User can export a clean chronology view suitable for attorney review

---

## 10.7 Claim Chart Module

### Objectives
Support element-by-element mapping of causes of action to evidence with visible gaps, risks, and conflicts.

### Requirements
- Create claim instances from templates
- Support custom matter-specific claim modification
- Show claim summary fields:
  - claim ID
  - claim name
  - target defendant(s)
  - status
  - theory summary
  - highest-priority gap
  - authority verification state
- For each element, show:
  - supporting facts
  - adverse or conflicting facts
  - source support strength
  - linked authorities
  - open gaps
  - verification tasks
  - notes and guardrails
- Support support-status values:
  - no support
  - weak support
  - moderate support
  - strong support
  - disputed/conflicted
  - not researched
- Surface unsupported elements and over-dependent elements (e.g., supported only by testimony)
- Allow cross-links to relief requests and draft sections

### Acceptance criteria
- User can inspect a claim and see all element support from approved facts
- User can identify missing proof for each element without manually reviewing every source again
- Claim chart remains live as facts and sources are updated

---

## 10.8 Claim and Defense Template Library

### Objectives
Provide reusable New York-first legal templates while allowing jurisdiction-specific modification.

### Requirements
- Import baseline cause-of-action templates
- Store template metadata:
  - name
  - jurisdiction
  - source authority
  - element list
  - caveats
- Support matter-specific cloned versions
- Support defense templates as well as claim templates
- Track which authority source was used to confirm the live matter-specific element formulation

### Acceptance criteria
- User can create a claim from a template and record jurisdiction-specific modifications
- Template provenance remains visible for later review

---

## 10.9 Relief Matrix Module

### Objectives
Track requested relief as a separate analytical layer tied to facts and claims.

### Requirements
- Create relief requests with fields for:
  - request name
  - practical objective
  - factual support
  - linked source IDs
  - principal objection/risk
  - narrower fallback
  - current recommendation
  - procedural prerequisites
- Distinguish relief categories:
  - damages
  - injunction/restoration
  - preservation
  - accounting
  - inspection
  - access
  - leave to sue
  - case-management relief
- Link relief requests to claim and source support
- Support narrowing/fallback logic
- Support notes about prudence and credibility risks

### Acceptance criteria
- User can inspect a relief request and see facts, risks, and fallback positions in one place
- Relief matrix updates when linked facts are added or revised

---

## 10.10 Research Library

### Objectives
Keep legal research tied to claims, elements, and procedural issues.

### Requirements
- Upload and store statutes, cases, rules, memos, and notes
- Provide basic built-in web/import support for legal authority lookup
- Support proposition-based notes:
  - proposition
  - authority
  - pinpoint
  - jurisdiction
  - treatment/risk note
- Link authorities to claims, elements, relief, and procedural issues
- Separate “controlling authority” from “background note”

### Acceptance criteria
- User can attach authority support to a claim element
- User can see unresolved legal-authority questions separately from factual gaps

---

## 10.11 Drafting Studio

### Objectives
Generate usable draft sections based on approved facts and linked authorities.

### Draft types
- chronology report
- statement of facts
- claim section
- argument outline
- relief request section
- declaration outline
- demand letter
- preservation letter
- memo section

### Requirements
- Draft only from approved facts by default
- Use paragraph and sentence support spans so narrative text can be traced and validated below the whole-paragraph level
- Generate machine-readable support tags for AI-generated draft text so the app can validate what facts and authorities support each sentence/span
- Expose support chain for draft spans in the editor and inspector
- Warn when any draft sentence or span lacks an approved source-backed basis
- Link draft spans to facts and authorities used
- Allow attorney review comments and redlines

### Acceptance criteria
- User can generate a chronology narrative or claim section from approved facts
- Draft sentences/spans are traceable to supporting facts and authorities used

---

## 10.12 Multi-Agent Review Module

### Objectives
Allow the user to connect multiple AI providers and run structured agent analysis on case strengths, weaknesses, risks, and gaps.

### Requirements
- Support a provider-agnostic connector layer for:
  - OpenAI-compatible APIs
  - Anthropic
  - Google/Gemini
  - xAI/Grok
  - OpenRouter-style aggregators
  - optional local model connectors (e.g., Ollama/LM Studio)
- Support saved agent personas/workflows such as:
  - plaintiff strategist
  - defense red team
  - neutral evidence auditor
  - chronology reviewer
  - claim gap detector
  - drafting critic
  - settlement evaluator
  - procedural risk reviewer
- Use an explicit context-assembly pipeline so agent runs receive only scoped, relevant claim/event/fact/excerpt material rather than the whole matter by default
- Record for each agent run:
  - provider/model
  - prompt template and version
  - matter context
  - documents/excerpts provided
  - whether full documents or excerpts were shared externally
  - timestamp
  - output
  - synthesis
  - user disposition
- Store agent-run synthesis, consensus, disagreement, and memo artifacts as durable reviewable objects
- Support side-by-side or panel-based comparison of multiple agent opinions
- Permit users to convert agent suggestions into tasks, notes, or proposals

### Guardrails
- Agent output must never silently modify approved facts
- Agent output may create suggestions, tasks, warnings, or draft text only
- External AI use should be configurable per matter:
  - no AI
  - local-only AI
  - external AI using excerpts only
  - external AI using selected full documents

### Acceptance criteria
- User can run multiple agents on one question and compare their reasoning
- User can review what information was sent to each provider
- No agent run alters the trusted record without human review

---

## 10.13 Search and Retrieval

### Objectives
Support exact and semantic search over long legal records.

### Requirements
- Implement hybrid retrieval:
  - keyword/full-text search
  - metadata filtering
  - vector/semantic search
  - reranking
- Always return source anchors where possible
- Search by actor, date, matter, claim, source status, confidence, and restriction tags
- Support “show me all support for this element” workflows

### Acceptance criteria
- User can find exact quotes and semantically related evidence across the corpus
- Search results point back to specific source anchors rather than generic summaries

---

## 10.14 Collaboration, Comments, and Review

### Objectives
Support owner-controlled attorney/collaborator review from the first meaningful version.

### Permissions model
**Assumed v1 model:** Owner plus invited reviewers.

### Requirements
- Workspace owner controls invitations and permissions
- Reviewers can be assigned roles such as:
  - viewer
  - commenter
  - reviewer/approver
  - editor (limited)
- Support comments at object level:
  - source
  - excerpt
  - fact
  - event
  - claim
  - element
  - relief request
  - draft paragraph
- Support approval states and review queues
- Preserve audit trail of changes and approvals

### Acceptance criteria
- Attorney reviewer can comment on a claim element or chronology event without editing core data directly unless authorized
- Owner can see pending review items and approval history

---

## 10.15 Audit Trail and Versioning

### Objectives
Provide durable traceability for legal analysis and development workflow.

### Requirements
- Log creation, edit, approval, rejection, merge, deletion, and export actions
- Version changes to facts, events, claims, and drafts
- Record who made the change and when
- Support rollback of mistaken proposal acceptance where feasible
- Track prompt versions and agent-run context for AI outputs

### Acceptance criteria
- User can inspect why a fact changed and who approved it
- User can identify the prompt/model used for a given AI-generated suggestion or draft

---

## 10.16 Export and Reporting

### Objectives
Deliver useful exports for attorney review, beginning with claim charts and chronology.

### Priority
- earliest attorney-ready exports: claim chart and chronology
- PDF is important, but interface and analytical utility come first

### Requirements
- Support printable/PDF export for:
  - chronology
  - claim chart
  - source ledger/evidence log
  - relief matrix
- Maintain clean headers, page breaks, and source references
- Export should reflect visible filters where appropriate
- Preserve date ordering, section structure, and notes when selected

### Acceptance criteria
- User can export a chronology and claim chart to PDF in a legible attorney-reviewable format
- Export fidelity is sufficient for review meetings even before full “court-ready” polish

---

## 11. UX / Information Architecture

## 11.1 Navigation model

### Primary navigation
- Workspace Home
- Matters
- Sources / Evidence
- Chronology
- Claims
- Relief
- Research
- Drafting
- AI Review
- Tasks
- Settings / Integrations

### Matter-level navigation
Within a matter, show:
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

## 11.2 Layout pattern
Recommended core interface layout:
- **Left pane:** matter navigation, filters, saved views
- **Center pane:** current working object (document, chart, timeline, draft)
- **Right pane:** metadata, citations, AI proposals, comments, linked objects

## 11.3 Signature screens
1. **Matter dashboard**
2. **Document viewer with proposal sidecar**
3. **Chronology workspace**
4. **Claim chart workspace**
5. **Relief matrix workspace**
6. **AI council / multi-agent review view**
7. **Drafting studio with support inspector**

## 11.4 UX requirements
- fast object switching without losing context
- dense but readable legal-analysis layouts
- obvious source traceability
- visible uncertainty and review status
- minimal hidden state changes
- excellent keyboard and filtering support

---

## 12. Security, Confidentiality, and Local-First Safeguards

### Security posture
Initial posture is **basic protections with strong repo hygiene**, suitable for local testing with real evidence.

### Requirements
- Strong `.gitignore` from day one
- Exclude evidence and sensitive runtime files from remote repository by default
- Store API credentials in local environment files only
- Keep raw diagnostics local under ignored paths such as `data/diagnostics/`
- Create a separate sanitized share bundle under a tracked path such as `handoff/diagnostic_bundles/` for `-logs` branch exchange
- Redact secrets from logs and diagnostics
- Make external AI sharing opt-in and explicit
- Allow matter-level AI-sharing policy configuration

### Minimum `.gitignore` expectations
- `.env`
- `.env.*`
- `uploads/`
- `evidence/`
- `exports/`
- `logs/`
- `tmp/`
- `cache/`
- local database files
- OCR caches
- provider credential files
- generated embeddings/vector indexes where sensitive or large

### Acceptance criteria
- Sensitive files are excluded from Git by default
- Diagnostic/log collection script redacts secrets and warns about potential sensitive content

---

## 13. AI Trust Model

### Policy
AI is an assistant for proposal generation, analysis, drafting assistance, and review support. AI is not an autonomous source of final facts.

### Review model selected
- **Facts must be reviewed** before becoming part of the trusted record
- AI may suggest links and mappings
- AI may generate notes, tasks, and candidate analysis
- AI must not auto-ingest facts into approved state

### Trust-state model
Objects should support states such as:
- proposed
- accepted
- accepted with edits
- rejected
- superseded
- disputed
- approved for drafting

---

## 14. Technical Architecture (High-Level)

### Recommended stack
- **Frontend:** React / Next.js / TypeScript
- **Backend API:** Python (recommended for OCR/AI pipelines) or Node if preferred; Python/FastAPI is a strong fit
- **Database:** PostgreSQL
- **Search:** hybrid full-text + vector retrieval
- **File storage:** local filesystem for local testing; storage abstraction for future private deployment
- **Background jobs:** worker queue for OCR, embeddings, agent runs, and extraction pipelines

### Architecture principles
- keep domain objects explicit and relational
- use link tables for proof graph relationships
- avoid a chat-only architecture
- avoid embeddings-only retrieval
- separate sync request/response from async analysis tasks

### Initial data interfaces
- CSV import/export for source ledgers
- Markdown import/export for early claim charts and relief matrices
- PDF/image/email attachment handling

---

## 15. Development Workflow Requirements

The build process must support an ongoing loop between a remote coding agent and a local tester using real evidence.

## 15.1 Branching convention
Recommended branch categories:
- `main` — stable branch
- `feature/<topic>` — active development branch
- `feature/<topic>-logs` — local test logs and diagnostics branch

Equivalent naming is acceptable so long as the `-logs` side-branch convention remains clear.

## 15.2 Required tracked handoff files
The repository should include:
- `handoff/WORKLOG.md`
- `handoff/BACKLOG.md`
- `handoff/TESTING.md`
- `handoff/KNOWN_ISSUES.md`
- `handoff/DECISIONS.md`

### File responsibilities
#### `WORKLOG.md`
Per-turn implementation summary:
- what changed
- why
- files affected
- what needs testing
- blockers / risks

#### `BACKLOG.md`
Prioritized list of:
- features
- bugs
- technical debt
- open product decisions

#### `TESTING.md`
Concrete local test instructions:
- setup steps
- commands to run
- expected behavior
- how to capture failures

#### `KNOWN_ISSUES.md`
Current known defects and limitations.

#### `DECISIONS.md`
Short decisions log so architectural and product context survives across turns.

## 15.3 End-of-turn remote agent protocol
At the end of each coding turn, the remote coding agent must:
1. update `handoff/WORKLOG.md`
2. update the prioritized backlog
3. commit code and documentation changes
4. push the current branch
5. provide local testing instructions
6. request specific logs/feedback needed next
7. stop and wait for further direction

## 15.4 Local diagnostic/log collection script
The repo must include a script that helps the local user collect and send diagnostics through the `-logs` branch.

### Script requirements
- gather app runtime logs
- gather stack traces and error reports
- include environment summary with secrets redacted
- exclude `.env` and provider secrets
- warn if logs appear to contain sensitive evidence text
- optionally include screenshots or user notes
- create a raw local diagnostic bundle directory under an ignored path such as `data/diagnostics/`
- generate a sanitized share bundle under a tracked path such as `handoff/diagnostic_bundles/`
- switch/create the `-logs` branch
- commit and push the sanitized diagnostic bundle only
- print success/failure instructions

### Acceptance criteria
- local tester can run one command or script flow to package and send diagnostics
- remote coding agent can inspect the `-logs` branch without exposing sensitive environment secrets

---

## 16. Backlog and Continuous Improvement Model

### Backlog structure
Use prioritized buckets:

#### P0 — Foundations / unblockers
- repo hygiene and `.gitignore`
- local setup
- basic auth/roles
- workspace and matter skeleton
- logging and handoff workflow
- evidence confidentiality defaults

#### P1 — Core product value
- evidence upload + OCR/VLM
- source ledger UI
- proposal review
- chronology
- claim chart
- actor/party registry
- cross-matter linking

#### P2 — High-value intelligence
- contradiction detection
- gap detection
- multi-agent review
- research linking
- relief matrix

#### P3 — Finishing and leverage
- drafting studio
- polished PDF export
- advanced analytics
- UX refinement
- bulk actions and improved reports

### Bug triage structure
- Critical
- High
- Medium
- Low

### Product operating rule
Always maintain a visible prioritized list of features and bugs to support incremental, test-driven improvement.

---

## 17. MVP Definition

A valid MVP should deliver meaningful value in the following order.

### MVP Phase 1
- local-safe repo setup and `.gitignore`
- master workspace
- matter and overlay proceeding management
- actor registry
- evidence upload and source repository
- OCR/VLM processing
- source ledger UI
- proposal review inbox

### MVP Phase 2
- chronology module
- claim chart module
- claim template library
- cross-linking among facts, events, sources, and claims
- hybrid search

### MVP Phase 3
- relief matrix
- basic research library
- multi-agent review module
- PDF export for chronology and claim charts

### MVP Phase 4
- drafting studio
- deeper red-team and contradiction analysis
- expanded collaboration refinement

---

## 18. Success Metrics

### Product success metrics
- % of chronology entries linked to source anchors
- % of claim elements with visible support status
- time to locate support for a claim element
- # of accepted vs rejected AI proposals
- # of unsupported or conflicted elements surfaced automatically
- time to produce an attorney-reviewable chronology or claim chart

### Workflow success metrics
- local tester can reliably run and report errors
- remote coding agent can hand off work without losing context
- backlog remains current and prioritized

---

## 19. Key Risks and Mitigations

### Risk: AI overreach or hallucinated facts
**Mitigation:** review-required facts, visible source anchors, strict audit trail.

### Risk: sensitive evidence exposure to third-party APIs
**Mitigation:** opt-in external sharing, matter-level AI policy, logging safeguards, local-first defaults.

### Risk: legal analysis becomes static or stale
**Mitigation:** build live modules over structured data, not standalone documents.

### Risk: claim support becomes hard to maintain across matters
**Mitigation:** shared actor registry, overlay matters, explicit proof graph links.

### Risk: build effort drifts into polish too early
**Mitigation:** prioritize interaction quality and core analytical workflows before advanced export polish.

---

## 20. Initial Acceptance Checklist

Before implementation is considered aligned with this PRD, the build plan should support all of the following:

- [ ] master workspace with multiple linked matters
- [ ] overlay proceeding support
- [ ] owner + invited reviewer collaboration model
- [ ] reviewed fact workflow
- [ ] evidence repository with OCR and image understanding
- [ ] source ledger as first-class UI
- [ ] chronology with reviewed event intake
- [ ] claim chart with element mapping and gap detection
- [ ] relief matrix as separate module
- [ ] research library with uploaded authorities and basic lookup
- [ ] multi-agent review across multiple AI providers
- [ ] matter-level AI-sharing controls
- [ ] PDF export path for chronology and claim charts
- [ ] local log collection and `-logs` branch workflow
- [ ] handoff work log and prioritized backlog discipline

---

## 21. Final Product Definition

**Working product definition:**

A New York-optimized, local-testable legal matter intelligence workspace that connects evidence, facts, chronology, claim elements, and relief through a reviewed proof graph, with collaborator review, basic confidentiality safeguards, multi-agent analysis, and disciplined incremental development workflow.

---

## 22. Recommended First Implementation Sequence

1. Repo hygiene, `.gitignore`, handoff files, local test workflow  
2. Workspace + matter + proceeding skeleton  
3. Source upload, OCR/VLM, source repository  
4. Source ledger UI and review states  
5. Proposal review inbox  
6. Chronology engine and views  
7. Claim chart engine and template library  
8. Search/retrieval  
9. Relief matrix  
10. Multi-agent review  
11. PDF export for chronology/claim charts  
12. Drafting studio

---

## 23. Notes for Future Specification Layers

This PRD is sufficient to guide architecture, module design, and phased implementation planning. Future implementation documents may add:
- wireframes / screen specs
- database schema draft
- API contract draft
- prompt registry design
- queue/job orchestration design
- testing plan by module
- import migration plan for current files

---

**End of PRD**
