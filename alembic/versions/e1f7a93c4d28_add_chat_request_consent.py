"""add private-chat consent (is_request, initiator_id)

Revision ID: e1f7a93c4d28
Revises: d3a8f6c1b920
Create Date: 2026-06-21

"""
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "e1f7a93c4d28"
down_revision = "d3a8f6c1b920"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chats",
        sa.Column("is_request", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("chats", sa.Column("initiator_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("chats", "initiator_id")
    op.drop_column("chats", "is_request")
