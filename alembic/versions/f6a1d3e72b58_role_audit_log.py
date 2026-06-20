"""create role_audit_log table (privacy-safe RBAC audit trail)

Revision ID: f6a1d3e72b58
Revises: e5f9c2b16d4a
Create Date: 2026-06-20 02:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f6a1d3e72b58"
down_revision: Union[str, Sequence[str], None] = "e5f9c2b16d4a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "role_audit_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("actor_email", sa.String(length=255), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("target_email", sa.String(length=255), nullable=False),
        sa.Column("old_role", sa.String(length=20), nullable=False),
        sa.Column("new_role", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_role_audit_log_actor_id", "role_audit_log", ["actor_id"])
    op.create_index("ix_role_audit_log_target_id", "role_audit_log", ["target_id"])
    op.create_index("ix_role_audit_log_created_at", "role_audit_log", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_role_audit_log_created_at", table_name="role_audit_log")
    op.drop_index("ix_role_audit_log_target_id", table_name="role_audit_log")
    op.drop_index("ix_role_audit_log_actor_id", table_name="role_audit_log")
    op.drop_table("role_audit_log")
