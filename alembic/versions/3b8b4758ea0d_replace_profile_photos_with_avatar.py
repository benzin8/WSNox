"""replace profile_photos with avatar

Revision ID: 3b8b4758ea0d
Revises: a5c2d8e31f47
Create Date: 2026-05-30 03:56:57.695771

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '3b8b4758ea0d'
down_revision: Union[str, Sequence[str], None] = 'a5c2d8e31f47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("profiles", "profile_photos")
    op.add_column(
        "profiles",
        sa.Column("avatar", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("profiles", "avatar")
    op.add_column(
        "profiles",
        sa.Column(
            "profile_photos",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )
