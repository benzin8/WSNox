"""Tests for one-time (ephemeral) chats.

Exercises the full path: module function -> Redis pub/sub -> per-worker
`ephemeral_listener` -> delivery to the right sockets, using fakeredis and a
fake connection manager. Also asserts that nothing leaks (sessions cleaned up,
messages never persisted — there is no DB call anywhere in this module).
"""
import asyncio

import pytest
import pytest_asyncio

from messenger.backend.app.ws import ephemeral
from messenger.backend.core import redis as redis_module


class FakeWS:
    def __init__(self):
        self.sent = []

    async def send_json(self, payload):
        self.sent.append(payload)

    def types(self):
        return [m.get("type") for m in self.sent]

    def of(self, t):
        return [m for m in self.sent if m.get("type") == t]


class FakeManager:
    def __init__(self):
        self.active_connections = {}

    def add(self, uid, ws):
        self.active_connections.setdefault(uid, set()).add(ws)


async def _drain(seconds=0.15):
    await asyncio.sleep(seconds)


@pytest_asyncio.fixture
async def env(monkeypatch, fake_redis):
    monkeypatch.setattr(redis_module, "redis_client", fake_redis)
    manager = FakeManager()
    task = asyncio.create_task(ephemeral.ephemeral_listener(manager))
    await _drain(0.1)  # let the listener subscribe
    try:
        yield manager, fake_redis
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


async def test_full_invite_accept_message_flow(env):
    manager, _ = env
    A, B = 1, 2
    wsA, wsB = FakeWS(), FakeWS()
    manager.add(A, wsA)
    manager.add(B, wsB)

    eph_id = await ephemeral.create_invite(A, B, inviter_name="Alice")
    await _drain()
    assert wsB.of("eph_invited") and wsB.of("eph_invited")[0]["from_id"] == A
    assert wsB.of("eph_invited")[0]["from_name"] == "Alice"
    assert wsA.of("eph_invite_sent")

    accepted = await ephemeral.accept_invite(
        eph_id, B, {A: {"name": "Alice"}, B: {"name": "Bob"}}
    )
    assert accepted
    await _drain()
    assert wsA.of("eph_started") and wsB.of("eph_started")
    started = wsB.of("eph_started")[0]
    assert started["participants"][str(A)]["name"] == "Alice"
    assert started["participants"][str(B)]["name"] == "Bob"

    # A -> B message: peer receives it, sender does not echo
    ok = await ephemeral.relay_message(eph_id, A, "secret", temp_id="t1")
    assert ok
    await _drain()
    assert wsB.of("eph_msg") and wsB.of("eph_msg")[-1]["text"] == "secret"
    assert wsB.of("eph_msg")[-1]["sender_id"] == A
    assert not wsA.of("eph_msg")


async def test_relay_rejected_before_accept(env):
    manager, _ = env
    A, B = 10, 20
    wsB = FakeWS()
    manager.add(B, wsB)
    eph_id = await ephemeral.create_invite(A, B)
    await _drain()
    # still pending -> relay must be refused, nothing delivered
    ok = await ephemeral.relay_message(eph_id, A, "too early")
    assert ok is False
    await _drain()
    assert not wsB.of("eph_msg")


async def test_relay_rejected_for_non_participant(env):
    manager, _ = env
    A, B, C = 1, 2, 3
    eph_id = await ephemeral.create_invite(A, B)
    await ephemeral.accept_invite(eph_id, B, {A: {}, B: {}})
    ok = await ephemeral.relay_message(eph_id, C, "intruder")
    assert ok is False


async def test_leave_destroys_for_both(env):
    manager, fake_redis = env
    A, B = 4, 5
    wsA, wsB = FakeWS(), FakeWS()
    manager.add(A, wsA)
    manager.add(B, wsB)
    eph_id = await ephemeral.create_invite(A, B)
    await ephemeral.accept_invite(eph_id, B, {A: {}, B: {}})
    await _drain()

    await ephemeral.leave(eph_id, A)
    await _drain()
    assert wsA.of("eph_destroyed") and wsB.of("eph_destroyed")
    assert wsB.of("eph_destroyed")[-1]["reason"] == "left"
    # session gone -> further relay refused
    assert await ephemeral.relay_message(eph_id, B, "after death") is False
    assert await fake_redis.exists(ephemeral._sess_key(eph_id)) == 0


async def test_decline_notifies_inviter(env):
    manager, fake_redis = env
    A, B = 6, 7
    wsA = FakeWS()
    manager.add(A, wsA)
    eph_id = await ephemeral.create_invite(A, B)
    await _drain()
    await ephemeral.decline_invite(eph_id, B)
    await _drain()
    assert wsA.of("eph_declined") and wsA.of("eph_declined")[-1]["by_id"] == B
    assert await fake_redis.exists(ephemeral._sess_key(eph_id)) == 0


async def test_on_user_gone_destroys_all_their_sessions(env):
    manager, fake_redis = env
    A, B = 8, 9
    wsB = FakeWS()
    manager.add(B, wsB)
    eph_id = await ephemeral.create_invite(A, B)
    await ephemeral.accept_invite(eph_id, B, {A: {}, B: {}})
    await _drain()

    await ephemeral.on_user_gone(A)
    await _drain()
    assert wsB.of("eph_destroyed") and wsB.of("eph_destroyed")[-1]["reason"] == "disconnect"
    assert await fake_redis.exists(ephemeral._sess_key(eph_id)) == 0
    # reverse index for the gone user is cleared too
    assert await fake_redis.exists(ephemeral._user_key(A)) == 0


async def test_accept_only_by_invitee(env):
    manager, _ = env
    A, B = 11, 12
    eph_id = await ephemeral.create_invite(A, B)
    # inviter cannot accept their own invite
    assert await ephemeral.accept_invite(eph_id, A, {A: {}, B: {}}) is False
    # invitee can
    assert await ephemeral.accept_invite(eph_id, B, {A: {}, B: {}}) is True
