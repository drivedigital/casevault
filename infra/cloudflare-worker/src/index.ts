/**
 * CaseVault Cloudflare Worker
 *
 * Edge gateway with persistent KV state for the 510W42 Legal Matter Workspace:
 * 1. 230 CPS — 2F Bedroom C (RPAPL 768, RPAPL 853, Conversion)
 * 2. 510 W 42 — #209 / hotel work / property (CRL §51, Conversion, RPAPL 768)
 * 3. Part 19 — Article 81 Leave & Preservation (MHL Article 81, CPLR 204(a))
 */

export interface Env {
  ENVIRONMENT: string;
  GITHUB_REPO?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  CASEVAULT_API_TOKEN?: string;
  CASEVAULT_KV?: any;
}

import sources510w42 from "./sources-510w42.json";
import pages510w42 from "./pages-510w42.json";

// ============================================================================
// 510W42 REAL DATASET
// ============================================================================

export const realActors = [
  {
    id: "act-dg",
    workspace_id: "ws-510w42",
    actor_type: "person",
    display_name: "Dan George",
    normalized_name: "Dan George",
    description: "Claimant / proposed plaintiff asserting wrongful eviction, chattel conversion, quantum meruit, and civil rights claims.",
    aliases: [
      { id: "al-dg-1", alias_text: "DG", alias_type: "short" },
      { id: "al-dg-2", alias_text: "Dan", alias_type: "informal" },
    ],
    created_at: "2024-09-06T10:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
  },
  {
    id: "act-ir",
    workspace_id: "ws-510w42",
    actor_type: "person",
    display_name: "Ian Reisner",
    normalized_name: "Ian Reisner",
    description: "AIP; 2F proprietary leaseholder and shareholder; principal of hotel operating entities at 510 W 42nd St.",
    aliases: [
      { id: "al-ir-1", alias_text: "IR", alias_type: "short" },
      { id: "al-ir-2", alias_text: "Ian", alias_type: "informal" },
    ],
    created_at: "2024-09-06T10:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
  },
  {
    id: "act-ac",
    workspace_id: "ws-510w42",
    actor_type: "person",
    display_name: "Andre K. Cizmarik",
    normalized_name: "Andre K. Cizmarik",
    description: "Court-appointed property guardian for Ian Reisner under MHL Article 81 (Edwards & Cizmarik).",
    aliases: [
      { id: "al-ac-1", alias_text: "AC", alias_type: "short" },
      { id: "al-ac-2", alias_text: "Cizmarik", alias_type: "citation" },
      { id: "al-ac-3", alias_text: "Guardian", alias_type: "role" },
    ],
    created_at: "2025-04-01T10:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
  },
  {
    id: "act-230coop",
    workspace_id: "ws-510w42",
    actor_type: "entity",
    display_name: "230 Park South Apartments Inc.",
    normalized_name: "230 Park South Apartments Inc.",
    description: "Building corporation owning 230 Central Park South; proposed 230 door exclusion defendant.",
    aliases: [
      { id: "al-cp-1", alias_text: "Co-op", alias_type: "short" },
      { id: "al-cp-2", alias_text: "230CPS", alias_type: "short" },
      { id: "al-cp-3", alias_text: "230 Park South", alias_type: "informal" },
    ],
    created_at: "2024-09-06T10:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
  },
  {
    id: "act-ur",
    workspace_id: "ws-510w42",
    actor_type: "entity",
    display_name: "Urban Resort LLC",
    normalized_name: "Urban Resort LLC",
    description: "Operating/lessee entity for 510 W 42nd St hotel; signatory to service and liability agreements.",
    aliases: [
      { id: "al-ur-1", alias_text: "UR", alias_type: "short" },
      { id: "al-ur-2", alias_text: "Cachet", alias_type: "informal" },
      { id: "al-ur-3", alias_text: "Hudson Yards Hotel", alias_type: "informal" },
    ],
    created_at: "2024-03-15T10:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
  },
  {
    id: "act-mk",
    workspace_id: "ws-510w42",
    actor_type: "person",
    display_name: "Michal Kravarik",
    normalized_name: "Michal Kravarik",
    description: "Hotel paymaster and 510 actor; involved in financial operations and lock access.",
    aliases: [
      { id: "al-mk-1", alias_text: "MK", alias_type: "short" },
      { id: "al-mk-2", alias_text: "Mike", alias_type: "informal" },
    ],
    created_at: "2024-03-15T10:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
  },
  {
    id: "act-dn",
    workspace_id: "ws-510w42",
    actor_type: "person",
    display_name: "Derian Nasca",
    normalized_name: "Derian Nasca",
    description: "Parallel 2F Bedroom B occupant and plaintiff in separate Supreme Court action (NYSCEF 63).",
    aliases: [
      { id: "al-dn-1", alias_text: "DN", alias_type: "short" },
      { id: "al-dn-2", alias_text: "Nasca", alias_type: "citation" },
    ],
    created_at: "2024-10-01T10:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
  },
  {
    id: "act-ml",
    workspace_id: "ws-510w42",
    actor_type: "person",
    display_name: "Maureen Lupo",
    normalized_name: "Maureen Lupo",
    description: "510 W 42nd St operations actor and communications participant.",
    aliases: [
      { id: "al-ml-1", alias_text: "ML", alias_type: "short" },
      { id: "al-ml-2", alias_text: "Baby", alias_type: "informal" },
      { id: "al-ml-3", alias_text: "Marina Lopez", alias_type: "informal" },
    ],
    created_at: "2024-06-01T10:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
  },
  {
    id: "act-jb",
    workspace_id: "ws-510w42",
    actor_type: "person",
    display_name: "Jeremy Broderick",
    normalized_name: "Jeremy Broderick",
    description: "510 W 42nd St security/operations actor; former 230 resident.",
    aliases: [
      { id: "al-jb-1", alias_text: "JB", alias_type: "short" },
      { id: "al-jb-2", alias_text: "GI Joe", alias_type: "informal" },
    ],
    created_at: "2024-06-01T10:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
  },
  {
    id: "act-nk",
    workspace_id: "ws-510w42",
    actor_type: "person",
    display_name: "Nicholas Kaiser",
    normalized_name: "Nicholas Kaiser",
    description: "Counsel in transactional and hotel operating matters.",
    aliases: [
      { id: "al-nk-1", alias_text: "NK", alias_type: "short" },
      { id: "al-nk-2", alias_text: "Kaiser", alias_type: "citation" },
    ],
    created_at: "2024-03-01T10:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
  },
];

export const realMatters = [
  {
    id: "m-230cps",
    workspace_id: "ws-510w42",
    slug: "230cps",
    name: "230 CPS — 2F Bedroom C",
    title: "230 CPS — 2F Bedroom C",
    matter_type: "merits",
    status: "active",
    theory_summary: "Claimed 270-day exclusive room occupancy; June 3, 2025 exclusion; later restore and property demands against Co-op and Estate.",
    controlling_memo_ref: "DG_230CPS_Case_File_Memo.md",
    next_work: "Counsel limitations briefing on C2 (RPAPL 853); obtain 3 Jun door instruction/log, powers orders, NYSCEF 59, 81.07 list, 2F disposition records; build exhibit ledger.",
    jurisdiction: "New York — State Supreme / Housing Part",
    ai_sharing_policy: "external_excerpts_only",
    archived_at: null,
    created_at: "2024-09-06T09:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
  },
  {
    id: "m-510w42",
    workspace_id: "ws-510w42",
    slug: "510w42",
    name: "510 W 42 — #209 / hotel work / property",
    title: "510 W 42 — #209 / hotel work / property",
    matter_type: "merits",
    status: "active",
    theory_summary: "Two 2024 hotel-room lockouts; compensation, property, and civil rights CRL §51 commercial identity misappropriation issues.",
    controlling_memo_ref: "DG_510W42_Case_File_Memo.md",
    next_work: "Counsel decision on CRL §51 working date (~3 Oct 2026 under 204 arithmetic); verify any post-9 Oct 2024 name use; obtain Sokoloff/permanent orders, NYPD FOIL-2025-056-27077, UR lease counterpart, #209 key logs.",
    jurisdiction: "New York — State Supreme / Commercial Division",
    ai_sharing_policy: "external_excerpts_only",
    archived_at: null,
    created_at: "2024-03-15T09:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
  },
  {
    id: "m-part19",
    workspace_id: "ws-510w42",
    slug: "part19",
    name: "Part 19 — Article 81 Leave & Preservation",
    title: "Part 19 — Article 81 Leave & Preservation",
    matter_type: "proceeding",
    status: "active",
    theory_summary: "Planned sealed OSC for Article 81 leave, guardian powers, chattel accounting/production, limited non-medical records discovery, and CPLR 204(a) tolling declaration.",
    controlling_memo_ref: "DG_Part19_Working_Packet.md",
    next_work: "Counsel decisions on accelerated timing (CRL §51), 204/estoppel framing, one-vs-two plenary actions, sealing/service; conform exhibits and pull TO BE PRODUCED orders.",
    jurisdiction: "New York County Supreme Court — Guardianship Part 19",
    ai_sharing_policy: "no_ai",
    archived_at: null,
    created_at: "2025-04-01T09:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
  },
];

export const realSources = sources510w42;

export const realMatterLinks = [
  {
    id: "ml-1",
    from_matter_id: "m-230cps",
    from_matter_name: "230 CPS — 2F Bedroom C",
    to_matter_id: "m-part19",
    to_matter_name: "Part 19 — Article 81 Leave & Preservation",
    link_type: "procedural_dependency",
    direction: "outgoing",
    notes: "Article 81 guardianship proceeding (Part 19) governs AIP Ian Reisner and Property Guardian Andre Cizmarik who controls 2F and withheld Bedroom C access.",
    created_at: "2025-04-01T10:00:00Z",
  },
  {
    id: "ml-2",
    from_matter_id: "m-510w42",
    from_matter_name: "510 W 42 — #209 / hotel work / property",
    to_matter_id: "m-part19",
    to_matter_name: "Part 19 — Article 81 Leave & Preservation",
    link_type: "procedural_dependency",
    direction: "outgoing",
    notes: "Article 81 leave and accounting needed against Guardian Cizmarik regarding hotel operating entities, leases, and chattel conversion.",
    created_at: "2025-04-01T10:00:00Z",
  },
  {
    id: "ml-3",
    from_matter_id: "m-230cps",
    from_matter_name: "230 CPS — 2F Bedroom C",
    to_matter_id: "m-510w42",
    to_matter_name: "510 W 42 — #209 / hotel work / property",
    link_type: "shares_actors",
    direction: "outgoing",
    notes: "Common parties (Dan George, Ian Reisner) with overlapping timeline and joint representations.",
    created_at: "2024-09-06T10:00:00Z",
  },
];

