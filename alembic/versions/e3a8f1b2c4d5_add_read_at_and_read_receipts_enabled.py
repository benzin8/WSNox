"""add read_at to messages and read_receipts_enabled to profiles

Revision ID: e3a8f1b2c4d5
Revises: d1f7a92e44b1
Create Date: 2026-05-24 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e3a8f1b2c4d5"
down_revision: Union[str, None] = "d1f7a92e44b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "message",
        sa.Column("read_at", sa.DateTime(), nullable=True),
    )

    op.add_column(
        "profiles",
        sa.Column(
            "read_receipts_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("profiles", "read_receipts_enabled")
    op.drop_column("message", "read_at")
