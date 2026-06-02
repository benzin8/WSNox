"""group chats: recipient_id nullable + message_read table

Revision ID: a1c4f7d92e58
Revises: 9f4d2c1a6e80
Create Date: 2026-06-02 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1c4f7d92e58'
down_revision: Union[str, Sequence[str], None] = '9f4d2c1a6e80'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Private chats keep recipient_id; group chats store NULL because
    # there is no single recipient — fanout happens via chat_members.
    op.alter_column('message', 'recipient_id', nullable=True)

    op.create_table(
        'message_read',
        sa.Column('message_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('read_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['message_id'], ['message.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('message_id', 'user_id'),
    )
    op.create_index('ix_message_read_user_id', 'message_read', ['user_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_message_read_user_id', table_name='message_read')
    op.drop_table('message_read')
    op.alter_column('message', 'recipient_id', nullable=False)
