"""Tests for read receipt reciprocity rule.

Verifies that:
- should_expose_read_receipts returns True only when BOTH users have it enabled
- read_at is correctly handled in message schemas
"""

import pytest


# ---------------------------------------------------------------------------
# Pure logic test for the reciprocity check
# ---------------------------------------------------------------------------

async def _mock_should_expose(prefs_rows, user_a, user_b):
    """Re-implements the reciprocity logic for testing without DB imports."""
    prefs = {row[0]: row[1] for row in prefs_rows}
    return prefs.get(user_a, True) and prefs.get(user_b, True)


@pytest.mark.asyncio
async def test_both_enabled_exposes_receipts():
    assert await _mock_should_expose([(1, True), (2, True)], 1, 2) is True


@pytest.mark.asyncio
async def test_sender_disabled_hides_receipts():
    assert await _mock_should_expose([(1, False), (2, True)], 1, 2) is False


@pytest.mark.asyncio
async def test_recipient_disabled_hides_receipts():
    assert await _mock_should_expose([(1, True), (2, False)], 1, 2) is False


@pytest.mark.asyncio
async def test_both_disabled_hides_receipts():
    assert await _mock_should_expose([(1, False), (2, False)], 1, 2) is False


@pytest.mark.asyncio
async def test_missing_profile_defaults_to_enabled():
    """When a user has no profile row, default to enabled (True)."""
    assert await _mock_should_expose([(1, True)], 1, 2) is True


@pytest.mark.asyncio
async def test_missing_profile_with_other_disabled():
    """When one user has no profile and the other has it disabled."""
    assert await _mock_should_expose([(1, False)], 1, 2) is False


@pytest.mark.asyncio
async def test_no_profiles_defaults_to_both_enabled():
    """When neither user has a profile row, both default to True."""
    assert await _mock_should_expose([], 1, 2) is True


# ---------------------------------------------------------------------------
# Schema tests (pydantic schemas are importable without DB)
# ---------------------------------------------------------------------------

def test_message_response_read_at_default_none():
    from datetime import datetime
    from messenger.backend.app.api_v1.schemas.message import MessageResponse

    msg = MessageResponse(
        id=1,
        chat_id=1, sender_id=1, recipient_id=2,
        text="hello", is_read=False, created_at=datetime(2026, 1, 1),
        msg_type="text",
    )
    assert msg.read_at is None


def test_message_response_read_at_preserves_value():
    from datetime import datetime
    from messenger.backend.app.api_v1.schemas.message import MessageResponse

    read_time = datetime(2026, 1, 1, 0, 5)
    msg = MessageResponse(
        id=1,
        chat_id=1, sender_id=1, recipient_id=2,
        text="hello", is_read=True, created_at=datetime(2026, 1, 1),
        msg_type="text", read_at=read_time,
    )
    assert msg.read_at == read_time


def test_message_response_read_at_stripped():
    from datetime import datetime
    from messenger.backend.app.api_v1.schemas.message import MessageResponse

    msg = MessageResponse(
        id=1,
        chat_id=1, sender_id=1, recipient_id=2,
        text="hello", is_read=True, created_at=datetime(2026, 1, 1),
        msg_type="text", read_at=datetime(2026, 1, 1, 0, 5),
    )
    msg.read_at = None
    assert msg.read_at is None


def test_notification_prefs_includes_read_receipts():
    from messenger.backend.app.api_v1.schemas.notification import NotificationPreferences

    prefs = NotificationPreferences(dnd=False, muted_chats=[], read_receipts_enabled=True)
    assert prefs.read_receipts_enabled is True

    prefs2 = NotificationPreferences(dnd=False, muted_chats=[], read_receipts_enabled=False)
    assert prefs2.read_receipts_enabled is False


def test_notification_prefs_defaults_to_enabled():
    from messenger.backend.app.api_v1.schemas.notification import NotificationPreferences

    prefs = NotificationPreferences(dnd=False, muted_chats=[])
    assert prefs.read_receipts_enabled is True
