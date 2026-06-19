"""add users.role for RBAC (backfill from is_admin; founder -> owner)

Revision ID: d4e8b1a05c39
Revises: c7e1a9d04b2f
Create Date: 2026-06-20 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d4e8b1a05c39"
down_revision: Union[str, Sequence[str], None] = "c7e1a9d04b2f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("role", sa.String(length=20), nullable=False, server_default="user"),
    )
    # Backfill: existing admins keep dashboard/management access as 'admin'.
    op.execute("UPDATE users SET role = 'admin' WHERE is_admin = true")
    # The founder becomes the single 'owner' (and stays admin).
    op.execute(
        "UPDATE users SET role = 'owner', is_admin = true "
        "WHERE email = 'visdima0102@gmail.com'"
    )


def downgrade() -> None:
    op.drop_column("users", "role")
