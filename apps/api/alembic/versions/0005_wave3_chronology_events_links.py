"""wave3 chronology: events event_fact_links event_actor_links

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-03

WS-CHRONO (Wave 3) — implements Schema Draft §6.6 (`events`,
`event_fact_links`, `event_actor_links`), §5.14 (`date_precision_enum`),
and Tech Spec Group G. Migration 0005 is reserved for the events schema
in handoff/PARALLEL_PLAN.md §4b.

Scope note: Schema Draft §6.6 also lists `event_tags`; the 0005
reservation covers the three tables above only, so event_tags is
deferred to a later migration (recorded in handoff/notes/WS-CHRONO.md).

review_state_enum and strength_label_enum were created by 0004 and are
referenced here with create_type=False (same pattern 0004 uses for
0003's source_status_enum). date_precision_enum is new in this
migration and is dropped again in downgrade() so
downgrade -> re-upgrade works on the same database.
"""
import sqlalchemy as sa

from alembic import op

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('events',
    sa.Column('workspace_id', sa.Uuid(), nullable=False),
    sa.Column('matter_id', sa.Uuid(), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('date_start', sa.Date(), nullable=True),
    sa.Column('date_end', sa.Date(), nullable=True),
    sa.Column('date_precision', sa.Enum('exact', 'range', 'approximate', 'unknown', name='date_precision_enum'), server_default='unknown', nullable=False),
    sa.Column('date_text_raw', sa.Text(), nullable=True),
    sa.Column('significance_level', sa.String(length=32), nullable=True),
    sa.Column('review_state', sa.Enum('proposed', 'accepted', 'accepted_with_edits', 'rejected', 'deferred', 'uncertain', 'superseded', 'disputed', name='review_state_enum', create_type=False), server_default='accepted', nullable=False),
    sa.Column('confidence_level', sa.Enum('low', 'medium', 'high', name='strength_label_enum', create_type=False), nullable=True),
    sa.Column('created_from_proposal_id', sa.Uuid(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_from_proposal_id'], ['proposals.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['matter_id'], ['matters.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_events__matter__date_start', 'events', ['matter_id', 'date_start'], unique=False)
    op.create_index('ix_events__matter__review_state', 'events', ['matter_id', 'review_state'], unique=False)
    # Full-text index (Schema Draft §6.6) as a GIN expression index; matches
    # the functional index declared on the Event model so `alembic check`-style
    # comparisons and Base.metadata.create_all agree with the migration.
    op.create_index(
        'ix_events__fulltext', 'events',
        [sa.text("to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))")],
        unique=False, postgresql_using='gin',
    )
    op.create_table('event_fact_links',
    sa.Column('event_id', sa.Uuid(), nullable=False),
    sa.Column('fact_id', sa.Uuid(), nullable=False),
    sa.Column('relationship_type', sa.String(length=32), server_default='supports_event', nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['fact_id'], ['fact_assertions.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('event_id', 'fact_id', 'relationship_type', name='uq_event_fact_links__event__fact__relationship')
    )
    # NULLS NOT DISTINCT (Postgres 15+; compose targets postgres:16): two
    # role-less links for the same event/actor cannot be duplicated (NULL
    # role_in_event treated as a value, same pattern as fact_actor_links).
    op.create_table('event_actor_links',
    sa.Column('event_id', sa.Uuid(), nullable=False),
    sa.Column('actor_id', sa.Uuid(), nullable=False),
    sa.Column('role_in_event', sa.String(length=64), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['actors.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('event_id', 'actor_id', 'role_in_event', name='uq_event_actor_links__event__actor__role', postgresql_nulls_not_distinct=True)
    )


def downgrade() -> None:
    op.drop_table('event_actor_links')
    op.drop_table('event_fact_links')
    op.drop_index('ix_events__fulltext', table_name='events')
    op.drop_index('ix_events__matter__review_state', table_name='events')
    op.drop_index('ix_events__matter__date_start', table_name='events')
    op.drop_table('events')
    # date_precision_enum is the only native PG enum created here;
    # review_state_enum and strength_label_enum belong to 0004 and must
    # NOT be dropped (same rule 0004 documents 