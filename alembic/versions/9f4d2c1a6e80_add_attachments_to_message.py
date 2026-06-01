"""add attachments to message

Revision ID: 9f4d2c1a6e80
Revises: 7a8c9085680b
Create Date: 2026-06-01 09:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = '9f4d2c1a6e80'
down_revision: Union[str, Sequence[str], None] = '7a8c9085680b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'message',
        sa.Column('attachment_key', sa.String(length=512), nullable=True),
    )
    op.add_column(
        'message',
        sa.Column('attachment_thumb_key', sa.String(length=512), nullable=True),
    )
    op.add_column(
        'message',
        sa.Column('attachment_meta', JSONB, nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('message', 'attachment_meta')
    op.drop_column('message', 'attachment_thumb_key')
    op.drop_column('message', 'attachment_key')
