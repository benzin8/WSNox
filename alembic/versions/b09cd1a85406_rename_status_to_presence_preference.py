"""rename status to presence_preference

Revision ID: b09cd1a85406
Revises: 15a243b7c7f7
Create Date: 2026-05-20 00:14:03.154745

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = "b09cd1a85406"
down_revision = "15a243b7c7f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add new column with new type
    op.add_column(
        "profiles",
        sa.Column("presence_preference", sa.String(length=20), nullable=True),
    )

    # 2. Convert existing status values
    op.execute(
        """
        UPDATE profiles
        SET presence_preference = CASE
            WHEN status = 'Не беспокоить' THEN 'dnd'
            ELSE NULL
        END
        """
    )

    # 3. Drop the old column
    op.drop_column("profiles", "status")


def downgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column("status", sa.String(length=50), nullable=False, server_default="Offline"),
    )
    op.execute(
        """
        UPDATE profiles
        SET status = CASE
            WHEN presence_preference = 'dnd' THEN 'Не беспокоить'
            ELSE 'Offline'
        END
        """
    )
    op.drop_column("profiles", "presence_preference")
