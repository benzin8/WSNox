"""add message_reactions table

Revision ID: a7d3f1c92b64
Revises: f6a1d3e72b58
Create Date: 2026-06-20 14:20:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7d3f1c92b64"
down_revision: Union[str, None] = "f6a1d3e72b58"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "message_reactions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("reaction_type", sa.String(length=8), nullable=False),
        sa.Column("emoji", sa.String(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["message_id"], ["message.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "message_id", "user_id", "reaction_type", name="uq_reaction_per_user_type"
        ),
    )
    op.create_index(
        op.f("ix_message_reactions_message_id"), "message_reactions", ["message_id"]
    )
    op.create_index(
        op.f("ix_message_reactions_user_id"), "message_reactions", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_message_reactions_user_id"), table_name="message_reactions")
    op.drop_index(op.f("ix_message_reactions_message_id"), table_name="message_reactions")
    op.drop_table("message_reactions")
