"""add user ban fields (is_banned, banned_at, ban_reason)

Revision ID: c7b1e9a4f206
Revises: b8e4c2a17d93
Create Date: 2026-06-21

"""
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "c7b1e9a4f206"
down_revision = "b8e4c2a17d93"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_banned", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("users", sa.Column("banned_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("ban_reason", sa.String(length=300), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "ban_reason")
    op.drop_column("users", "banned_at")
    op.drop_column("users", "is_banned")
