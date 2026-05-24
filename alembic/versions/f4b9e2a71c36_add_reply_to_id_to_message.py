"""add reply_to_id to message

Revision ID: f4b9e2a71c36
Revises: e3a8f1b2c4d5
Create Date: 2026-05-24 22:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f4b9e2a71c36"
down_revision: Union[str, None] = "e3a8f1b2c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "message",
        sa.Column("reply_to_id", sa.Integer(), sa.ForeignKey("message.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("message", "reply_to_id")
