export type MatterType = "merits" | "proceeding" | "research" | "other";
export type MatterStatus = "active" | "planned" | "hold" | "archived";
export type ActorType = "person" | "entity" | "court" | "agency" | "other";
export type SharingPolicy =
  | "no_ai"
  | "local_only"
  | "external_excerpts_only"
  | "external_selected_full_documents";

export interface Workspace {
  id: string;
  name: string;
  jurisdiction_default: string;
  ai_sharing_default: SharingPolicy;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface Matter {
  id: string;
  workspace_id: string;
  slug: string;
  name: string;
  matter_type: MatterType;
  status: MatterStatus;
  theory_summary: string | null;
  controlling_memo_ref: string | null;
  next_work: string | null;
  jurisdiction: string;
  ai_sharing_policy: SharingPolicy;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatterLink {
  id: string;
  from_matter_id: string;
  from_matter_name: string;
  to_matter_id: string;
  to_matter_name: string;
  link_type: string;
  direction: "outgoing" | "incoming";
  notes: string | null;
  created_at: string;
}

export interface ActorAlias {
  id: string;
  alias_text: string;
  alias_type: string | null;
}

export interface Actor {
  id: string;
  workspace_id: string;
  actor_type: ActorType;
  display_name: string;
  normalized_name: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  aliases: ActorAlias[];
}

export interface ActorRole {
  role_id: string;
  matter_id: string;
  matter_name: string;
  matter_slug: string;
  role_label: string;
  notes: string | null;
}

export interface ActorDossier {
  actor: Actor;
  roles: ActorRole[];
}

export interface MatterActor {
  role_id: string;
  actor_id: string;
  actor_name: string;
  actor_type: string;
  role_label: string;
  notes: string | null;
  created_at: string;
}

export const MATTER_LINK_TYPES = [
  "related",
  "overlays",
  "shares_sources",
  "shares_actors",
  "procedural_dependency",
] as const;

export const ACTOR_ROLE_LABELS = [
  "plaintiff",
  "co-party",
  "counterparty",
  "witness",
  "custodian",
  "counsel",
  "court actor",
  "other non-party",
] as const;
