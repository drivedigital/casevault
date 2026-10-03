"""wave2 intake core: ledger proposals facts links

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-10

Implements docs/contracts/wave2_intake_core.md v1.0 (frozen), section 2.
Sprints 4 (source ledger) and 5 (proposal review / fact intake) share one
migration per the schema draft (section 9, Migration 004). Tables:
ledger_entries, proposals, fact_assertions, fact_source_links,
fact_actor_links; enums: proposal_type_enum, review_state_enum,
fact_type_enum, support_type_enum, strength_label_enum.

Deliberate extension: ledger_entries.tags_json is NOT part of the schema
draft's ledger table. PRD section 10.4 requires tag filters and bulk
tagging, so tags live here as a JSONB array of short strings (validated in
the service layer). Recorded in handoff/DECISIONS.md when this migration
merges.

ledger_entries.source_status reuses source_status_enum created by 0003 —
referencing an existing type in a new op.create_table neither re-creates
nor re-drops it (verified on postgres 16).

Deferred (contract section 2): full-text GIN indexes on statement_text
(Sprint 10), embedding columns, verification_task rows, audit rows
(Migration 010), soft-delete columns for facts.
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('ledger_entries',
    sa.Column('workspace_id', sa.Uuid(), nullable=False),
    sa.Column('matter_id', sa.Uuid(), nullable=True),
    sa.Column('external_ledger_id', sa.String(length=64), nullable=True),
    sa.Column('date_start', sa.Date(), nullable=True),
    sa.Column('date_end', sa.Date(), nullable=True),
    sa.Column('date_text_raw', sa.Text(), nullable=True),
    sa.Column('fact_short_name', sa.String(length=255), nullable=False),
    sa.Column('fact_statement', sa.Text(), nullable=False),
    sa.Column('claim_use_text', sa.Text(), nullable=True),
    sa.Column('relief_use_text', sa.Text(), nullable=True),
    sa.Column('source_path_text', sa.Text(), nullable=True),
    sa.Column('source_locator_text', sa.Text(), nullable=True),
    # 0003 owns source_status_enum: create_type=False so a database that is
    # already at 0003 and upgrades in a separate alembic invocation does not
    # attempt a second CREATE TYPE (the enum-creation memo only covers types
    # created earlier in the same command). The resulting column type is the
    # same; 0003 creates the type, 0004 only references it.
    sa.Column('source_status', postgresql.ENUM('primary', 'derived', 'testimony', 'working_note', 'public_record', name='source_status_enum', create_type=False), nullable=True),
    sa.Column('authentication_or_witness', sa.Text(), nullable=True),
    sa.Column('confidence_level', sa.Enum('low', 'medium', 'high', name='strength_label_enum'), nullable=True),
    sa.Column('verification_task_text', sa.Text(), nullable=True),
    sa.Column('restrictions_or_notes', sa.Text(), nullable=True),
    sa.Column('linked_source_id', sa.Uuid(), nullable=True),
    sa.Column('tags_json', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['matter_id'], ['matters.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['linked_source_id'], ['sources.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    # Partial unique: one external ledger id per matter, only for rows that
    # actually carry one (external_ledger_id is optional by design).
    op.create_index('uq_ledger_entries__matter__external_id', 'ledger_entries', ['matter_id', 'external_ledger_id'], unique=True, postgresql_where=sa.text('external_ledger_id IS NOT NULL'))
    op.create_index('ix_ledger_entries__matter__date_start', 'ledger_entries', ['matter_id', 'date_start'], unique=False)
    op.create_index('ix_ledger_entries__workspace__source_status', 'ledger_entries', ['workspace_id', 'source_status'], unique=False)
    op.create_table('proposals',
    sa.Column('workspace_id', sa.Uuid(), nullable=False),
    sa.Column('matter_id', sa.Uuid(), nullable=True),
    sa.Column('proposal_type', sa.Enum('fact', 'event', 'actor', 'duplicate_merge', 'date_normalization', 'claim_mapping', 'contradiction', 'verification_task', 'restriction', name='proposal_type_enum'), nullable=False),
    sa.Column('review_state', sa.Enum('proposed', 'accepted', 'accepted_with_edits', 'rejected', 'deferred', 'uncertain', 'superseded', 'disputed', name='review_state_enum'), server_default='proposed', nullable=False),
    sa.Column('title', sa.String(length=255), nullable=True),
    sa.Column('proposed_text', sa.Text(), nullable=True),
    sa.Column('proposed_structured_json', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    sa.Column('source_id', sa.Uuid(), nullable=True),
    sa.Column('excerpt_id', sa.Uuid(), nullable=True),
    sa.Column('confidence_score', sa.Numeric(precision=5, scale=4), nullable=True),
    sa.Column('created_by_system', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('created_by_user_id', sa.Uuid(), nullable=True),
    sa.Column('reviewed_by_user_id', sa.Uuid(), nullable=True),
    sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('review_notes', sa.Text(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['matter_id'], ['matters.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['excerpt_id'], ['source_excerpts.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['source_id'], ['sources.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['reviewed_by_user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_proposals__matter__review_state', 'proposals', ['matter_id', 'review_state'], unique=False)
    op.create_index('ix_proposals__source_id', 'proposals', ['source_id'], unique=False)
    op.create_index('ix_proposals__type__review_state', 'proposals', ['proposal_type', 'review_state'], unique=False)
    op.create_table('fact_assertions',
    sa.Column('workspace_id', sa.Uuid(), nullable=False),
    sa.Column('matter_id', sa.Uuid(), nullable=False),
    sa.Column('short_label', sa.String(length=255), nullable=True),
    sa.Column('statement_text', sa.Text(), nullable=False),
    sa.Column('review_state', sa.Enum('proposed', 'accepted', 'accepted_with_edits', 'rejected', 'deferred', 'uncertain', 'superseded', 'disputed', name='review_state_enum'), server_default='proposed', nullable=False),
    sa.Column('confidence_level', sa.Enum('low', 'medium', 'high', name='strength_label_enum'), nullable=True),
    sa.Column('fact_type', sa.Enum('source_derived', 'user_entered', 'testimony', 'procedural', 'damage', 'other', name='fact_type_enum'), server_default='source_derived', nullable=False),
    sa.Column('is_material', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('created_from_proposal_id', sa.Uuid(), nullable=True),
    sa.Column('created_by_user_id', sa.Uuid(), nullable=True),
    sa.Column('approved_by_user_id', sa.Uuid(), nullable=True),
    sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('supersedes_fact_id', sa.Uuid(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_from_proposal_id'], ['proposals.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['matter_id'], ['matters.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['supersedes_fact_id'], ['fact_assertions.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['approved_by_user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_fact_assertions__matter__review_state', 'fact_assertions', ['matter_id', 'review_state'], unique=False)
    op.create_index('ix_fact_assertions__workspace__is_material', 'fact_assertions', ['workspace_id', 'is_material'], unique=False)
    # NULLS NOT DISTINCT (Postgres 15+; compose targets postgres:16): a NULL
    # excerpt_id is treated as a value, so two excerpt-less links for the
    # same fact/source/support type cannot duplicate.
    op.create_table('fact_source_links',
    sa.Column('fact_id', sa.Uuid(), nullable=False),
    sa.Column('source_id', sa.Uuid(), nullable=False),
    sa.Column('excerpt_id', sa.Uuid(), nullable=True),
    sa.Column('support_type', sa.Enum('supports', 'contradicts', 'mentions', 'background', name='support_type_enum'), server_default='supports', nullable=False),
    sa.Column('strength', sa.Enum('low', 'medium', 'high', name='strength_label_enum'), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['excerpt_id'], ['source_excerpts.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['fact_id'], ['fact_assertions.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['source_id'], ['sources.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('fact_id', 'source_id', 'excerpt_id', 'support_type', name='uq_fact_source_links__fact__source__excerpt__support', postgresql_nulls_not_distinct=True)
    )
    # Same NULLS NOT DISTINCT treatment for role-less fact/actor links.
    op.create_table('fact_actor_links',
    sa.Column('fact_id', sa.Uuid(), nullable=False),
    sa.Column('actor_id', sa.Uuid(), nullable=False),
    sa.Column('role_in_fact', sa.String(length=64), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['actors.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['fact_id'], ['fact_assertions.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('fact_id', 'actor_id', 'role_in_fact', name='uq_fact_actor_links__fact__actor__role', postgresql_nulls_not_distinct=True)
    )


def downgrade() -> None:
    op.drop_table('fact_actor_links')
    op.drop_table('fact_source_links')
    op.drop_index('ix_fact_assertions__workspace__is_material', table_name='fact_assertions')
    op.drop_index('ix_fact_assertions__matter__review_state', table_name='fact_assertions')
    op.drop_table('fact_assertions')
    op.drop_index('ix_proposals__type__review_state', table_name='proposals')
    op.drop_index('ix_proposals__source_id', table_name='proposals')
    op.drop_index('ix_proposals__matter__review_state', table_name='proposals')
    op.drop_table('proposals')
    op.drop_index('ix_ledger_entries__workspace__source_status', table_name='ledger_entries')
    op.drop_index('ix_ledger_entries__matter__date_start', table_name='ledger_entries')
    op.drop_index('uq_ledger_entries__matter__external_id', table_name='ledger_entries')
    op.drop_table('ledger_entries')
    # native PG enum types survive DROP TABLE; drop the five created here
    # explicitly so downgrade -> re-upgrade works on the same database.
    # NOTE: source_status_enum belongs to 0003 and must NOT be dropped here.
    sa.Enum(name='proposal_type_enum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='review_state_enum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='fact_type_enum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='support_type_enum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='strength_label_enum').drop(op.get_bind(), checkfirst=True)
