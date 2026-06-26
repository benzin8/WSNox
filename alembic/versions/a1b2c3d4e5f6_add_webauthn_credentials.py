"""add webauthn_credentials

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-06-26
"""
import sqlalchemy as sa

from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "webauthn_credentials",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("credential_id", sa.Text(), nullable=False),
        sa.Column("public_key", sa.Text(), nullable=False),
        sa.Column("sign_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("transports", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_webauthn_credentials_user_id", "webauthn_credentials", ["user_id"]
    )
    op.create_unique_constraint(
        "uq_webauthn_credentials_credential_id",
        "webauthn_credentials",
        ["credential_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_webauthn_credentials_credential_id",
        "webauthn_credentials",
        type_="unique",
    )
    op.drop_index("ix_webauthn_credentials_user_id", table_name="webauthn_credentials")
    op.drop_table("webauthn_credentials")
