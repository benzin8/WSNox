"""add chat_mutes table and notification_dnd column

Revision ID: d1f7a92e44b1
Revises: c1a3f5d72e01
Create Date: 2026-05-24 11:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d1f7a92e44b1"
down_revision: Union[str, None] = "c1a3f5d72e01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chat_mutes",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("chat_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chat_id"], ["chats.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "chat_id"),
    )
    op.create_index(
        op.f("ix_chat_mutes_user_id"), "chat_mutes", ["user_id"]
    )

    op.add_column(
        "profiles",
        sa.Column(
            "notification_dnd",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("profiles", "notification_dnd")
    op.drop_index(op.f("ix_chat_mutes_user_id"), table_name="chat_mutes")
    op.drop_table("chat_mutes")