export const realMatterActors = [
  { role_id: "mar-1", matter_id: "m-230cps", actor_id: "act-dg", actor_name: "Dan George", actor_type: "person", role_label: "plaintiff", notes: "Claimant asserting RPAPL 768 and 853 occupancy.", created_at: "2024-09-06T10:00:00Z" },
  { role_id: "mar-2", matter_id: "m-230cps", actor_id: "act-ir", actor_name: "Ian Reisner", actor_type: "person", role_label: "co-party", notes: "2F shareholder granting oral demise.", created_at: "2024-09-06T10:00:00Z" },
  { role_id: "mar-3", matter_id: "m-230cps", actor_id: "act-ac", actor_name: "Andre K. Cizmarik", actor_type: "person", role_label: "counterparty", notes: "Article 81 guardian managing estate.", created_at: "2025-04-01T10:00:00Z" },
  { role_id: "mar-4", matter_id: "m-230cps", actor_id: "act-230coop", actor_name: "230 Park South Apartments Inc.", actor_type: "entity", role_label: "counterparty", notes: "Co-op owning real property.", created_at: "2024-09-06T10:00:00Z" },
  { role_id: "mar-5", matter_id: "m-510w42", actor_id: "act-dg", actor_name: "Dan George", actor_type: "person", role_label: "plaintiff", notes: "Claimant asserting CRL §51 and property claims.", created_at: "2024-03-15T10:00:00Z" },
  { role_id: "mar-6", matter_id: "m-510w42", actor_id: "act-ir", actor_name: "Ian Reisner", actor_type: "person", role_label: "counterparty", notes: "Principal directing hotel operations.", created_at: "2024-03-15T10:00:00Z" },
  { role_id: "mar-7", matter_id: "m-510w42", actor_id: "act-ur", actor_name: "Urban Resort LLC", actor_type: "entity", role_label: "counterparty", notes: "Lessee and operating entity.", created_at: "2024-03-15T10:00:00Z" },
  { role_id: "mar-8", matter_id: "m-part19", actor_id: "act-ac", actor_name: "Andre K. Cizmarik", actor_type: "person", role_label: "court actor", notes: "Property guardian under MHL Art 81.", created_at: "2025-04-01T10:00:00Z" },
  { role_id: "mar-9", matter_id: "m-part19", actor_id: "act-dg", actor_name: "Dan George", actor_type: "person", role_label: "witness", notes: "Creditor and claimant seeking OSC relief.", created_at: "2025-04-01T10:00:00Z" },
];

export const realSourceMatterLinks = [
  { id: "sml-1", source_id: "src-230-001", source_title: "2F Floor Plan Showing Exclusive Bedroom C Demise", matter_id: "m-230cps", link_reason: "Primary physical layout proof of Bedroom C", created_at: "2024-09-06T10:00:00Z" },
  { id: "sml-2", source_id: "src-230-016", source_title: "June 3, 2025 2F Door Exclusion Record — Doorman Donnie Refusal", matter_id: "m-230cps", link_reason: "Proof of June 3 door lockout event", created_at: "2025-06-03T18:00:00Z" },
  { id: "sml-3", source_id: "src-230-018", source_title: "DG Written Demand for Restoration and Inventory (Oct 20, 2025)", matter_id: "m-230cps", link_reason: "Formal written demand under RPAPL 768", created_at: "2025-10-20T17:38:00Z" },
  { id: "sml-4", source_id: "src-510-001", source_title: "Ground Lease COMPLETE", matter_id: "m-510w42", link_reason: "Master ground lease for 510 W 42", created_at: "2024-03-15T10:00:00Z" },
  { id: "sml-5", source_id: "src-510-015", source_title: "Email IR using DG name on investor pitch - Oct 9 2024", matter_id: "m-510w42", link_reason: "Commercial identity exploitation proof", created_at: "2024-10-09T14:30:00Z" },
  { id: "sml-6", source_id: "src-nyscef-63", source_title: "NYSCEF 63 Supreme Court Order & Entry Record for 2F", matter_id: "m-part19", link_reason: "Part 19 court order", created_at: "2025-04-01T10:00:00Z" },
];

export const realFacts = [
  {
    id: "fact-230-01",
    workspace_id: "ws-510w42",
    matter_id: "m-230cps",
    short_label: "270-Day Residential Occupancy of 2F Bedroom C",
    statement_text: "Dan George maintained continuous, open, and exclusive residential occupancy of Bedroom C at 230 Central Park South from September 6, 2024 through June 3, 2025 (270 days), satisfying the statutory 30-day residency protection of NY RPAPL §768.",
    review_state: "accepted",
    confidence_level: "high",
    fact_type: "source_derived",
    is_material: true,
    created_from_proposal_id: null,
    created_by_user_id: "user-lead-counsel",
    approved_by_user_id: "user-lead-counsel",
    approved_at: "2026-08-24T12:00:00Z",
    supersedes_fact_id: null,
    created_at: "2024-09-06T10:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
    source_links: [
      {
        id: "fsl-230-01",
        fact_id: "fact-230-01",
        source_id: "src-230-001",
        excerpt_id: null,
        support_type: "supports",
        strength: "high",
        notes: "Floor plan shows Bedroom C as distinct, private partitioned residential quarters.",
        created_at: "2026-08-24T12:00:00Z",
      },
      {
        id: "fsl-230-02",
        fact_id: "fact-230-01",
        source_id: "src-nyscef-63",
        excerpt_id: null,
        support_type: "supports",
        strength: "high",
        notes: "Corroborated by judicial record of multi-party residential arrangement in 2F.",
        created_at: "2026-08-24T12:00:00Z",
      },
    ],
    actor_links: [
      {
        id: "fal-230-01",
        fact_id: "fact-230-01",
        actor_id: "act-dg",
        role_in_fact: "occupant",
        created_at: "2026-08-24T12:00:00Z",
      },
      {
        id: "fal-230-02",
        fact_id: "fact-230-01",
        actor_id: "act-ir",
        role_in_fact: "shareholder / grantor",
        created_at: "2026-08-24T12:00:00Z",
      },
    ],
    created_from_proposal: null,
  },
  {
    id: "fact-230-02",
    workspace_id: "ws-510w42",
    matter_id: "m-230cps",
    short_label: "June 3, 2025 Door Exclusion Without Process",
    statement_text: "On June 3, 2025, doorman Donnie and superintendent Villanova barred Dan George from entering 2F Bedroom C under instructions from co-op management without any warrant of eviction or court order naming him.",
    review_state: "accepted",
    confidence_level: "high",
    fact_type: "source_derived",
    is_material: true,
    created_from_proposal_id: null,
    created_by_user_id: "user-lead-counsel",
    approved_by_user_id: "user-lead-counsel",
    approved_at: "2026-08-24T12:00:00Z",
    supersedes_fact_id: null,
    created_at: "2025-06-03T18:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
    source_links: [
      {
        id: "fsl-230-03",
        fact_id: "fact-230-02",
        source_id: "src-230-016",
        excerpt_id: null,
        support_type: "supports",
        strength: "high",
        notes: "Contemporaneous narrative and call log with doorman Donnie and superintendent Villanova.",
        created_at: "2026-08-24T12:00:00Z",
      },
    ],
    actor_links: [
      {
        id: "fal-230-03",
        fact_id: "fact-230-02",
        actor_id: "act-dg",
        role_in_fact: "excluded occupant",
        created_at: "2026-08-24T12:00:00Z",
      },
      {
        id: "fal-230-04",
        fact_id: "fact-230-02",
        actor_id: "act-230coop",
        role_in_fact: "excluding entity",
        created_at: "2026-08-24T12:00:00Z",
      },
    ],
    created_from_proposal: null,
  },
  {
    id: "fact-230-03",
    workspace_id: "ws-510w42",
    matter_id: "m-230cps",
    short_label: "Service of Written Restoration & Chattel Demand",
    statement_text: "On October 20, 2025, Dan George served written demand upon Property Guardian Andre Cizmarik demanding immediate restoration of access to 2F Bedroom C and accounting/return of 45 itemized personal property items.",
    review_state: "accepted",
    confidence_level: "high",
    fact_type: "source_derived",
    is_material: true,
    created_from_proposal_id: null,
    created_by_user_id: "user-lead-counsel",
    approved_by_user_id: "user-lead-counsel",
    approved_at: "2026-08-24T12:00:00Z",
    supersedes_fact_id: null,
    created_at: "2025-10-20T17:38:00Z",
    updated_at: "2026-08-24T12:00:00Z",
    source_links: [
      {
        id: "fsl-230-04",
        fact_id: "fact-230-03",
        source_id: "src-230-018",
        excerpt_id: null,
        support_type: "supports",
        strength: "high",
        notes: "Email sent 5:38 p.m. with attached NYAG RPAPL 768 statutory guidance and inventory lists.",
        created_at: "2026-08-24T12:00:00Z",
      },
      {
        id: "fsl-230-05",
        fact_id: "fact-230-03",
        source_id: "src-230-022",
        excerpt_id: null,
        support_type: "supports",
        strength: "high",
        notes: "45 itemized chattel schedule totaling $5,025.58.",
        created_at: "2026-08-24T12:00:00Z",
      },
    ],
    actor_links: [
      {
        id: "fal-230-05",
        fact_id: "fact-230-03",
        actor_id: "act-dg",
        role_in_fact: "demanding claimant",
        created_at: "2026-08-24T12:00:00Z",
      },
      {
        id: "fal-230-06",
        fact_id: "fact-230-03",
        actor_id: "act-ac",
        role_in_fact: "recipient guardian",
        created_at: "2026-08-24T12:00:00Z",
      },
    ],
    created_from_proposal: null,
  },
  {
    id: "fact-230-04",
    workspace_id: "ws-510w42",
    matter_id: "m-230cps",
    short_label: "Guardian Written Refusal of Access and Property Delivery",
    statement_text: "On October 21, 2025, Guardian Andre Cizmarik expressly refused access to 230 CPS and stated property would be inventoried without Dan George present.",
    review_state: "accepted",
    confidence_level: "high",
    fact_type: "source_derived",
    is_material: true,
    created_from_proposal_id: null,
    created_by_user_id: "user-lead-counsel",
    approved_by_user_id: "user-lead-counsel",
    approved_at: "2026-08-24T12:00:00Z",
    supersedes_fact_id: null,
    created_at: "2025-10-21T11:15:00Z",
    updated_at: "2026-08-24T12:00:00Z",
    source_links: [
      {
        id: "fsl-230-06",
        fact_id: "fact-230-04",
        source_id: "src-230-019",
        excerpt_id: null,
        support_type: "supports",
        strength: "high",
        notes: "Formal email refusal from guardian Cizmarik.",
        created_at: "2026-08-24T12:00:00Z",
      },
    ],
    actor_links: [
      {
        id: "fal-230-07",
        fact_id: "fact-230-04",
        actor_id: "act-ac",
        role_in_fact: "refusing guardian",
        created_at: "2026-08-24T12:00:00Z",
      },
    ],
    created_from_proposal: null,
  },
  {
    id: "fact-510-01",
    workspace_id: "ws-510w42",
    matter_id: "m-510w42",
    short_label: "Unauthorized Commercial Identity Exploitation in Pitch Deck",
    statement_text: "On October 9, 2024, Ian Reisner distributed an investor solicitation presentation for 510 W 42nd St utilizing Dan George's name and professional reputation without prior written authorization, in violation of NY Civil Rights Law §51.",
    review_state: "accepted",
    confidence_level: "high",
    fact_type: "source_derived",
    is_material: true,
    created_from_proposal_id: null,
    created_by_user_id: "user-lead-counsel",
    approved_by_user_id: "user-lead-counsel",
    approved_at: "2026-08-24T12:00:00Z",
    supersedes_fact_id: null,
    created_at: "2024-10-09T14:30:00Z",
    updated_at: "2026-08-24T12:00:00Z",
    source_links: [
      {
        id: "fsl-510-01",
        fact_id: "fact-510-01",
        source_id: "src-510-015",
        excerpt_id: null,
        support_type: "supports",
        strength: "high",
        notes: "Pitch deck distribution email to potential investors.",
        created_at: "2026-08-24T12:00:00Z",
      },
    ],
    actor_links: [
      {
        id: "fal-510-01",
        fact_id: "fact-510-01",
        actor_id: "act-dg",
        role_in_fact: "exploited individual",
        created_at: "2026-08-24T12:00:00Z",
      },
      {
        id: "fal-510-02",
        fact_id: "fact-510-01",
        actor_id: "act-ir",
        role_in_fact: "distributing principal",
        created_at: "2026-08-24T12:00:00Z",
      },
    ],
    created_from_proposal: null,
  },
  {
    id: "fact-510-02",
    workspace_id: "ws-510w42",
    matter_id: "m-510w42",
    short_label: "Conversion of 65 Hotel Room #209 Chattels ($13,545.95)",
    statement_text: "Sixty-five itemized items of personal property valued at $13,545.95 in Room #209 of 510 West 42nd Street were unlawfully converted and withheld following exclusion.",
    review_state: "accepted",
    confidence_level: "high",
    fact_type: "source_derived",
    is_material: true,
    created_from_proposal_id: null,
    created_by_user_id: "user-lead-counsel",
    approved_by_user_id: "user-lead-counsel",
    approved_at: "2026-08-24T12:00:00Z",
    supersedes_fact_id: null,
    created_at: "2024-09-06T15:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
    source_links: [
      {
        id: "fsl-510-02",
        fact_id: "fact-510-02",
        source_id: "src-510-025",
        excerpt_id: null,
        support_type: "supports",
        strength: "high",
        notes: "Itemized schedule of 65 chattels totaling $13,545.95.",
        created_at: "2026-08-24T12:00:00Z",
      },
    ],
    actor_links: [
      {
        id: "fal-510-03",
        fact_id: "fact-510-02",
        actor_id: "act-dg",
        role_in_fact: "property owner",
        created_at: "2026-08-24T12:00:00Z",
      },
      {
        id: "fal-510-04",
        fact_id: "fact-510-02",
        actor_id: "act-ur",
        role_in_fact: "retaining entity",
        created_at: "2026-08-24T12:00:00Z",
      },
    ],
    created_from_proposal: null,
  },
];

