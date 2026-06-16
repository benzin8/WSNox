"""add cache-support indexes (unread partial, users.created_at, users.last_seen)

Revision ID: c7e1a9d04b2f
Revises: a1c4f7d92e58
Create Date: 2026-06-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c7e1a9d04b2f"
down_revision: Union[str, Sequence[str], None] = "a1c4f7d92e58"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Частичный индекс: непрочитанные сообщения по получателю. Покрывает
    # unread-агрегаты (per-chat и сумму) без full-scan по message.
    op.create_index(
        "ix_message_unread_recipient",
        "message",
        ["recipient_id"],
        unique=False,
        postgresql_where="is_read = false",
    )
    # Админ-серии регистраций по дате.
    op.create_index(
        "ix_users_created_at",
        "users",
        ["created_at"],
        unique=False,
    )
    # Сортировки/фильтры presence по last_seen.
    op.create_index(
        "ix_users_last_seen",
        "users",
        ["last_seen"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_users_last_seen", table_name="users")
    op.drop_index("ix_users_created_at", table_name="users")
    op.drop_index("ix_message_unread_recipient", table_name="message")
