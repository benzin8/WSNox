"""add invite_token and description to chats (user channels)

Revision ID: b8e4c2a17d93
Revises: a7d3f1c92b64
Create Date: 2026-06-20 15:10:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8e4c2a17d93"
down_revision: Union[str, None] = "a7d3f1c92b64"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chats", sa.Column("invite_token", sa.String(length=32), nullable=True))
    op.add_column("chats", sa.Column("description", sa.String(length=300), nullable=True))
    op.create_unique_constraint("uq_chats_invite_token", "chats", ["invite_token"])


def downgrade() -> None:
    op.drop_constraint("uq_chats_invite_token", "chats", type_="unique")
    op.drop_column("chats", "description")
    op.drop_column("chats", "invite_token")