export const realEvents = [
  {
    id: "ev-230-01",
    workspace_id: "ws-510w42",
    matter_id: "m-230cps",
    title: "Commencement of Exclusive Bedroom C Occupancy",
    description: "Dan George commenced exclusive residential occupancy of Bedroom C at 230 Central Park South upon express invitation and agreement with shareholder Ian Reisner.",
    date_start: "2024-09-06",
    date_end: null,
    date_precision: "exact",
    date_text_raw: "September 6, 2024",
    significance_level: "high",
    review_state: "accepted",
    confidence_level: "high",
    created_from_proposal_id: null,
    created_at: "2024-09-06T10:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
    fact_links: [
      {
        id: "efl-r1",
        event_id: "ev-230-01",
        fact_id: "fact-230-01",
        relationship_type: "supports_event",
        created_at: "2026-08-24T12:00:00Z",
        fact_short_label: "270-Day Residential Occupancy of 2F Bedroom C",
        fact_statement: "Dan George maintained continuous, open, and exclusive residential occupancy of Bedroom C at 230 Central Park South from September 6, 2024 through June 3, 2025.",
        fact_review_state: "accepted",
      },
    ],
    actor_links: [
      {
        id: "eal-r1",
        event_id: "ev-230-01",
        actor_id: "act-dg",
        role_in_event: "occupant",
        created_at: "2026-08-24T12:00:00Z",
        actor_name: "Dan George",
      },
      {
        id: "eal-r2",
        event_id: "ev-230-01",
        actor_id: "act-ir",
        role_in_event: "shareholder",
        created_at: "2026-08-24T12:00:00Z",
        actor_name: "Ian Reisner",
      },
    ],
    created_from_proposal: null,
  },
  {
    id: "ev-230-02",
    workspace_id: "ws-510w42",
    matter_id: "m-230cps",
    title: "Building Logbook Registration & Front Desk Permission",
    description: "Co-op front desk logbook recorded Dan George entry and building staff acknowledgment of continuous occupancy.",
    date_start: "2024-09-19",
    date_end: null,
    date_precision: "exact",
    date_text_raw: "September 19, 2024",
    significance_level: "medium",
    review_state: "accepted",
    confidence_level: "high",
    created_from_proposal_id: null,
    created_at: "2024-09-19T14:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
    fact_links: [],
    actor_links: [
      {
        id: "eal-r3",
        event_id: "ev-230-02",
        actor_id: "act-230coop",
        role_in_event: "building corporation",
        created_at: "2026-08-24T12:00:00Z",
        actor_name: "230 Park South Apartments Inc.",
      },
    ],
    created_from_proposal: null,
  },
  {
    id: "ev-510-01",
    workspace_id: "ws-510w42",
    matter_id: "m-510w42",
    title: "CRL §51 Pitch Deck Issued to Prospective Investors",
    description: "Ian Reisner distributed capital solicitation deck featuring Dan George without written authorization.",
    date_start: "2024-10-09",
    date_end: null,
    date_precision: "exact",
    date_text_raw: "October 9, 2024",
    significance_level: "high",
    review_state: "accepted",
    confidence_level: "high",
    created_from_proposal_id: null,
    created_at: "2024-10-09T14:30:00Z",
    updated_at: "2026-08-24T12:00:00Z",
    fact_links: [
      {
        id: "efl-r2",
        event_id: "ev-510-01",
        fact_id: "fact-510-01",
        relationship_type: "supports_event",
        created_at: "2026-08-24T12:00:00Z",
        fact_short_label: "Unauthorized Commercial Identity Exploitation in Pitch Deck",
        fact_statement: "Pitch deck transmitted to prospective investors using Dan George name without authorization.",
        fact_review_state: "accepted",
      },
    ],
    actor_links: [
      {
        id: "eal-r4",
        event_id: "ev-510-01",
        actor_id: "act-dg",
        role_in_event: "exploited individual",
        created_at: "2026-08-24T12:00:00Z",
        actor_name: "Dan George",
      },
      {
        id: "eal-r5",
        event_id: "ev-510-01",
        actor_id: "act-ir",
        role_in_event: "distributing principal",
        created_at: "2026-08-24T12:00:00Z",
        actor_name: "Ian Reisner",
      },
    ],
    created_from_proposal: null,
  },
  {
    id: "ev-230-03",
    workspace_id: "ws-510w42",
    matter_id: "m-230cps",
    title: "Unlawful Exclusion at 230 CPS Front Entrance",
    description: "Doorman Donnie and Superintendent Villanova refused entry to Dan George at 230 Central Park South under management instructions without legal process.",
    date_start: "2025-06-03",
    date_end: null,
    date_precision: "exact",
    date_text_raw: "June 3, 2025",
    significance_level: "high",
    review_state: "accepted",
    confidence_level: "high",
    created_from_proposal_id: null,
    created_at: "2025-06-03T18:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
    fact_links: [
      {
        id: "efl-r3",
        event_id: "ev-230-03",
        fact_id: "fact-230-02",
        relationship_type: "supports_event",
        created_at: "2026-08-24T12:00:00Z",
        fact_short_label: "June 3, 2025 Door Exclusion Without Process",
        fact_statement: "Building staff barred Dan George from entering 2F Bedroom C without warrant.",
        fact_review_state: "accepted",
      },
    ],
    actor_links: [
      {
        id: "eal-r6",
        event_id: "ev-230-03",
        actor_id: "act-230coop",
        role_in_event: "excluding building corporation",
        created_at: "2026-08-24T12:00:00Z",
        actor_name: "230 Park South Apartments Inc.",
      },
    ],
    created_from_proposal: null,
  },
  {
    id: "ev-230-04",
    workspace_id: "ws-510w42",
    matter_id: "m-230cps",
    title: "Written Demand Served for Restoration & Chattel Inventory",
    description: "Dan George transmitted formal written notice under RPAPL 768 to Guardian Andre Cizmarik with detailed 45-item chattel schedule.",
    date_start: "2025-10-20",
    date_end: null,
    date_precision: "exact",
    date_text_raw: "October 20, 2025",
    significance_level: "high",
    review_state: "accepted",
    confidence_level: "high",
    created_from_proposal_id: null,
    created_at: "2025-10-20T17:38:00Z",
    updated_at: "2026-08-24T12:00:00Z",
    fact_links: [
      {
        id: "efl-r4",
        event_id: "ev-230-04",
        fact_id: "fact-230-03",
        relationship_type: "supports_event",
        created_at: "2026-08-24T12:00:00Z",
        fact_short_label: "Service of Written Restoration & Chattel Demand",
        fact_statement: "Written demand served upon Guardian Andre Cizmarik.",
        fact_review_state: "accepted",
      },
    ],
    actor_links: [
      {
        id: "eal-r7",
        event_id: "ev-230-04",
        actor_id: "act-ac",
        role_in_event: "guardian recipient",
        created_at: "2026-08-24T12:00:00Z",
        actor_name: "Andre K. Cizmarik",
      },
    ],
    created_from_proposal: null,
  },
  {
    id: "ev-230-05",
    workspace_id: "ws-510w42",
    matter_id: "m-230cps",
    title: "Guardian Cizmarik Written Refusal of Access",
    description: "Guardian Cizmarik formally rejected request to allow access to 230 CPS and stated property would be inventoried without DG present.",
    date_start: "2025-10-21",
    date_end: null,
    date_precision: "exact",
    date_text_raw: "October 21, 2025",
    significance_level: "high",
    review_state: "accepted",
    confidence_level: "high",
    created_from_proposal_id: null,
    created_at: "2025-10-21T11:15:00Z",
    updated_at: "2026-08-24T12:00:00Z",
    fact_links: [
      {
        id: "efl-r5",
        event_id: "ev-230-05",
        fact_id: "fact-230-04",
        relationship_type: "supports_event",
        created_at: "2026-08-24T12:00:00Z",
        fact_short_label: "Guardian Written Refusal of Access and Property Delivery",
        fact_statement: "Guardian Cizmarik expressly refused access to 230 CPS.",
        fact_review_state: "accepted",
      },
    ],
    actor_links: [
      {
        id: "eal-r8",
        event_id: "ev-230-05",
        actor_id: "act-ac",
        role_in_event: "refusing guardian",
        created_at: "2026-08-24T12:00:00Z",
        actor_name: "Andre K. Cizmarik",
      },
    ],
    created_from_proposal: null,
  },
];

