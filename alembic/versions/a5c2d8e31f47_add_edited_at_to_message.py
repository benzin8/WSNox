"""add edited_at to message

Revision ID: a5c2d8e31f47
Revises: f4b9e2a71c36
Create Date: 2026-05-26 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a5c2d8e31f47"
down_revision: Union[str, None] = "f4b9e2a71c36"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "message",
        sa.Column("edited_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("message", "edited_at")
