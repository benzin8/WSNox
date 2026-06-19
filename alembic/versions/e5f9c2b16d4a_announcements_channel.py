"""create official WSNox announcements channel + backfill all users as members

Revision ID: e5f9c2b16d4a
Revises: d4e8b1a05c39
Create Date: 2026-06-20 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "e5f9c2b16d4a"
down_revision: Union[str, Sequence[str], None] = "d4e8b1a05c39"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create the singleton channel only if one doesn't already exist.
    op.execute(
        """
        INSERT INTO chats (chat_type, name, created_at, updated_at)
        SELECT 'channel', 'WSNox', now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM chats WHERE chat_type = 'channel')
        """
    )
    # Backfill: every existing user becomes a member of the channel.
    op.execute(
        """
        INSERT INTO chat_members (chat_id, user_id, role, joined_at)
        SELECT c.id, u.id, 'member', now()
        FROM users u
        CROSS JOIN (SELECT id FROM chats WHERE chat_type = 'channel' ORDER BY id ASC LIMIT 1) c
        WHERE NOT EXISTS (
            SELECT 1 FROM chat_members cm
            WHERE cm.chat_id = c.id AND cm.user_id = u.id
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM chat_members
        WHERE chat_id IN (SELECT id FROM chats WHERE chat_type = 'channel')
        """
    )
    op.execute("DELETE FROM chats WHERE chat_type = 'channel'")