export const realProposals = [
  {
    id: "prop-r01",
    workspace_id: "ws-510w42",
    matter_id: "m-230cps",
    proposal_type: "fact",
    review_state: "proposed",
    title: "Doorman Logbook Entry for September 19, 2024",
    proposed_text: "Front desk staff at 230 Central Park South recorded Dan George's entry and verified resident status under authorization from Ian Reisner.",
    proposed_structured_json: {
      actors: ["Dan George", "230 Park South Apartments Inc."],
      dates: ["2024-09-19"],
    },
    source_id: "src-230-016",
    excerpt_id: null,
    confidence_score: 0.92,
    created_by_system: true,
    created_by_user_id: null,
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_notes: null,
    created_at: "2026-08-24T12:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
    source: {
      id: "src-230-016",
      title: "June 3, 2025 2F Door Exclusion Record — Doorman Donnie Refusal",
    },
    excerpt: null,
  },
  {
    id: "prop-r02",
    workspace_id: "ws-510w42",
    matter_id: "m-510w42",
    proposal_type: "fact",
    review_state: "proposed",
    title: "Pitch Deck Slide 4 — Executive Team Representation",
    proposed_text: "Slide 4 of the October 9, 2024 investor presentation names Dan George as a key principal and operational director of the proposed hotel project.",
    proposed_structured_json: {
      actors: ["Dan George", "Ian Reisner", "Urban Resort LLC"],
      dates: ["2024-10-09"],
    },
    source_id: "src-510-015",
    excerpt_id: null,
    confidence_score: 0.96,
    created_by_system: true,
    created_by_user_id: null,
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_notes: null,
    created_at: "2026-08-24T12:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
    source: {
      id: "src-510-015",
      title: "CRL §51 Pitch Deck — Commercial Exploitation of DG Identity",
    },
    excerpt: null,
  },
];

// Helper functions for persistent KV storage
async function getStore<T>(env: Env, key: string, fallback: T): Promise<T> {
  if (env.CASEVAULT_KV) {
    try {
      const val = await env.CASEVAULT_KV.get(key, "json");
      if (val !== null && val !== undefined) return val as T;
    } catch (e) {
      console.error(`KV get error for ${key}:`, e);
    }
  }
  return fallback;
}

