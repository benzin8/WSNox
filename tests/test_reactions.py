"""Reaction validation + aggregation (pure logic, no DB).

The DB-mutating `toggle` / `summary_for_messages` go through SQLAlchemy and are
exercised end-to-end via the WS layer in integration; here we lock the pure
parts: which reactions are accepted and how rows reduce to a per-message
summary (counts + the viewer's own reaction).
"""
from types import SimpleNamespace

from messenger.backend.app.crud.reaction import ALLOWED_REACTION_EMOJI, ReactionCRUD


def _row(message_id, user_id, reaction_type, emoji=None):
    return SimpleNamespace(
        message_id=message_id, user_id=user_id, reaction_type=reaction_type, emoji=emoji
    )


def test_is_valid_emoji_in_set():
    for e in ALLOWED_REACTION_EMOJI:
        assert ReactionCRUD.is_valid("emoji", e) is True


def test_is_valid_emoji_not_in_set():
    assert ReactionCRUD.is_valid("emoji", "🦄") is False
    assert ReactionCRUD.is_valid("emoji", None) is False


def test_is_valid_aura_ignores_emoji():
    assert ReactionCRUD.is_valid("aura", None) is True
    assert ReactionCRUD.is_valid("aura", "x") is True


def test_is_valid_unknown_type():
    assert ReactionCRUD.is_valid("bogus", "👍") is False


def test_aggregate_counts_and_viewer_state():
    rows = [
        _row(1, 10, "emoji", "👍"),
        _row(1, 11, "emoji", "👍"),
        _row(1, 12, "emoji", "🔥"),
        _row(1, 10, "aura"),
        _row(1, 13, "aura"),
        _row(2, 11, "emoji", "😂"),
    ]
    summary = ReactionCRUD._aggregate(rows, [1, 2, 3], viewer_id=10)

    assert summary[1]["emoji"] == {"👍": 2, "🔥": 1}
    assert summary[1]["aura"] == 2
    assert summary[1]["my_emoji"] == "👍"  # viewer 10 reacted 👍
    assert summary[1]["my_aura"] is True   # viewer 10 boosted aura

    assert summary[2]["emoji"] == {"😂": 1}
    assert summary[2]["my_emoji"] is None  # viewer 10 didn't react here
    assert summary[2]["my_aura"] is False

    assert summary[3] == {"emoji": {}, "aura": 0, "my_emoji": None, "my_aura": False}


def test_aggregate_empty():
    assert ReactionCRUD._aggregate([], [], viewer_id=1) == {}
