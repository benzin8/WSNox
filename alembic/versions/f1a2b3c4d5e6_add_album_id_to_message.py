"""add album_id to message

Revision ID: f1a2b3c4d5e6
Revises: e1f7a93c4d28
Create Date: 2026-06-21
"""
import sqlalchemy as sa

from alembic import op

revision = "f1a2b3c4d5e6"
down_revision = "e1f7a93c4d28"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("message", sa.Column("album_id", sa.String(length=32), nullable=True))
    op.create_index("ix_message_album_id", "message", ["album_id"])


def downgrade() -> None:
    op.drop_index("ix_message_album_id", table_name="message")
    op.drop_column("message", "album_id")