async function setStore<T>(env: Env, key: string, val: T): Promise<void> {
  if (env.CASEVAULT_KV) {
    try {
      await env.CASEVAULT_KV.put(key, JSON.stringify(val));
    } catch (e) {
      console.error(`KV put error for ${key}:`, e);
    }
  }
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    };

    // CORS preflight
    if (request.method === "OPTIONS") {
      return handleCors();
    }

    try {
      // Admin / Migration: Flush & reseed KV with clean 510W42 dataset
      if (url.pathname === "/api/v1/admin/reseed-510w42" || url.searchParams.get("reseed") === "true") {
        await setStore(env, "matters", realMatters);
        await setStore(env, "actors", realActors);
        await setStore(env, "sources", realSources);
        await setStore(env, "facts", realFacts);
        await setStore(env, "events", realEvents);
        await setStore(env, "proposals", realProposals);
        return jsonResponse({
          status: "ok",
          message: "510W42 real data reseeded successfully.",
          counts: {
            matters: realMatters.length,
            actors: realActors.length,
            sources: realSources.length,
            facts: realFacts.length,
            events: realEvents.length,
            proposals: realProposals.length,
          },
        });
      }

      // 1. Health check
      if (url.pathname === "/" || url.pathname === "/health") {
        return jsonResponse({
          status: "ok",
          service: "casevault-cloudflare-worker",
          environment: env.ENVIRONMENT || "production",
          dataset: "510W42 / 230CPS Real Case Corpus",
          timestamp: new Date().toISOString(),
          integrations: {
            github: Boolean(env.GITHUB_WEBHOOK_SECRET),
            supabase: Boolean(env.SUPABASE_URL),
            kv: Boolean(env.CASEVAULT_KV),
          },
        });
      }

      // 2. Workspaces
      if (url.pathname === "/api/v1/workspaces/current") {
        return jsonResponse({
          id: "ws-510w42",
          name: "510W42 & 230CPS Legal Matter Intelligence Workspace",
          jurisdiction_default: "New York — State Supreme & Civil",
          ai_sharing_default: "external_excerpts_only",
          created_by_user_id: "user-dan-george",
          created_at: "2024-09-06T08:00:00Z",
          updated_at: new Date().toISOString(),
        });
      }

      // 3. Matters
      if (url.pathname === "/api/v1/matters") {
        const matters = await getStore(env, "matters", realMatters);
        if (request.method === "POST") {
          const body: any = await request.json();
          const newMatter = {
            id: `m-${(body.name || "new").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 15)}-${Date.now().toString().slice(-4)}`,
            workspace_id: "ws-510w42",
            slug: (body.name || "new-matter").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            name: body.name || "Untitled Matter",
            title: body.name || "Untitled Matter",
            matter_type: body.matter_type || "merits",
            status: "active",
            theory_summary: body.theory_summary || null,
            controlling_memo_ref: null,
            next_work: body.next_work || null,
            jurisdiction: body.jurisdiction || "New York",
            ai_sharing_policy: body.ai_sharing_policy || "external_excerpts_only",
            archived_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const updated = [newMatter, ...matters];
          await setStore(env, "matters", updated);
          return jsonResponse(newMatter, 201);
        }
        return jsonResponse(matters);
      }

      if (url.pathname.match(/^\/api\/v1\/matters\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        const matters = await getStore(env, "matters", realMatters);
        let matter = matters.find((m: any) => m.id === id || m.slug === id);
        if (!matter && matters.length > 0) {
          matter = matters[0];
        }
        if (!matter) {
          return jsonResponse({ detail: "Matter not found" }, 404);
        }

        if (request.method === "PATCH") {
          const body: any = await request.json();
          Object.assign(matter, body, { updated_at: new Date().toISOString() });
          if (body.name) matter.title = body.name;
          await setStore(env, "matters", matters);
          return jsonResponse(matter);
        }

        return jsonResponse(matter);
      }

      // Matter Links
      if (url.pathname.match(/^\/api\/v1\/matters\/[^/]+\/links$/)) {
        const matterId = url.pathname.split("/")[4];
        const allLinks = await getStore(env, "matter_links", realMatterLinks);
        if (request.method === "GET") {
          const relevant = allLinks
            .filter((l: any) => l.from_matter_id === matterId || l.to_matter_id === matterId)
            .map((l: any) => ({
              ...l,
              direction: l.from_matter_id === matterId ? "outgoing" : "incoming",
            }));
          return jsonResponse(relevant);
        }
        if (request.method === "POST") {
          const body: any = await request.json();
          const matters = await getStore(env, "matters", realMatters);
          const fromMatter = matters.find((m: any) => m.id === matterId || m.slug === matterId);
          const toMatter = matters.find((m: any) => m.id === body.to_matter_id || m.slug === body.to_matter_id);
          const newLink = {
            id: `ml-${Date.now()}`,
            from_matter_id: fromMatter ? fromMatter.id : matterId,
            from_matter_name: fromMatter ? fromMatter.name : "Matter",
            to_matter_id: toMatter ? toMatter.id : body.to_matter_id,
            to_matter_name: toMatter ? toMatter.name : "Target Matter",
            link_type: body.link_type || "related",
            direction: "outgoing",
            notes: body.notes || null,
            created_at: new Date().toISOString(),
          };
          const updated = [...allLinks, newLink];
          await setStore(env, "matter_links", updated);
          return jsonResponse(newLink, 201);
        }
      }

      if (url.pathname.match(/^\/api\/v1\/matter-links\/[^/]+$/) && request.method === "DELETE") {
        const linkId = url.pathname.split("/").pop();
        const allLinks = await getStore(env, "matter_links", realMatterLinks);
        const filtered = allLinks.filter((l: any) => l.id !== linkId);
        await setStore(env, "matter_links", filtered);
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // Matter Actors & Roles
      if (url.pathname.match(/^\/api\/v1\/matters\/[^/]+\/actors$/)) {
        const matterId = url.pathname.split("/")[4];
        const allRoles = await getStore(env, "matter_actors", realMatterActors);
        if (request.method === "GET") {
          const relevant = allRoles.filter((r: any) => r.matter_id === matterId || r.matter_slug === matterId);
          return jsonResponse(relevant);
        }
        if (request.method === "POST") {
          const body: any = await request.json();
          const actors = await getStore(env, "actors", realActors);
          const actor = actors.find((a: any) => a.id === body.actor_id);
          const newRole = {
            role_id: `mar-${Date.now()}`,
            matter_id: matterId,
            actor_id: body.actor_id,
            actor_name: actor ? actor.display_name : "Actor",
            actor_type: actor ? actor.actor_type : "person",
            role_label: body.role_label || "other non-party",
            notes: body.notes || null,
            created_at: new Date().toISOString(),
          };
          const updated = [...allRoles, newRole];
          await setStore(env, "matter_actors", updated);
          return jsonResponse(newRole, 201);
        }
      }

      if (url.pathname.match(/^\/api\/v1\/matter-actors\/[^/]+$/) && request.method === "DELETE") {
        const roleId = url.pathname.split("/").pop();
        const allRoles = await getStore(env, "matter_actors", realMatterActors);
        const filtered = allRoles.filter((r: any) => r.role_id !== roleId);
        await setStore(env, "matter_actors", filtered);
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // Source-Matter Links
      if (url.pathname.match(/^\/api\/v1\/matters\/[^/]+\/source-links$/) || url.pathname.match(/^\/api\/v1\/matters\/[^/]+\/sources$/)) {
        const matterId = url.pathname.split("/")[4];
        const allLinks = await getStore(env, "source_matter_links", realSourceMatterLinks);
        if (request.method === "GET") {
          return jsonResponse(allLinks.filter((l: any) => l.matter_id === matterId));
        }
        if (request.method === "POST") {
          const body: any = await request.json();
          const sources = await getStore(env, "sources", realSources);
          const src = sources.find((s: any) => s.id === body.source_id);
          const newLink = {
            id: `sml-${Date.now()}`,
            matter_id: matterId,
            source_id: body.source_id,
            source_title: src ? src.title : "Document",
            link_reason: body.link_reason || null,
            created_at: new Date().toISOString(),
          };
          const updated = [...allLinks, newLink];
          await setStore(env, "source_matter_links", updated);
          return jsonResponse(newLink, 201);
        }
      }

      if (url.pathname.match(/^\/api\/v1\/source-matter-links\/[^/]+$/) && request.method === "DELETE") {
        const linkId = url.pathname.split("/").pop();
        const allLinks = await getStore(env, "source_matter_links", realSourceMatterLinks);
        const filtered = allLinks.filter((l: any) => l.id !== linkId);
        await setStore(env, "source_matter_links", filtered);
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      if (url.pathname.match(/^\/api\/v1\/sources\/[^/]+\/matters$/)) {
        const sourceId = url.pathname.split("/")[4];
        const allLinks = await getStore(env, "source_matter_links", realSourceMatterLinks);
        const relevant = allLinks.filter((l: any) => l.source_id === sourceId);
        return jsonResponse(relevant);
      }

      // 4. Actors & Aliases
      if (url.pathname === "/api/v1/actors") {
        const actors = await getStore(env, "actors", realActors);
        if (request.method === "GET") {
          const q = url.searchParams.get("q")?.toLowerCase();
          const results = q
            ? actors.filter(
                (a: any) =>
                  a.display_name.toLowerCase().includes(q) ||
                  a.aliases.some((al: any) => al.alias_text.toLowerCase().includes(q))
              )
            : actors;
          return jsonResponse(results);
        }

        if (request.method === "POST") {
          const body: any = await request.json();
          const newActor = {
            id: `act-${Date.now().toString().slice(-4)}`,
            workspace_id: "ws-510w42",
            actor_type: body.actor_type || "person",
            display_name: body.display_name || "New Actor",
            normalized_name: body.display_name || "New Actor",
            description: body.description || null,
            aliases: (body.aliases || []).map((txt: any, idx: number) => ({
              id: `al-${Date.now()}-${idx}`,
              alias_text: typeof txt === "string" ? txt : txt?.alias_text || "Alias",
              alias_type: "informal",
            })),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const updated = [...actors, newActor];
          await setStore(env, "actors", updated);
          return jsonResponse(newActor, 201);
        }
      }

      if (url.pathname.match(/^\/api\/v1\/actors\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        const actors = await getStore(env, "actors", realActors);
        const actor = actors.find((a: any) => a.id === id);
        if (!actor) {
          return jsonResponse({ detail: "Actor not found" }, 404);
        }

        if (request.method === "GET") {
          return jsonResponse({
            actor,
            roles: [
              {
                role_id: `role-${actor.id}`,
                matter_id: "m-230cps",
                matter_name: "230 CPS — 2F Bedroom C",
                matter_slug: "230cps",
                role_label: actor.actor_type === "entity" ? "defendant corporation" : "claimant / party",
                notes: "Primary 510W42 corpus role assignment",
              },
            ],
          });
        }

        if (request.method === "PATCH") {
          const body: any = await request.json();
          if (body.display_name) actor.display_name = body.display_name;
          if (body.description !== undefined) actor.description = body.description;
          if (body.actor_type) actor.actor_type = body.actor_type;
          actor.updated_at = new Date().toISOString();
          await setStore(env, "actors", actors);
          return jsonResponse(actor);
        }

        if (request.method === "DELETE") {
          const filtered = actors.filter((a: any) => a.id !== id);
          await setStore(env, "actors", filtered);
          return new Response(null, { status: 204 });
        }
      }

      if (url.pathname.match(/\/api\/v1\/actors\/[^/]+\/aliases/) && request.method === "POST") {
        const id = url.pathname.split("/")[4];
        const actors = await getStore(env, "actors", realActors);
        const actor = actors.find((a: any) => a.id === id);
        const body: any = await request.json();
        const newAlias = {
          id: `al-${Date.now()}`,
          alias_text: body.alias_text || "New Alias",
          alias_type: body.alias_type || null,
        };
        if (actor) {
          actor.aliases.push(newAlias);
          await setStore(env, "actors", actors);
        }
        return jsonResponse(newAlias, 201);
      }

      // 5. Evidence Sources & Details
      if (url.pathname === "/api/v1/sources") {
        const sources = await getStore(env, "sources", realSources);
        if (request.method === "GET") {
          const q = url.searchParams.get("q")?.toLowerCase();
          let items = sources;
          if (q) items = items.filter((s: any) => s.title.toLowerCase().includes(q));
          return jsonResponse(items);
        }

        if (request.method === "POST") {
          const newSource = {
            id: `src-${Date.now().toString().slice(-4)}`,
            workspace_id: "ws-510w42",
            source_type: "pdf",
            title: "Uploaded 510W42 Evidence File",
            original_filename: "evidence_upload.pdf",
            mime_type: "application/pdf",
            storage_path: "sources/510w42/evidence_upload.pdf",
            sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            file_size_bytes: 154200,
            page_count: 2,
            source_status: "primary",
            evidence_review_status: "reviewed",
            included_flag: true,
            excluded_flag: false,
            exclusion_reason: null,
            authentication_notes: "Uploaded via web interface.",
            restrictions_notes: null,
            processing_status: "completed",
            ocr_status: "not_needed",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            duplicate_of: null,
          };
          const updated = [newSource, ...sources];
          await setStore(env, "sources", updated);
          return jsonResponse(newSource, 201);
        }
      }

      if (url.pathname.match(/^\/api\/v1\/sources\/[^/]+\/pages$/)) {
        const sourceId = url.pathname.split("/")[4];
        const pagesData = (pages510w42 as any)[sourceId] || [
          {
            id: `sp-${sourceId}-1`,
            source_id: sourceId,
            page_number: 1,
            page_label: "Page 1",
            ocr_text: "510W42 Case Exhibit authenticated from repository drivedigital/510W42.",
            image_path: null,
            created_at: "2024-09-06T10:00:00Z",
            updated_at: "2026-08-24T12:00:00Z",
          }
        ];
        return jsonResponse(pagesData);
      }

      if (url.pathname.match(/^\/api\/v1\/sources\/[^/]+\/file$/)) {
        const sourceId = url.pathname.split("/")[4];
        const sources = await getStore(env, "sources", realSources);
        const source = sources.find((s: any) => s.id === sourceId);

        // Check if file is stored in Cloudflare KV
        if (env.CASEVAULT_KV) {
          const fileData = await env.CASEVAULT_KV.get(`file:${sourceId}`, { type: "arrayBuffer" });
          if (fileData) {
            const mimeType = source?.mime_type || (sourceId.endsWith(".jpeg") || sourceId.includes("230-001") ? "image/jpeg" : "application/octet-stream");
            const filename = source?.original_filename || `${sourceId}.bin`;
            return new Response(fileData, {
              status: 200,
              headers: {
                "Content-Type": mimeType,
                "Content-Disposition": `inline; filename="${filename}"`,
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
              },
            });
          }
        }

        // If markdown/text, return text content from pages
        const pagesData = (pages510w42 as any)[sourceId];
        if (pagesData && pagesData[0] && pagesData[0].ocr_text) {
          return new Response(pagesData[0].ocr_text, {
            status: 200,
            headers: {
              "Content-Type": source?.mime_type || "text/plain; charset=utf-8",
              "Content-Disposition": `inline; filename="${source?.original_filename || sourceId + '.txt'}"`,
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        return new Response(
          `CaseVault 510W42 Case Exhibit\nPreserved in CaseVault from repository drivedigital/510W42.\nID: ${sourceId}\nTitle: ${source?.title || 'Unknown'}\nTimestamp: ${new Date().toISOString()}`,
          {
            status: 200,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Content-Disposition": `inline; filename="${sourceId}.txt"`,
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      if (url.pathname.match(/\/api\/v1\/sources\/[^/]+\/reprocess/) && request.method === "POST") {
        return jsonResponse({ ok: true, status: "completed" });
      }

      if (url.pathname.match(/^\/api\/v1\/sources\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        const sources = await getStore(env, "sources", realSources);
        const source = sources.find((s: any) => s.id === id) || sources[0];
        if (!source) {
          return jsonResponse({ detail: "Source not found" }, 404);
        }

        if (request.method === "PATCH") {
          const body: any = await request.json();
          Object.assign(source, body, { updated_at: new Date().toISOString() });
          await setStore(env, "sources", sources);
          return jsonResponse(source);
        }

        return jsonResponse(source);
      }

      // 6. Facts API
      if (url.pathname === "/api/v1/facts") {
        const facts = await getStore(env, "facts", realFacts);
        const matterId = url.searchParams.get("matter_id");
        const reviewState = url.searchParams.getAll("review_state");
        let items = facts;
        if (matterId) items = items.filter((f: any) => f.matter_id === matterId);
        if (reviewState.length > 0) items = items.filter((f: any) => reviewState.includes(f.review_state));

        return jsonResponse({
          items,
          total: items.length,
          limit: 50,
          offset: 0,
        });
      }

      if (url.pathname.match(/^\/api\/v1\/facts\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        const facts = await getStore(env, "facts", realFacts);
        const fact = facts.find((f: any) => f.id === id) || facts[0];
        if (!fact) {
          return jsonResponse({ detail: "Fact not found" }, 404);
        }

        if (request.method === "GET") {
          return jsonResponse({
            id: fact.id,
            statement_text: fact.statement_text,
            short_label: fact.short_label,
            review_state: fact.review_state,
            source_links: (fact.source_links || []).map((sl: any) => ({
              ...sl,
              source_title: "510W42 Case File Exhibit",
            })),
          });
        }

        if (request.method === "PATCH") {
          const body: any = await request.json();
          Object.assign(fact, body, { updated_at: new Date().toISOString() });
          await setStore(env, "facts", facts);
          return jsonResponse(fact);
        }
      }

      // 7. Chronology Feed & Events
      if (url.pathname.match(/\/api\/v1\/matters\/[^/]+\/chronology/)) {
        const matterId = url.pathname.split("/")[4];
        const events = await getStore(env, "events", realEvents);
        const matterEvents = events.filter((e: any) => e.matter_id === matterId || !e.matter_id);
        return jsonResponse({
          matter_id: matterId,
          events: matterEvents,
          unlinked_accepted_fact_count: 2,
        });
      }

      if (url.pathname === "/api/v1/events") {
        const events = await getStore(env, "events", realEvents);
        if (request.method === "GET") {
          const matterId = url.searchParams.get("matter_id");
          const items = matterId ? events.filter((e: any) => e.matter_id === matterId) : events;
          return jsonResponse({
            items,
            total: items.length,
            limit: 50,
            offset: 0,
          });
        }

        if (request.method === "POST") {
          const body: any = await request.json();
          const newEvent = {
            id: `ev-${Date.now().toString().slice(-4)}`,
            workspace_id: "ws-510w42",
            matter_id: body.matter_id || "m-230cps",
            title: body.title,
            description: body.description || null,
            date_start: body.date_start || null,
            date_end: body.date_end || null,
            date_precision: body.date_precision || "exact",
            date_text_raw: body.date_text_raw || null,
            significance_level: body.significance_level || "medium",
            review_state: "accepted",
            confidence_level: body.confidence_level || "high",
            created_from_proposal_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            fact_links: [],
            actor_links: [],
            created_from_proposal: null,
          };
          const updated = [...events, newEvent];
          await setStore(env, "events", updated);
          return jsonResponse(newEvent, 201);
        }
      }

      if (url.pathname.match(/^\/api\/v1\/events\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        const events = await getStore(env, "events", realEvents);
        const event = events.find((e: any) => e.id === id);
        if (!event) {
          return jsonResponse({ detail: "Event not found" }, 404);
        }

        if (request.method === "GET") {
          return jsonResponse(event);
        }

        if (request.method === "PATCH") {
          const body: any = await request.json();
          Object.assign(event, body, { updated_at: new Date().toISOString() });
          await setStore(env, "events", events);
          return jsonResponse(event);
        }

        if (request.method === "DELETE") {
          const filtered = events.filter((e: any) => e.id !== id);
          await setStore(env, "events", filtered);
          return new Response(null, { status: 204 });
        }
      }

      // Link facts to event
      if (url.pathname.match(/\/api\/v1\/events\/[^/]+\/facts/) && request.method === "POST") {
        const eventId = url.pathname.split("/")[4];
        const body: any = await request.json();
        const events = await getStore(env, "events", realEvents);
        const facts = await getStore(env, "facts", realFacts);
        const event = events.find((e: any) => e.id === eventId);
        const fact = facts.find((f: any) => f.id === body.fact_id);
        const link = {
          id: `efl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          event_id: eventId,
          fact_id: body.fact_id,
          relationship_type: body.relationship_type || "supports_event",
          created_at: new Date().toISOString(),
          fact_short_label: fact?.short_label || "Linked Fact",
          fact_statement: fact?.statement_text || "Accepted fact linked to event",
          fact_review_state: fact?.review_state || "accepted",
        };
        if (event) {
          if (!event.fact_links) event.fact_links = [];
          event.fact_links.push(link);
          await setStore(env, "events", events);
        }
        return jsonResponse(link, 201);
      }

      if (url.pathname.match(/\/api\/v1\/event-fact-links\/[^/]+/) && request.method === "DELETE") {
        const linkId = url.pathname.split("/").pop();
        const events = await getStore(env, "events", realEvents);
        for (const ev of events) {
          if (ev.fact_links) {
            ev.fact_links = ev.fact_links.filter((l: any) => l.id !== linkId);
          }
        }
        await setStore(env, "events", events);
        return new Response(null, { status: 204 });
      }

      // Link actors to event
      if (url.pathname.match(/\/api\/v1\/events\/[^/]+\/actors/) && request.method === "POST") {
        const eventId = url.pathname.split("/")[4];
        const body: any = await request.json();
        const events = await getStore(env, "events", realEvents);
        const actors = await getStore(env, "actors", realActors);
        const event = events.find((e: any) => e.id === eventId);
        const actor = actors.find((a: any) => a.id === body.actor_id);
        const link = {
          id: `eal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          event_id: eventId,
          actor_id: body.actor_id,
          role_in_event: body.role_in_event || null,
          created_at: new Date().toISOString(),
          actor_name: actor?.display_name || "Witness",
        };
        if (event) {
          if (!event.actor_links) event.actor_links = [];
          event.actor_links.push(link);
          await setStore(env, "events", events);
        }
        return jsonResponse(link, 201);
      }

      if (url.pathname.match(/\/api\/v1\/event-actor-links\/[^/]+/) && request.method === "DELETE") {
        const linkId = url.pathname.split("/").pop();
        const events = await getStore(env, "events", realEvents);
        for (const ev of events) {
          if (ev.actor_links) {
            ev.actor_links = ev.actor_links.filter((l: any) => l.id !== linkId);
          }
        }
        await setStore(env, "events", events);
        return new Response(null, { status: 204 });
      }

      // 8. Proposals & AI Review Engine
      if (url.pathname === "/api/v1/proposals") {
        const proposals = await getStore(env, "proposals", realProposals);
        if (request.method === "GET") {
          const matterId = url.searchParams.get("matter_id");
          const reviewState = url.searchParams.get("review_state");
          let items = proposals;
          if (matterId) items = items.filter((p: any) => p.matter_id === matterId);
          if (reviewState) items = items.filter((p: any) => p.review_state === reviewState);
          return jsonResponse({
            items,
            total: items.length,
            limit: 50,
            offset: 0,
          });
        }

        if (request.method === "POST") {
          const body: any = await request.json();
          const sources = await getStore(env, "sources", realSources);
          const newProp = {
            id: `prop-${Date.now().toString().slice(-4)}`,
            workspace_id: "ws-510w42",
            matter_id: body.matter_id || "m-230cps",
            proposal_type: body.proposal_type || "fact",
            review_state: "proposed",
            title: body.title || "Proposed Fact",
            proposed_text: body.proposed_text || null,
            proposed_structured_json: body.proposed_structured_json || {},
            source_id: body.source_id || null,
            excerpt_id: null,
            confidence_score: body.confidence_score || 0.9,
            created_by_system: false,
            created_by_user_id: "user-dan-george",
            reviewed_by_user_id: null,
            reviewed_at: null,
            review_notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            source: sources.find((s: any) => s.id === body.source_id) || null,
            excerpt: null,
          };
          const updated = [newProp, ...proposals];
          await setStore(env, "proposals", updated);
          return jsonResponse(newProp, 201);
        }
      }

      if (url.pathname.match(/^\/api\/v1\/proposals\/[^/]+$/)) {
        const id = url.pathname.split("/").pop();
        const proposals = await getStore(env, "proposals", realProposals);
        const prop = proposals.find((p: any) => p.id === id);
        if (!prop) {
          return jsonResponse({ detail: "Proposal not found" }, 404);
        }

        if (request.method === "GET") {
          return jsonResponse(prop);
        }

        if (request.method === "PATCH") {
          const body: any = await request.json();
          Object.assign(prop, body, { updated_at: new Date().toISOString() });
          await setStore(env, "proposals", proposals);
          return jsonResponse(prop);
        }
      }

      if (url.pathname.match(/\/api\/v1\/proposals\/[^/]+\/review/) && request.method === "POST") {
        const id = url.pathname.split("/")[4];
        const body: any = await request.json();
        const proposals = await getStore(env, "proposals", realProposals);
        const facts = await getStore(env, "facts", realFacts);
        const prop = proposals.find((p: any) => p.id === id);
        if (!prop) {
          return jsonResponse({ detail: "Proposal not found" }, 404);
        }

        prop.review_state = body.action === "accept" ? "accepted" : body.action;
        prop.reviewed_at = new Date().toISOString();
        prop.review_notes = body.review_notes || null;

        let createdFact = null;
        if (body.action === "accept" || body.action === "accept_with_edits") {
          createdFact = {
            id: `fact-${Date.now().toString().slice(-4)}`,
            workspace_id: prop.workspace_id,
            matter_id: prop.matter_id || "m-230cps",
            short_label: prop.title || "Accepted Fact",
            statement_text: prop.proposed_text || "",
            review_state: "accepted",
            confidence_level: "high",
            fact_type: "source_derived",
            is_material: true,
            created_from_proposal_id: prop.id,
            created_by_user_id: "user-reviewer",
            approved_by_user_id: "user-reviewer",
            approved_at: new Date().toISOString(),
            supersedes_fact_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            source_links: prop.source_id
              ? [
                  {
                    id: `fsl-${Date.now()}`,
                    fact_id: `fact-${Date.now().toString().slice(-4)}`,
                    source_id: prop.source_id,
                    excerpt_id: null,
                    support_type: "supports",
                    strength: "high",
                    notes: "Created via 510W42 proposal review",
                    created_at: new Date().toISOString(),
                  },
                ]
              : [],
            actor_links: [],
            created_from_proposal: { id: prop.id, proposal_type: prop.proposal_type },
          };
          facts.unshift(createdFact);
          await setStore(env, "facts", facts);
        }

        await setStore(env, "proposals", proposals);
        return jsonResponse({
          proposal: prop,
          fact: createdFact,
        });
      }

      if (url.pathname === "/api/v1/proposals/bulk-review" && request.method === "POST") {
        const body: any = await request.json();
        const ids: string[] = body.ids || [];
        const action = body.action || "accept";
        const proposals = await getStore(env, "proposals", realProposals);
        const facts = await getStore(env, "facts", realFacts);
        const results = [];
        const created_facts = [];

        for (const id of ids) {
          const prop = proposals.find((p: any) => p.id === id);
          if (prop) {
            prop.review_state = action === "accept" ? "accepted" : action;
            prop.reviewed_at = new Date().toISOString();
            if (action === "accept") {
              const newFact = {
                id: `fact-${Date.now().toString().slice(-4)}`,
                workspace_id: prop.workspace_id,
                matter_id: prop.matter_id || "m-230cps",
                short_label: prop.title || "Accepted Fact",
                statement_text: prop.proposed_text || "",
                review_state: "accepted",
                confidence_level: "high",
                fact_type: "source_derived",
                is_material: true,
                created_from_proposal_id: prop.id,
                created_by_user_id: "user-reviewer",
                approved_by_user_id: "user-reviewer",
                approved_at: new Date().toISOString(),
                supersedes_fact_id: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                source_links: [],
                actor_links: [],
                created_from_proposal: null,
              };
              facts.unshift(newFact);
              created_facts.push(newFact);
            }
            results.push({ id, ok: true });
          } else {
            results.push({ id, ok: false, error: "Not found" });
          }
        }

        await setStore(env, "facts", facts);
        await setStore(env, "proposals", proposals);
        return jsonResponse({ results, created_facts });
      }

      if (url.pathname === "/api/v1/proposals/generate" && request.method === "POST") {
        const body: any = await request.json();
        const sources = await getStore(env, "sources", realSources);
        const proposals = await getStore(env, "proposals", realProposals);
        const source = sources.find((s: any) => s.id === body.source_id);
        const newP1 = {
          id: `prop-${Date.now().toString().slice(-4)}1`,
          workspace_id: "ws-510w42",
          matter_id: "m-230cps",
          proposal_type: "fact",
          review_state: "proposed",
          title: `Factual Allegation extracted from ${source?.title || "Evidence"}`,
          proposed_text: "Claimant maintained continuous exclusive residential possession under mutual agreement with shareholder, establishing statutory protection under RPAPL §768.",
          proposed_structured_json: { actors: ["Dan George", "Ian Reisner"] },
          source_id: body.source_id || "src-230-001",
          excerpt_id: null,
          confidence_score: 0.94,
          created_by_system: true,
          created_by_user_id: null,
          reviewed_by_user_id: null,
          reviewed_at: null,
          review_notes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source: source || null,
          excerpt: null,
        };
        const updated = [newP1, ...proposals];
        await setStore(env, "proposals", updated);
        return jsonResponse({ created: 1, skipped: 0 });
      }

      // 9. Claim Templates & Instances
      if (url.pathname === "/api/v1/claim-templates") {
        return jsonResponse([
          {
            id: "tpl-rpapl-768",
            jurisdiction: "NY",
            name: "RPAPL § 768 / NYC Admin Code § 26-521 (Unlawful Eviction)",
            category: "Real Property & Housing",
            source_authority_text: "NY Real Property Actions and Proceedings Law § 768; NYC Admin. Code § 26-521",
            notes: "Applies to occupants residing in dwelling unit for 30 consecutive days or more.",
            is_active: true,
            element_count: 4,
            elements: [
              { id: "el-768-1", element_order: 1, element_label: "Lawful Occupancy Exceeding 30 Days", element_description: "Occupant resided in dwelling unit continuously for 30 days or under lease.", is_issue_row: false },
              { id: "el-768-2", element_order: 2, element_label: "Unlawful Exclusion or Lockout", element_description: "Exclusion without judicial warrant of eviction naming the occupant.", is_issue_row: false },
              { id: "el-768-3", element_order: 3, element_label: "Failure to Restore Upon Demand", element_description: "Refusal or failure to restore possession after prompt demand.", is_issue_row: false },
              { id: "el-768-4", element_order: 4, element_label: "Cognizable Damages / Statutory Penalties", element_description: "Out-of-pocket loss, replacement shelter, and statutory civil penalties ($1,000–$10,000).", is_issue_row: false },
            ],
          },
          {
            id: "tpl-rpapl-853",
            jurisdiction: "NY",
            name: "RPAPL § 853 (Treble Damages for Forcible or Unlawful Detainer)",
            category: "Real Property & Housing",
            source_authority_text: "NY Real Property Actions and Proceedings Law § 853",
            notes: "Statutory treble damages for unlawful ejectment, detainer, or putting out by unlawful means.",
            is_active: true,
            element_count: 3,
            elements: [
              { id: "el-853-1", element_order: 1, element_label: "Peaceable Possession by Claimant", element_description: "Claimant was in actual peaceable possession of real property.", is_issue_row: false },
              { id: "el-853-2", element_order: 2, element_label: "Forcible or Unlawful Ejectment", element_description: "Ejected or put out of possession in an unlawful manner.", is_issue_row: false },
              { id: "el-853-3", element_order: 3, element_label: "Treble Damages Measure", element_description: "Actual damages resulting from exclusion subject to threefold multiplier.", is_issue_row: false },
            ],
          },
          {
            id: "tpl-crl-51",
            jurisdiction: "NY",
            name: "NY Civil Rights Law § 51 (Commercial Misappropriation of Identity)",
            category: "Civil Rights & Privacy",
            source_authority_text: "New York Civil Rights Law §§ 50 & 51",
            notes: "Strict liability for unauthorized use of name, portrait, picture or voice for advertising/trade.",
            is_active: true,
            element_count: 3,
            elements: [
              { id: "el-crl-1", element_order: 1, element_label: "Use of Protected Identity", element_description: "Defendant used plaintiff's name, portrait, or voice.", is_issue_row: false },
              { id: "el-crl-2", element_order: 2, element_label: "Commercial / Trade Purpose", element_description: "Used within New York state for advertising purposes or for purposes of trade.", is_issue_row: false },
              { id: "el-crl-3", element_order: 3, element_label: "Absence of Prior Written Consent", element_description: "Without having first obtained the written consent of plaintiff.", is_issue_row: false },
            ],
          },
        ]);
      }

      if (url.pathname === "/api/v1/claim-instances") {
        return jsonResponse({
          items: [
            {
              id: "cl-c1",
              matter_id: "m-230cps",
              template_id: "tpl-rpapl-768",
              name: "RPAPL § 768 & NYC Admin. Code § 26-521 (2F Bedroom C Exclusion)",
              claim_code: "COUNT-I",
              target_summary: "230 Park South Apartments, Inc.",
              status: "active",
              theory_summary: "Building staff excluded a lawful 270-day occupant from 2F Bedroom C without judicial warrant naming him.",
              highest_priority_gap: "Obtain 3 Jun door instruction, lobby records, and phone logs.",
              authority_verification_state: "verified",
              notes: "Primary statutory wrongful eviction cause of action.",
              burden: {
                status: "partially_supported",
                label: "Partially Supported",
                elements_total: 4,
                proven_elements: 2,
                partial_elements: 2,
                unsupported_elements: 0,
                conflicted_elements: 0,
                explanation: "Lawful occupancy (270 days) and warrant absence supported; door instruction records needed.",
              },
              element_count: 4,
              gap_count: 1,
              support_fact_count: 3,
              adverse_fact_count: 0,
              created_at: "2024-09-06T10:00:00Z",
              updated_at: new Date().toISOString(),
            },
            {
              id: "cl-c2",
              matter_id: "m-230cps",
              template_id: "tpl-rpapl-853",
              name: "RPAPL § 853 (Treble Damages for Unlawful Detainer)",
              claim_code: "COUNT-II",
              target_summary: "230 Park South Apartments, Inc. & Co-op Management",
              status: "active",
              theory_summary: "Unlawful ejectment of occupant entitling claimant to treble damages under RPAPL 853.",
              highest_priority_gap: "Counsel limitations briefing on CPLR 214 vs 215 timing.",
              authority_verification_state: "verified",
              notes: "Treble damages remedy for unlawful ejectment.",
              burden: {
                status: "partially_supported",
                label: "Partially Supported",
                elements_total: 3,
                proven_elements: 1,
                partial_elements: 2,
                unsupported_elements: 0,
                conflicted_elements: 0,
                explanation: "Peaceable possession established; counsel limitations analysis underway.",
              },
              element_count: 3,
              gap_count: 1,
              support_fact_count: 2,
              adverse_fact_count: 0,
              created_at: "2024-09-06T10:00:00Z",
              updated_at: new Date().toISOString(),
            },
            {
              id: "cl-510-crl51",
              matter_id: "m-510w42",
              template_id: "tpl-crl-51",
              name: "NY Civil Rights Law § 51 (Commercial Misappropriation of Name)",
              claim_code: "COUNT-III",
              target_summary: "Ian Reisner & Urban Resort LLC",
              status: "active",
              theory_summary: "Commercial use of Dan George's name and likeness in capital solicitation materials without prior written consent.",
              highest_priority_gap: "Counsel decision on CRL §51 working date (~3 Oct 2026 under 204 arithmetic).",
              authority_verification_state: "verified",
              notes: "Identity misappropriation count on October 9, 2024 deck.",
              burden: {
                status: "proven",
                label: "Proven by Record",
                elements_total: 3,
                proven_elements: 3,
                partial_elements: 0,
                unsupported_elements: 0,
                conflicted_elements: 0,
                explanation: "Written deck in record with Dan George name and absence of written consent verified.",
              },
              element_count: 3,
              gap_count: 0,
              support_fact_count: 2,
              adverse_fact_count: 0,
              created_at: "2024-10-09T14:30:00Z",
              updated_at: new Date().toISOString(),
            },
          ],
          total: 3,
          limit: 20,
          offset: 0,
        });
      }

      // Claim Chart endpoint (/api/v1/claim-instances/{id}/chart)
      if (url.pathname.match(/\/api\/v1\/claim-instances\/[^/]+\/chart/)) {
        const claimId = url.pathname.split("/")[4];
        if (claimId === "cl-510-crl51") {
          return jsonResponse({
            claim: {
              id: "cl-510-crl51",
              matter_id: "m-510w42",
              template_id: "tpl-crl-51",
              claim_code: "COUNT-III",
              name: "NY Civil Rights Law § 51 (Commercial Misappropriation of Name)",
              target_summary: "Ian Reisner & Urban Resort LLC",
              status: "active",
              theory_summary: "Commercial use of Dan George's name and likeness in capital solicitation materials without prior written consent.",
              highest_priority_gap: "Counsel decision on CRL §51 working date (~3 Oct 2026 under 204 arithmetic).",
              authority_verification_state: "verified",
              notes: "Identity misappropriation count on October 9, 2024 deck.",
              created_at: "2024-10-09T14:30:00Z",
              updated_at: new Date().toISOString(),
              burden: {
                status: "proven",
                label: "Proven by Record",
                elements_total: 3,
                proven_elements: 3,
                partial_elements: 0,
                unsupported_elements: 0,
                conflicted_elements: 0,
                explanation: "Written deck in record with Dan George name and absence of written consent verified.",
              },
              element_count: 3,
              gap_count: 0,
              support_fact_count: 2,
              adverse_fact_count: 0,
            },
            burden: {
              status: "proven",
              label: "Proven by Record",
              elements_total: 3,
              proven_elements: 3,
              partial_elements: 0,
              unsupported_elements: 0,
              conflicted_elements: 0,
              explanation: "Written deck in record with Dan George name and absence of written consent verified.",
            },
            elements: [
              {
                id: "el-crl-1",
                claim_instance_id: "cl-510-crl51",
                template_element_id: "el-crl-1",
                element_order: 1,
                element_label: "Use of Protected Identity",
                element_description: "Defendant used plaintiff's name, portrait, or voice.",
                is_issue_row: false,
                burden_status: "proven",
                gap_assessment: null,
                created_at: "2024-10-09T14:30:00Z",
                updated_at: new Date().toISOString(),
                facts: [
                  {
                    fact_id: "fact-510-01",
                    statement_text: "On October 9, 2024, Ian Reisner distributed an investor solicitation presentation for 510 W 42nd St utilizing Dan George's name and professional reputation without prior written authorization.",
                    short_label: "Unauthorized Commercial Identity Exploitation in Pitch Deck",
                    review_state: "accepted",
                    confidence_level: "high",
                    polarity: "supports",
                    weight: "dispositive",
                    qualification: "Slide deck in evidence explicitly features Dan George name.",
                    created_at: "2024-10-09T14:30:00Z",
                    evidence_sources: ["CRL §51 Pitch Deck — Commercial Exploitation of DG Identity"],
                    actors: ["Dan George", "Ian Reisner", "Urban Resort LLC"],
                    link_id: "ef-crl-1",
                    source_links: [
                      {
                        id: "sl-crl-1",
                        source_id: "src-510-015",
                        source_title: "CRL §51 Pitch Deck — Commercial Exploitation of DG Identity",
                        support_type: "supports",
                        strength: "high",
                        page_start: 1,
                        page_end: 4,
                        locator_text: "Slide 4",
                      },
                    ],
                  },
                ],
              },
              {
                id: "el-crl-2",
                claim_instance_id: "cl-510-crl51",
                template_element_id: "el-crl-2",
                element_order: 2,
                element_label: "Commercial / Trade Purpose",
                element_description: "Used within New York state for advertising purposes or for purposes of trade.",
                is_issue_row: false,
                burden_status: "proven",
                gap_assessment: null,
                created_at: "2024-10-09T14:30:00Z",
                updated_at: new Date().toISOString(),
                facts: [
                  {
                    fact_id: "fact-510-01",
                    statement_text: "Pitch deck used for solicitation of commercial investment funds in hotel real estate.",
                    short_label: "Commercial Trade Purpose",
                    review_state: "accepted",
                    confidence_level: "high",
                    polarity: "supports",
                    weight: "dispositive",
                    qualification: "Investor transmittal records demonstrate trade purpose.",
                    created_at: "2024-10-09T14:30:00Z",
                    evidence_sources: ["CRL §51 Pitch Deck — Commercial Exploitation of DG Identity"],
                    actors: ["Ian Reisner"],
                    link_id: "ef-crl-2",
                    source_links: [],
                  },
                ],
              },
              {
                id: "el-crl-3",
                claim_instance_id: "cl-510-crl51",
                template_element_id: "el-crl-3",
                element_order: 3,
                element_label: "Absence of Prior Written Consent",
                element_description: "Without having first obtained the written consent of plaintiff.",
                is_issue_row: false,
                burden_status: "proven",
                gap_assessment: null,
                created_at: "2024-10-09T14:30:00Z",
                updated_at: new Date().toISOString(),
                facts: [],
              },
            ],
            gap_items: [],
          });
        }

        // Default to C1 (RPAPL 768)
        return jsonResponse({
          claim: {
            id: "cl-c1",
            matter_id: "m-230cps",
            template_id: "tpl-rpapl-768",
            claim_code: "COUNT-I",
            name: "RPAPL § 768 & NYC Admin. Code § 26-521 (2F Bedroom C Exclusion)",
            target_summary: "230 Park South Apartments, Inc.",
            status: "active",
            theory_summary: "Building staff excluded a lawful 270-day occupant from 2F Bedroom C without judicial warrant naming him.",
            highest_priority_gap: "Obtain 3 Jun door instruction, lobby records, and phone logs.",
            authority_verification_state: "verified",
            notes: "Primary statutory wrongful eviction cause of action.",
            created_at: "2024-09-06T10:00:00Z",
            updated_at: new Date().toISOString(),
            burden: {
              status: "partially_supported",
              label: "Partially Supported",
              elements_total: 4,
              proven_elements: 2,
              partial_elements: 2,
              unsupported_elements: 0,
              conflicted_elements: 0,
              explanation: "Lawful occupancy (270 days) and warrant absence supported; door instruction records needed.",
            },
            element_count: 4,
            gap_count: 1,
            support_fact_count: 3,
            adverse_fact_count: 0,
          },
          burden: {
            status: "partially_supported",
            label: "Partially Supported",
            elements_total: 4,
            proven_elements: 2,
            partial_elements: 2,
            unsupported_elements: 0,
            conflicted_elements: 0,
            explanation: "Lawful occupancy (270 days) and warrant absence supported; door instruction records needed.",
          },
          elements: [
            {
              id: "el-1",
              claim_instance_id: "cl-c1",
              template_element_id: "el-768-1",
              element_order: 1,
              element_label: "Lawful Occupancy Exceeding 30 Days",
              element_description: "Occupant resided in dwelling unit continuously for 30 days or under lease.",
              is_issue_row: false,
              burden_status: "proven",
              gap_assessment: null,
              created_at: "2024-09-06T10:00:00Z",
              updated_at: new Date().toISOString(),
              facts: [
                {
                  fact_id: "fact-230-01",
                  statement_text: "Dan George maintained continuous, open, and exclusive residential occupancy of Bedroom C at 230 Central Park South from September 6, 2024 through June 3, 2025 (270 days), satisfying the statutory 30-day residency protection of NY RPAPL §768.",
                  short_label: "270-Day Residential Occupancy of 2F Bedroom C",
                  review_state: "accepted",
                  confidence_level: "high",
                  polarity: "supports",
                  weight: "dispositive",
                  qualification: "Floor plan and contemporaneous residency proof.",
                  created_at: "2024-09-06T10:00:00Z",
                  evidence_sources: ["2F Floor Plan Showing Exclusive Bedroom C Demise"],
                  actors: ["Dan George", "Ian Reisner"],
                  link_id: "ef-1",
                  source_links: [
                    {
                      id: "sl-1",
                      source_id: "src-230-001",
                      source_title: "2F Floor Plan Showing Exclusive Bedroom C Demise",
                      support_type: "supports",
                      strength: "high",
                      page_start: 1,
                      page_end: 1,
                      locator_text: "Bedroom C & Private Bath",
                    },
                  ],
                },
              ],
            },
            {
              id: "el-2",
              claim_instance_id: "cl-c1",
              template_element_id: "el-768-2",
              element_order: 2,
              element_label: "Unlawful Exclusion or Lockout",
              element_description: "Exclusion without judicial warrant of eviction naming the occupant.",
              is_issue_row: false,
              burden_status: "proven",
              gap_assessment: null,
              created_at: "2025-06-03T18:00:00Z",
              updated_at: new Date().toISOString(),
              facts: [
                {
                  fact_id: "fact-230-02",
                  statement_text: "On June 3, 2025, doorman Donnie and superintendent Villanova barred Dan George from entering 2F Bedroom C under instructions from co-op management without any warrant of eviction or court order naming him.",
                  short_label: "June 3, 2025 Door Exclusion Without Process",
                  review_state: "accepted",
                  confidence_level: "high",
                  polarity: "supports",
                  weight: "dispositive",
                  qualification: "Demonstrates physical exclusion without judicial process.",
                  created_at: "2025-06-03T18:00:00Z",
                  evidence_sources: ["June 3, 2025 2F Door Exclusion Record — Doorman Donnie Refusal"],
                  actors: ["Dan George", "230 Park South Apartments Inc."],
                  link_id: "ef-2",
                  source_links: [
                    {
                      id: "sl-2",
                      source_id: "src-230-016",
                      source_title: "June 3, 2025 2F Door Exclusion Record — Doorman Donnie Refusal",
                      support_type: "supports",
                      strength: "high",
                      page_start: 1,
                      page_end: 2,
                      locator_text: "Paragraphs 26-27",
                    },
                  ],
                },
              ],
            },
            {
              id: "el-3",
              claim_instance_id: "cl-c1",
              template_element_id: "el-768-3",
              element_order: 3,
              element_label: "Failure to Restore Upon Demand",
              element_description: "Refusal or failure to restore possession after prompt demand.",
              is_issue_row: false,
              burden_status: "supported",
              gap_assessment: null,
              created_at: "2025-10-20T17:38:00Z",
              updated_at: new Date().toISOString(),
              facts: [
                {
                  fact_id: "fact-230-03",
                  statement_text: "On October 20, 2025, Dan George served written demand upon Property Guardian Andre Cizmarik demanding immediate restoration of access to 2F Bedroom C and accounting/return of 45 itemized personal property items.",
                  short_label: "Service of Written Restoration & Chattel Demand",
                  review_state: "accepted",
                  confidence_level: "high",
                  polarity: "supports",
                  weight: "strong",
                  qualification: "Demonstrates statutory demand.",
                  created_at: "2025-10-20T17:38:00Z",
                  evidence_sources: ["DG Written Demand for Restoration and Inventory (Oct 20, 2025)"],
                  actors: ["Dan George", "Andre K. Cizmarik"],
                  link_id: "ef-3",
                  source_links: [
                    {
                      id: "sl-3",
                      source_id: "src-230-018",
                      source_title: "DG Written Demand for Restoration and Inventory (Oct 20, 2025)",
                      support_type: "supports",
                      strength: "high",
                      page_start: 1,
                      page_end: 6,
                      locator_text: "Demand Letter",
                    },
                  ],
                },
              ],
            },
            {
              id: "el-4",
              claim_instance_id: "cl-c1",
              template_element_id: "el-768-4",
              element_order: 4,
              element_label: "Cognizable Damages / Statutory Penalties",
              element_description: "Out-of-pocket loss, replacement shelter, and statutory civil penalties ($1,000–$10,000).",
              is_issue_row: false,
              burden_status: "supported",
              gap_assessment: "Counsel damages mitigation and rental offset calculations.",
              created_at: "2025-10-20T17:38:00Z",
              updated_at: new Date().toISOString(),
              facts: [],
            },
          ],
          gap_items: [
            {
              element_id: "el-4",
              element_label: "Cognizable Damages / Statutory Penalties",
              severity: "medium",
              gap_assessment: "Counsel damages mitigation and rental offset calculations.",
            },
          ],
        });
      }

      // 10. Webhooks
      if (url.pathname === "/api/v1/webhooks/github") {
        return handleGitHubWebhook(request, env);
      }

      // 11. Supabase integration proxy & status
      if (url.pathname === "/api/v1/integrations/supabase/status") {
        return handleSupabaseHealth(env);
      }

      return jsonResponse({ error: "Endpoint not found", path: url.pathname }, 404);
    } catch (err: any) {
      return jsonResponse(
        {
          error: "Internal Server Error",
          message: err?.message || String(err),
          stack: err?.stack,
        },
        500
      );
    }
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    },
  });
}

async function handleGitHubWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const signature = request.headers.get("x-hub-signature-256");
  const event = request.headers.get("x-github-event");
  const rawBody = await request.arrayBuffer();

  if (env.GITHUB_WEBHOOK_SECRET) {
    if (!signature) {
      return jsonResponse({ error: "Missing signature header" }, 401);
    }
    const isValid = await verifyGitHubSignature(rawBody, signature, env.GITHUB_WEBHOOK_SECRET);
    if (!isValid) {
      return jsonResponse({ error: "Invalid webhook signature" }, 403);
    }
  }

  const text = new TextDecoder().decode(rawBody);
  let payload: any = {};
  try {
    payload = JSON.parse(text);
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  if (event === "ping") {
    return jsonResponse({
      status: "pong",
      repo: payload?.repository?.full_name,
      zen: payload?.zen,
    });
  }

  if (event === "push") {
    const branch = (payload?.ref || "").replace("refs/heads/", "");
    const commitsCount = payload?.commits?.length || 0;
    const author = payload?.pusher?.name || payload?.head_commit?.author?.name || "Unknown";
    const commitMsg = (payload?.head_commit?.message || "").split("\n")[0];
    const sha = (payload?.head_commit?.id || "").slice(0, 7);

    return jsonResponse({
      status: "received",
      event: "push",
      branch,
      author,
      commit: sha,
      message: commitMsg,
      count: commitsCount,
    });
  }

  return jsonResponse({ status: "received", event });
}

async function verifyGitHubSignature(
  rawBody: ArrayBuffer,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  if (!signatureHeader.startsWith("sha256=")) return false;
  const signature = signatureHeader.slice(7);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signed = await crypto.subtle.sign("HMAC", key, rawBody);
  const hashArray = Array.from(new Uint8Array(signed));
  const expectedSignature = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return signature === expectedSignature;
}

async function handleSupabaseHealth(env: Env): Promise<Response> {
  if (!env.SUPABASE_URL) {
    return jsonResponse({
      status: "not_configured",
      message: "SUPABASE_URL environment variable is not set.",
    });
  }

  const checkUrl = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/`;
  const headers: Record<string, string> = {};
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    headers["apikey"] = env.SUPABASE_SERVICE_ROLE_KEY;
    headers["Authorization"] = `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`;
  }

  try {
    const res = await fetch(checkUrl, { method: "HEAD", headers });
    return jsonResponse({
      status: res.status < 400 ? "connected" : "reachable",
      http_status: res.status,
      supabase_url: env.SUPABASE_URL,
    });
  } catch (err: any) {
    return jsonResponse(
      {
        status: "error",
        message: err?.message || String(err),
        supabase_url: env.SUPABASE_URL,
      },
      502
    );
  }
}
