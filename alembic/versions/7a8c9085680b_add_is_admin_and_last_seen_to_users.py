"""add is_admin and last_seen to users

Revision ID: 7a8c9085680b
Revises: 3b8b4758ea0d
Create Date: 2026-05-31 12:39:48.582528

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '7a8c9085680b'
down_revision: Union[str, Sequence[str], None] = '3b8b4758ea0d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'users',
        sa.Column('is_admin', sa.Boolean(), server_default='false', nullable=False),
    )
    op.add_column(
        'users',
        sa.Column('last_seen', sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        "CREATE INDEX idx_users_last_seen "
        "ON users (last_seen) "
        "WHERE last_seen IS NOT NULL"
    )
    # data migration: владелец становится админом
    op.execute(
        "UPDATE users SET is_admin = true WHERE email = 'visdima0102@gmail.com'"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP INDEX IF EXISTS idx_users_last_seen")
    op.drop_column('users', 'last_seen')
    op.drop_column('users', 'is_admin')
