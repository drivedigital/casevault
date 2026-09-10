"""Domain enums (Database Schema Draft §5). Values must stay in sync with
the Postgres enum types created by the Alembic migrations."""
import enum


class StrEnum(str, enum.Enum):
    """Enum whose members are plain strings (JSON-friendly)."""

    def __str__(self) -> str:
        return self.value


class MatterType(StrEnum):
    merits = "merits"
    proceeding = "proceeding"
    research = "research"
    other = "other"


class MatterStatus(StrEnum):
    active = "active"
    planned = "planned"
    hold = "hold"
    archived = "archived"


class ActorType(StrEnum):
    person = "person"
    entity = "entity"
    court = "court"
    agency = "agency"
    other = "other"


class SharingPolicy(StrEnum):
    no_ai = "no_ai"
    local_only = "local_only"
    external_excerpts_only = "external_excerpts_only"
    external_selected_full_documents = "external_selected_full_documents"


class WorkspaceRole(StrEnum):
    owner = "owner"
    reviewer = "reviewer"
    commenter = "commenter"
    viewer = "viewer"
    editor_limited = "editor_limited"


class SourceType(StrEnum):
    pdf = "pdf"
    image = "image"
    email = "email"
    text = "text"
    markdown = "markdown"
    spreadsheet = "spreadsheet"
    note = "note"
    other = "other"


class SourceStatus(StrEnum):
    primary = "primary"
    derived = "derived"
    testimony = "testimony"
    working_note = "working_note"
    public_record = "public_record"


class EvidenceReviewStatus(StrEnum):
    uploaded = "uploaded"
    processing = "processing"
    reviewed = "reviewed"
    cited = "cited"
    included = "included"
    excluded = "excluded"
    duplicate = "duplicate"
    privileged = "privileged"
    settlement_restricted = "settlement_restricted"
    background_only = "background_only"
    impeachment_only = "impeachment_only"


# Matter link types are plain strings (Schema Draft: VARCHAR(64)); these are
# the canonical values used by the UI.
MATTER_LINK_TYPES = [
    "related",
    "overlays",
    "shares_sources",
    "shares_actors",
    "procedural_dependency",
]

# Canonical actor role labels for matter assignment.
ACTOR_ROLE_LABELS = [
    "plaintiff",
    "co-party",
    "counterparty",
    "witness",
    "custodian",
    "counsel",
    "court actor",
    "other non-party",
]
