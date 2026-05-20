# Real-time Online Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual `profiles.status` string with real-time online/offline derived from active WebSocket presence (heartbeat + Redis TTL), keeping only `dnd` / `invisible` as manual user preferences.

**Architecture:** Source of truth = Redis key `presence:{user_id}` with 60s TTL, kept alive by 30s client heartbeat. WS connect/disconnect and ping handlers manipulate the key; broadcasts go through a new `presence_events` Redis pub/sub channel; a background sweeper notices TTL expiry and broadcasts offline. Frontend subscribes via WS and uses `Set<number>` of online user IDs.

**Tech Stack:** FastAPI WebSockets, Redis (`redis.asyncio`), SQLAlchemy async, Alembic, React + Vite + axios, Tailwind, fakeredis (new dev dep for tests).

**Spec:** `docs/superpowers/specs/2026-05-19-realtime-online-status-design.md`

---

## File Structure

### New files

- `src/messenger/backend/app/ws/presence.py` — pure presence operations (set/clear/check), broadcast helper, pub/sub listener, sweeper. Takes `redis` and `manager` as args; no global state of its own.
- `tests/conftest.py` — fakeredis fixture, monkeypatch helper for `get_redis`.
- `tests/test_presence.py` — unit tests for presence operations with fakeredis.
- `tests/test_profile_presence.py` — integration tests for `/profiles` and `/chats/presence` endpoints.
- `src/messenger/frontend_react/src/hooks/usePresence.js` — heartbeat, Page Visibility, snapshot fetch, applying presence events.
- `alembic/versions/<rev>_presence_preference.py` — rename + value conversion migration.

### Modified files

- `src/messenger/backend/models/profile.py` — rename field, change type, default None.
- `src/messenger/backend/app/api_v1/schemas/user.py` — `UserProfileResponse` gets `online: bool` + `presence_preference: Literal[...] | None`, drops `status`. `ProfileUpdate` accepts new constrained field.
- `src/messenger/backend/app/crud/chat.py` — add `get_chat_partners`.
- `src/messenger/backend/app/crud/profile.py` — `create_default_profile` no longer sets old status.
- `src/messenger/backend/app/api_v1/routers/profile_router.py` — compute `online`, mask invisible for others.
- `src/messenger/backend/app/api_v1/routers/chat_router.py` — add `GET /chats/presence`.
- `src/messenger/backend/app/ws/router.py` — `Dict[int, Set[WebSocket]]`, `ping` handler, call presence ops on connect/disconnect.
- `src/messenger/backend/app/main.py` — start presence listener + sweeper in lifespan.
- `pyproject.toml` — add `fakeredis` to dev deps.
- `src/messenger/frontend_react/src/hooks/useChatSocket.js` — `lastPresenceEvent`, reconnect with backoff.
- `src/messenger/frontend_react/src/pages/chat/ChatPage.jsx` — wire `usePresence`, pass `onlineUsers` down.
- `src/messenger/frontend_react/src/components/chat/ChatList.jsx` — conditional online dot.
- `src/messenger/frontend_react/src/components/chat/ChatWindow.jsx` — presence text + DND icon (accept `isPartnerOnline`).
- `src/messenger/frontend_react/src/components/profile/ProfileModal.jsx` — use `profile.online` + DND badge.
- `src/messenger/frontend_react/src/components/profile/EditProfileModal.jsx` — replace status select with presence preference.

---

## Phase 1 — Backend foundation

### Task 1: Add fakeredis dev dependency and test fixtures

**Files:**
- Modify: `pyproject.toml` (dev deps block)
- Create: `tests/conftest.py`

- [ ] **Step 1: Add fakeredis to `[tool.poetry.group.dev.dependencies]`**

In `pyproject.toml`, after `pytest-asyncio` line, add:

```toml
fakeredis = ">=2.21.0,<3.0.0"
```

- [ ] **Step 2: Install**

Run: `poetry install`
Expected: installs fakeredis successfully, no version conflicts.

- [ ] **Step 3: Create `tests/conftest.py`**

```python
import pytest_asyncio
from fakeredis import aioredis as fake_aioredis


@pytest_asyncio.fixture
async def fake_redis():
    """In-memory async Redis for unit tests."""
    client = fake_aioredis.FakeRedis(decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()
```

- [ ] **Step 4: Verify fixture is discoverable**

Add a smoke test inline (will be removed):

```python
# tests/conftest.py — temporary at bottom, remove after this step
```

Run: `poetry run pytest tests/ -v --collect-only`
Expected: existing tests collected, no errors about fakeredis.

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml poetry.lock tests/conftest.py
git commit -m "test: add fakeredis fixture for presence tests"
```

---

### Task 2: Alembic migration — rename status to presence_preference

**Files:**
- Create: `alembic/versions/<auto-rev>_presence_preference.py`

- [ ] **Step 1: Generate migration skeleton**

Run from project root: `poetry run alembic revision -m "rename status to presence_preference"`
Expected: creates a new file `alembic/versions/<random>_rename_status_to_presence_preference.py`.

- [ ] **Step 2: Write the migration body**

Replace the generated `upgrade()` and `downgrade()` with:

```python
"""rename status to presence_preference

Revision ID: <auto>
Revises: b0ba82281917
Create Date: ...
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = "<keep the auto value>"
down_revision = "b0ba82281917"
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
```

Note: replace `<keep the auto value>` with the actual revision id Alembic generated. Verify `down_revision = "b0ba82281917"` matches the latest existing migration (`b0ba82281917_add_updated_at_to_chats.py`).

- [ ] **Step 3: Apply migration locally**

Run: `docker compose up -d db && poetry run alembic upgrade head`
Expected: migration succeeds, `\d profiles` in psql shows `presence_preference VARCHAR(20)` and no `status` column.

- [ ] **Step 4: Verify downgrade works**

Run: `poetry run alembic downgrade -1 && poetry run alembic upgrade head`
Expected: both directions succeed.

- [ ] **Step 5: Commit**

```bash
git add alembic/versions/
git commit -m "db: migrate profiles.status to presence_preference"
```

---

### Task 3: Update Profile model

**Files:**
- Modify: `src/messenger/backend/models/profile.py`

- [ ] **Step 1: Replace the `status` field**

Replace the file contents with:

```python
from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from messenger.backend.db import Base
from messenger.backend.models.user import User


class Profile(Base):
    __tablename__ = "profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(100))
    bio: Mapped[str] = mapped_column(Text)
    presence_preference: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    profile_photos: Mapped[list] = mapped_column(JSON, default=list)

    user: Mapped["User"] = relationship(back_populates="profile")
```

- [ ] **Step 2: Update `create_default_profile` in `src/messenger/backend/app/crud/profile.py`**

In `ProfileCRUD.create_default_profile`, replace:

```python
        profile = Profile(
            user_id=user_id,
            display_name=display_name,
            bio="",
            status="Online",
            profile_photos=[],
        )
```

with:

```python
        profile = Profile(
            user_id=user_id,
            display_name=display_name,
            bio="",
            presence_preference=None,
            profile_photos=[],
        )
```

- [ ] **Step 3: Smoke check imports**

Run: `poetry run python -c "from messenger.backend.models.profile import Profile; print(Profile.__table__.columns.keys())"`
Expected: list includes `presence_preference`, does NOT include `status`.

- [ ] **Step 4: Commit**

```bash
git add src/messenger/backend/models/profile.py src/messenger/backend/app/crud/profile.py
git commit -m "model: rename Profile.status to presence_preference"
```

---

### Task 4: Update schemas (`UserProfileResponse`, `ProfileUpdate`)

**Files:**
- Modify: `src/messenger/backend/app/api_v1/schemas/user.py`

- [ ] **Step 1: Replace the relevant Pydantic classes**

In `src/messenger/backend/app/api_v1/schemas/user.py`, replace:

```python
class ProfileBase(BaseModel):
    display_name: Optional[str] = Field(None, max_length=32)
    bio: Optional[str] = Field(None, max_length=256)
    status: str = "Offline"
    profile_photos: List[str] = []

class ProfileRead(ProfileBase):
    model_config = ConfigDict(from_attributes=True)

class ProfileUpdate(ProfileBase):
    phone_number: Optional[str] = Field(None, max_length=20)
```

with:

```python
from typing import Literal

PresencePreference = Literal["dnd", "invisible"]


class ProfileBase(BaseModel):
    display_name: Optional[str] = Field(None, max_length=32)
    bio: Optional[str] = Field(None, max_length=256)
    presence_preference: Optional[PresencePreference] = None
    profile_photos: List[str] = []


class ProfileRead(ProfileBase):
    model_config = ConfigDict(from_attributes=True)


class ProfileUpdate(ProfileBase):
    phone_number: Optional[str] = Field(None, max_length=20)
```

And replace `UserProfileResponse` at the bottom of the file:

```python
class UserProfileResponse(BaseModel):
    user_id: int
    username: str
    name: str
    phone_number: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    presence_preference: Optional[PresencePreference] = None
    online: bool = False
    profile_photos: List[str] = []

    model_config = ConfigDict(from_attributes=True)
```

- [ ] **Step 2: Verify import works**

Run: `poetry run python -c "from messenger.backend.app.api_v1.schemas.user import UserProfileResponse, ProfileUpdate; print(UserProfileResponse.model_fields.keys())"`
Expected: includes `online`, `presence_preference`; does not include `status`.

- [ ] **Step 3: Validate Pydantic constraint**

Run: `poetry run python -c "from messenger.backend.app.api_v1.schemas.user import ProfileUpdate; ProfileUpdate(display_name='x', bio='y', presence_preference='xxx', profile_photos=[])"`
Expected: raises `ValidationError` because `'xxx'` is not in `{"dnd","invisible"}`.

Then run: `poetry run python -c "from messenger.backend.app.api_v1.schemas.user import ProfileUpdate; print(ProfileUpdate(display_name='x', bio='y', presence_preference='dnd', profile_photos=[]).presence_preference)"`
Expected: prints `dnd`.

- [ ] **Step 4: Commit**

```bash
git add src/messenger/backend/app/api_v1/schemas/user.py
git commit -m "schema: presence_preference + online on UserProfileResponse"
```

---

## Phase 2 — Presence core module

### Task 5: Create `presence.py` with pure operations + tests

**Files:**
- Create: `src/messenger/backend/app/ws/presence.py`
- Create: `tests/test_presence.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_presence.py`:

```python
import pytest

from messenger.backend.app.ws.presence import (
    PRESENCE_KEY_PREFIX,
    PRESENCE_TTL_SECONDS,
    clear_presence,
    is_present,
    is_visible_online,
    set_presence,
)


@pytest.mark.asyncio
async def test_set_presence_creates_key_and_signals_transition(fake_redis):
    transitioned = await set_presence(fake_redis, user_id=42)
    assert transitioned is True
    assert await fake_redis.exists(f"{PRESENCE_KEY_PREFIX}42") == 1
    ttl = await fake_redis.ttl(f"{PRESENCE_KEY_PREFIX}42")
    assert 0 < ttl <= PRESENCE_TTL_SECONDS


@pytest.mark.asyncio
async def test_set_presence_second_call_does_not_signal_transition(fake_redis):
    await set_presence(fake_redis, user_id=42)
    transitioned = await set_presence(fake_redis, user_id=42)
    assert transitioned is False


@pytest.mark.asyncio
async def test_clear_presence_deletes_key(fake_redis):
    await set_presence(fake_redis, user_id=42)
    await clear_presence(fake_redis, user_id=42)
    assert await fake_redis.exists(f"{PRESENCE_KEY_PREFIX}42") == 0


@pytest.mark.asyncio
async def test_is_present_reflects_key(fake_redis):
    assert await is_present(fake_redis, user_id=42) is False
    await set_presence(fake_redis, user_id=42)
    assert await is_present(fake_redis, user_id=42) is True


@pytest.mark.asyncio
async def test_invisible_returns_offline_to_others(fake_redis):
    await set_presence(fake_redis, user_id=42)
    online = await is_visible_online(
        redis=fake_redis, viewer_id=1, target_user_id=42, target_pref="invisible"
    )
    assert online is False


@pytest.mark.asyncio
async def test_invisible_returns_online_to_self(fake_redis):
    online = await is_visible_online(
        redis=fake_redis, viewer_id=42, target_user_id=42, target_pref="invisible"
    )
    assert online is True


@pytest.mark.asyncio
async def test_dnd_does_not_affect_online(fake_redis):
    await set_presence(fake_redis, user_id=42)
    online = await is_visible_online(
        redis=fake_redis, viewer_id=1, target_user_id=42, target_pref="dnd"
    )
    assert online is True


@pytest.mark.asyncio
async def test_no_preference_uses_redis_only(fake_redis):
    online = await is_visible_online(
        redis=fake_redis, viewer_id=1, target_user_id=42, target_pref=None
    )
    assert online is False
    await set_presence(fake_redis, user_id=42)
    online = await is_visible_online(
        redis=fake_redis, viewer_id=1, target_user_id=42, target_pref=None
    )
    assert online is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `poetry run pytest tests/test_presence.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'messenger.backend.app.ws.presence'`.

- [ ] **Step 3: Create `presence.py` minimal implementation**

Create `src/messenger/backend/app/ws/presence.py`:

```python
"""Real-time presence operations.

Source of truth: Redis key `presence:{user_id}` with TTL. Operations in this
module are pure with respect to the Redis client they receive — they accept
the client as an argument so tests can pass fakeredis without globals.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING

from messenger.backend.core.redis import get_redis

if TYPE_CHECKING:
    from redis.asyncio import Redis

    from messenger.backend.app.ws.router import ConnectionManager

logger = logging.getLogger(__name__)

PRESENCE_KEY_PREFIX = "presence:"
PRESENCE_TTL_SECONDS = 60
PRESENCE_EVENTS_CHANNEL = "presence_events"
SWEEPER_INTERVAL_SECONDS = 10


def _key(user_id: int) -> str:
    return f"{PRESENCE_KEY_PREFIX}{user_id}"


async def set_presence(redis: "Redis", user_id: int) -> bool:
    """Refresh presence TTL. Returns True iff the key did not exist before
    (signals an online state transition that callers should broadcast).
    """
    existed = await redis.exists(_key(user_id))
    await redis.setex(_key(user_id), PRESENCE_TTL_SECONDS, "1")
    return not existed


async def clear_presence(redis: "Redis", user_id: int) -> None:
    await redis.delete(_key(user_id))


async def is_present(redis: "Redis", user_id: int) -> bool:
    return bool(await redis.exists(_key(user_id)))


async def is_visible_online(
    redis: "Redis", viewer_id: int, target_user_id: int, target_pref: str | None
) -> bool:
    """Compute what `viewer_id` should see for `target_user_id`'s online state."""
    if viewer_id == target_user_id:
        return True
    if target_pref == "invisible":
        return False
    return await is_present(redis, target_user_id)
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `poetry run pytest tests/test_presence.py -v`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/messenger/backend/app/ws/presence.py tests/test_presence.py
git commit -m "feat: presence operations (set/clear/is_present/visible)"
```

---

### Task 6: Broadcaster + chat-partners-aware delivery

**Files:**
- Modify: `src/messenger/backend/app/ws/presence.py`
- Modify: `src/messenger/backend/app/crud/chat.py`
- Modify: `tests/test_presence.py`

- [ ] **Step 1: Add `get_chat_partners` to ChatCRUD**

In `src/messenger/backend/app/crud/chat.py`, add this method to the `ChatCRUD` class (e.g. after `is_chat_member`):

```python
    @staticmethod
    async def get_chat_partners(session: AsyncSession, user_id: int) -> list[int]:
        """Return user_ids of everyone who shares at least one chat with `user_id`."""
        partner_chats = (
            select(ChatMember.chat_id)
            .where(ChatMember.user_id == user_id)
        ).subquery()
        query = (
            select(ChatMember.user_id)
            .where(ChatMember.chat_id.in_(select(partner_chats)))
            .where(ChatMember.user_id != user_id)
            .distinct()
        )
        result = await session.execute(query)
        return [row[0] for row in result.all()]
```

- [ ] **Step 2: Write failing test for broadcast helper**

Append to `tests/test_presence.py`:

```python
import json as _json


@pytest.mark.asyncio
async def test_publish_presence_event_serializes_to_channel(fake_redis):
    from messenger.backend.app.ws.presence import (
        PRESENCE_EVENTS_CHANNEL,
        publish_presence_event,
    )

    pubsub = fake_redis.pubsub()
    await pubsub.subscribe(PRESENCE_EVENTS_CHANNEL)
    # consume the subscribe ack
    msg = await pubsub.get_message(timeout=1.0)
    assert msg is not None and msg["type"] == "subscribe"

    await publish_presence_event(fake_redis, user_id=42, online=True)

    msg = await pubsub.get_message(timeout=1.0)
    assert msg is not None
    assert msg["type"] == "message"
    payload = _json.loads(msg["data"])
    assert payload == {"user_id": 42, "online": True}

    await pubsub.unsubscribe(PRESENCE_EVENTS_CHANNEL)
    await pubsub.aclose()
```

- [ ] **Step 3: Run, verify failure**

Run: `poetry run pytest tests/test_presence.py::test_publish_presence_event_serializes_to_channel -v`
Expected: FAIL — `ImportError: cannot import name 'publish_presence_event'`.

- [ ] **Step 4: Add `publish_presence_event` to `presence.py`**

Append to `src/messenger/backend/app/ws/presence.py`:

```python
async def publish_presence_event(redis: "Redis", user_id: int, online: bool) -> None:
    """Publish a state-transition event to the presence pub/sub channel."""
    payload = json.dumps({"user_id": user_id, "online": online})
    await redis.publish(PRESENCE_EVENTS_CHANNEL, payload)
```

- [ ] **Step 5: Run, verify pass**

Run: `poetry run pytest tests/test_presence.py -v`
Expected: all green (8 + 1 = 9 passed).

- [ ] **Step 6: Commit**

```bash
git add src/messenger/backend/app/ws/presence.py src/messenger/backend/app/crud/chat.py tests/test_presence.py
git commit -m "feat: publish_presence_event + ChatCRUD.get_chat_partners"
```

---

### Task 7: Sweeper task with `offline_broadcasted` deduplication

**Files:**
- Modify: `src/messenger/backend/app/ws/presence.py`
- Modify: `tests/test_presence.py`

- [ ] **Step 1: Write failing test for sweeper logic**

Append to `tests/test_presence.py`:

```python
class _FakeManager:
    """Minimal stand-in for ConnectionManager that the sweeper interacts with."""
    def __init__(self, user_ids):
        self.active_connections = {uid: {object()} for uid in user_ids}
        self.offline_broadcasted: set[int] = set()


@pytest.mark.asyncio
async def test_sweep_once_broadcasts_offline_for_missing_key(fake_redis):
    from messenger.backend.app.ws.presence import sweep_once

    manager = _FakeManager(user_ids=[1, 2])
    # user 1 has a presence key, user 2 does not
    await set_presence(fake_redis, user_id=1)

    pubsub = fake_redis.pubsub()
    await pubsub.subscribe("presence_events")
    await pubsub.get_message(timeout=1.0)  # subscribe ack

    await sweep_once(redis=fake_redis, manager=manager)

    msg = await pubsub.get_message(timeout=1.0)
    assert msg is not None and msg["type"] == "message"
    assert _json.loads(msg["data"]) == {"user_id": 2, "online": False}
    assert manager.offline_broadcasted == {2}
    await pubsub.aclose()


@pytest.mark.asyncio
async def test_sweep_does_not_double_broadcast(fake_redis):
    from messenger.backend.app.ws.presence import sweep_once

    manager = _FakeManager(user_ids=[2])
    manager.offline_broadcasted.add(2)  # already broadcast once

    pubsub = fake_redis.pubsub()
    await pubsub.subscribe("presence_events")
    await pubsub.get_message(timeout=1.0)

    await sweep_once(redis=fake_redis, manager=manager)

    msg = await pubsub.get_message(timeout=0.2)
    assert msg is None  # no second broadcast
    await pubsub.aclose()


@pytest.mark.asyncio
async def test_sweep_resets_state_when_key_returns(fake_redis):
    from messenger.backend.app.ws.presence import sweep_once

    manager = _FakeManager(user_ids=[2])
    manager.offline_broadcasted.add(2)
    await set_presence(fake_redis, user_id=2)

    await sweep_once(redis=fake_redis, manager=manager)

    assert manager.offline_broadcasted == set()
```

- [ ] **Step 2: Run, verify failure**

Run: `poetry run pytest tests/test_presence.py -v`
Expected: 3 new tests fail — `cannot import name 'sweep_once'`.

- [ ] **Step 3: Implement `sweep_once` + background loop**

Append to `src/messenger/backend/app/ws/presence.py`:

```python
async def sweep_once(redis: "Redis", manager: "ConnectionManager") -> None:
    """Single pass: broadcast offline for users in active_connections whose
    Redis key has expired, and reset state when the key reappears.

    Does NOT close sockets — they may still be alive (just a hidden tab).
    Dead-socket cleanup happens lazily on next send_json failure.
    """
    for user_id in list(manager.active_connections.keys()):
        alive = await is_present(redis, user_id)
        if not alive:
            if user_id not in manager.offline_broadcasted:
                await publish_presence_event(redis, user_id, online=False)
                manager.offline_broadcasted.add(user_id)
        else:
            manager.offline_broadcasted.discard(user_id)


async def sweep_forever(manager: "ConnectionManager") -> None:
    """Background task: run sweep_once every SWEEPER_INTERVAL_SECONDS."""
    redis = get_redis()
    try:
        while True:
            await asyncio.sleep(SWEEPER_INTERVAL_SECONDS)
            try:
                await sweep_once(redis, manager)
            except Exception:  # noqa: BLE001
                logger.exception("sweep_once failed")
    except asyncio.CancelledError:
        return
```

- [ ] **Step 4: Run, verify pass**

Run: `poetry run pytest tests/test_presence.py -v`
Expected: all 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/messenger/backend/app/ws/presence.py tests/test_presence.py
git commit -m "feat: presence sweeper (offline broadcast on TTL expiry)"
```

---

### Task 8: Per-recipient presence delivery via pub/sub listener

**Files:**
- Modify: `src/messenger/backend/app/ws/presence.py`

This task does not have a test — `presence_listener` is an infinite loop coupled to the Redis pub/sub client, and is exercised end-to-end via the smoke test in Task 18.

- [ ] **Step 1: Add `presence_listener` to `presence.py`**

Append to `src/messenger/backend/app/ws/presence.py`:

```python
async def presence_listener(manager: "ConnectionManager") -> None:
    """Subscribe to PRESENCE_EVENTS_CHANNEL and fan out to local sockets.

    Only delivers to users who have the affected user in their chat partners.
    Resolves partners lazily on each event — cheap because Redis pub/sub
    fans out only state-transition events, not every ping.
    """
    from messenger.backend.app.crud.chat import ChatCRUD
    from messenger.backend.db.session import AsyncSessionLocal

    redis = get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe(PRESENCE_EVENTS_CHANNEL)

    try:
        async for raw in pubsub.listen():
            if raw["type"] != "message":
                continue
            try:
                data = json.loads(raw["data"])
            except (ValueError, TypeError):
                continue
            affected_user_id = data.get("user_id")
            online = data.get("online")
            if affected_user_id is None or not isinstance(online, bool):
                continue

            async with AsyncSessionLocal() as db:
                partner_ids = await ChatCRUD.get_chat_partners(db, affected_user_id)

            payload = {"type": "presence", "user_id": affected_user_id, "online": online}
            for partner_id in partner_ids:
                sockets = manager.active_connections.get(partner_id, set())
                dead = []
                for ws in sockets:
                    try:
                        await ws.send_json(payload)
                    except Exception:  # noqa: BLE001
                        dead.append(ws)
                for ws in dead:
                    sockets.discard(ws)
                if not sockets and partner_id in manager.active_connections:
                    del manager.active_connections[partner_id]
    except asyncio.CancelledError:
        await pubsub.unsubscribe(PRESENCE_EVENTS_CHANNEL)
        await pubsub.aclose()
```

- [ ] **Step 2: Smoke check imports**

Run: `poetry run python -c "from messenger.backend.app.ws.presence import presence_listener; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add src/messenger/backend/app/ws/presence.py
git commit -m "feat: presence_listener delivers events to chat partners"
```

---

## Phase 3 — WS integration

### Task 9: Refactor ConnectionManager to `Set[WebSocket]` per user

**Files:**
- Modify: `src/messenger/backend/app/ws/router.py`

- [ ] **Step 1: Replace `ConnectionManager` class**

Replace the body of `ConnectionManager` in `src/messenger/backend/app/ws/router.py` with:

```python
class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[int, set[WebSocket]] = {}
        self.offline_broadcasted: set[int] = set()

    async def connect(self, websocket: WebSocket, user_id: int) -> None:
        self.active_connections.setdefault(user_id, set()).add(websocket)
        self.offline_broadcasted.discard(user_id)

    async def disconnect(self, websocket: WebSocket, user_id: int) -> bool:
        """Remove `websocket` from the user's set. Returns True if the set is
        now empty (i.e. the user has no remaining sockets)."""
        sockets = self.active_connections.get(user_id)
        if not sockets:
            return True
        sockets.discard(websocket)
        if not sockets:
            del self.active_connections[user_id]
            return True
        return False

    async def send_personal_message(
        self,
        chat_id: int,
        text: str,
        recipient_id: int,
        sender_id: int,
        db: AsyncSession,
    ) -> None:
        message = await MessageCRUD.create_text_message(
            db=db,
            chat_id=chat_id,
            sender_id=sender_id,
            recipient_id=recipient_id,
            text=text,
        )
        payload = json.dumps({
            "recipient_id": recipient_id,
            "encrypted_text": message.encrypted_data,
            "sender_id": sender_id,
            "chat_id": chat_id,
        })
        redis = get_redis()
        await redis.publish(REDIS_CHAT_CHANNEL, payload)

    async def pubsub_listener(self) -> None:
        redis = get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(REDIS_CHAT_CHANNEL)

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                data = json.loads(message["data"])
                recipient_id = data.get("recipient_id")
                encrypted_text = data.get("encrypted_text")
                sender_id = data.get("sender_id")
                chat_id = data.get("chat_id")

                sockets = self.active_connections.get(recipient_id, set())
                if not sockets:
                    continue
                try:
                    decrypted_text = decrypt_message(encrypted_text)
                except Exception:  # noqa: BLE001
                    continue
                payload = {
                    "text": decrypted_text,
                    "sender_id": sender_id,
                    "recipient_id": recipient_id,
                    "chat_id": chat_id,
                }
                dead = []
                for ws in sockets:
                    try:
                        await ws.send_json(payload)
                    except Exception:  # noqa: BLE001
                        dead.append(ws)
                for ws in dead:
                    sockets.discard(ws)
                if not sockets:
                    self.active_connections.pop(recipient_id, None)
        except asyncio.CancelledError:
            await pubsub.unsubscribe(REDIS_CHAT_CHANNEL)
```

- [ ] **Step 2: Smoke check imports + existing tests**

Run: `poetry run pytest tests/ -v`
Expected: all existing tests still pass (no presence-specific tests broken).

- [ ] **Step 3: Commit**

```bash
git add src/messenger/backend/app/ws/router.py
git commit -m "refactor: ConnectionManager uses Set[WebSocket] per user"
```

---

### Task 10: WS connect/disconnect/ping with presence ops

**Files:**
- Modify: `src/messenger/backend/app/ws/router.py`

- [ ] **Step 1: Replace `websocket_chat` body**

In `src/messenger/backend/app/ws/router.py`, replace the existing `websocket_chat` handler with:

```python
@ws_router.websocket("/chat")
async def websocket_chat(websocket: WebSocket) -> None:
    await websocket.accept()

    user_id = await _authenticate(websocket)
    if user_id is None:
        await websocket.close(code=WS_AUTH_FAILED, reason="auth failed")
        return

    from messenger.backend.app.ws.presence import (
        clear_presence,
        publish_presence_event,
        set_presence,
    )

    await manager.connect(websocket, user_id)
    redis = get_redis()
    transitioned = await set_presence(redis, user_id)
    if transitioned:
        await publish_presence_event(redis, user_id, online=True)

    try:
        await websocket.send_json({"type": "auth_ok", "user_id": user_id})

        while True:
            data = await websocket.receive_text()
            try:
                msg_data = json.loads(data)
            except json.JSONDecodeError:
                continue

            msg_type = msg_data.get("type")
            if msg_type == "ping":
                transitioned = await set_presence(redis, user_id)
                if transitioned:
                    manager.offline_broadcasted.discard(user_id)
                    await publish_presence_event(redis, user_id, online=True)
                continue

            chat_id = msg_data.get("chat_id")
            text = msg_data.get("text")
            if not (chat_id and text):
                continue

            async with AsyncSessionLocal() as db:
                if not await ChatCRUD.is_chat_member(db, chat_id, user_id):
                    continue
                other = await ChatCRUD.get_other_user_by_chat_id(db, chat_id, user_id)
                if not other:
                    continue
                await manager.send_personal_message(
                    chat_id=chat_id,
                    text=text,
                    recipient_id=other.user_id,
                    sender_id=user_id,
                    db=db,
                )

    except WebSocketDisconnect:
        pass
    finally:
        last_socket = await manager.disconnect(websocket, user_id)
        if last_socket:
            await clear_presence(redis, user_id)
            await publish_presence_event(redis, user_id, online=False)
```

Also add this import at the top of the file (next to the existing imports):

```python
from messenger.backend.core.redis import get_redis
```

- [ ] **Step 2: Smoke check imports**

Run: `poetry run python -c "from messenger.backend.app.ws.router import websocket_chat; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Existing tests still green**

Run: `poetry run pytest tests/ -v`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/messenger/backend/app/ws/router.py
git commit -m "feat: WS handler manages presence on connect/disconnect/ping"
```

---

### Task 11: Wire presence listener and sweeper into lifespan

**Files:**
- Modify: `src/messenger/backend/app/main.py`

- [ ] **Step 1: Replace `lifespan`**

In `src/messenger/backend/app/main.py`, replace the `lifespan` block with:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_redis()

    import asyncio

    from .ws.presence import presence_listener, sweep_forever
    from .ws.router import manager

    chat_listener_task = asyncio.create_task(manager.pubsub_listener())
    presence_listener_task = asyncio.create_task(presence_listener(manager))
    sweeper_task = asyncio.create_task(sweep_forever(manager))

    try:
        yield
    finally:
        chat_listener_task.cancel()
        presence_listener_task.cancel()
        sweeper_task.cancel()
        await close_redis()
```

- [ ] **Step 2: Smoke check app boot**

Run: `poetry run python -c "from messenger.backend.app.main import app; print(len(app.routes))"`
Expected: prints an integer ≥ 4.

- [ ] **Step 3: Commit**

```bash
git add src/messenger/backend/app/main.py
git commit -m "feat: start presence listener + sweeper in lifespan"
```

---

## Phase 4 — REST endpoints

### Task 12: `/profiles` returns `online` with invisible mask

**Files:**
- Modify: `src/messenger/backend/app/api_v1/routers/profile_router.py`
- Create: `tests/test_profile_presence.py`

- [ ] **Step 1: Write failing integration test**

Create `tests/test_profile_presence.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.main import app
from messenger.backend.app.ws.presence import set_presence
from messenger.backend.core import redis as redis_module


@pytest.fixture
def patch_redis(monkeypatch, fake_redis):
    monkeypatch.setattr(redis_module, "redis_client", fake_redis)
    yield


class _FakeUser:
    def __init__(self, id: int):
        self.id = id


@pytest.mark.asyncio
async def test_invisible_target_appears_offline_to_others(patch_redis, fake_redis, monkeypatch):
    # Bypass DB by overriding both get_current_user and ProfileCRUD.get_user_with_profile
    target_id = 42
    viewer_id = 7

    async def _fake_get_user_with_profile(db, user_id):
        from types import SimpleNamespace
        return SimpleNamespace(
            id=user_id,
            username="bob",
            name="Bob",
            phone_number=None,
            profile=SimpleNamespace(
                display_name="Bob",
                bio="hi",
                presence_preference="invisible",
                profile_photos=[],
            ),
        )

    from messenger.backend.app.crud.profile import ProfileCRUD
    monkeypatch.setattr(ProfileCRUD, "get_user_with_profile", staticmethod(_fake_get_user_with_profile))

    app.dependency_overrides[get_current_user] = lambda: _FakeUser(id=viewer_id)

    await set_presence(fake_redis, target_id)  # target IS connected

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(f"/profiles/{target_id}")
            assert resp.status_code == 200, resp.text
            body = resp.json()
            assert body["online"] is False  # masked
            assert body["presence_preference"] is None  # masked
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_dnd_target_shows_online_with_pref_visible(patch_redis, fake_redis, monkeypatch):
    target_id = 43
    viewer_id = 7

    async def _fake_get_user_with_profile(db, user_id):
        from types import SimpleNamespace
        return SimpleNamespace(
            id=user_id, username="alice", name="Alice", phone_number=None,
            profile=SimpleNamespace(
                display_name="Alice", bio="hi", presence_preference="dnd", profile_photos=[],
            ),
        )

    from messenger.backend.app.crud.profile import ProfileCRUD
    monkeypatch.setattr(ProfileCRUD, "get_user_with_profile", staticmethod(_fake_get_user_with_profile))

    app.dependency_overrides[get_current_user] = lambda: _FakeUser(id=viewer_id)

    await set_presence(fake_redis, target_id)

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(f"/profiles/{target_id}")
            assert resp.status_code == 200
            body = resp.json()
            assert body["online"] is True
            assert body["presence_preference"] == "dnd"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_self_invisible_sees_real_state(patch_redis, fake_redis, monkeypatch):
    user_id = 44

    async def _fake_get_user_with_profile(db, uid):
        from types import SimpleNamespace
        return SimpleNamespace(
            id=uid, username="self", name="Self", phone_number=None,
            profile=SimpleNamespace(
                display_name="Self", bio="", presence_preference="invisible", profile_photos=[],
            ),
        )

    from messenger.backend.app.crud.profile import ProfileCRUD
    monkeypatch.setattr(ProfileCRUD, "get_user_with_profile", staticmethod(_fake_get_user_with_profile))

    app.dependency_overrides[get_current_user] = lambda: _FakeUser(id=user_id)

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/profiles/me")
            assert resp.status_code == 200
            body = resp.json()
            assert body["online"] is True  # self always online
            assert body["presence_preference"] == "invisible"  # self sees own pref
    finally:
        app.dependency_overrides.pop(get_current_user, None)
```

Also add `httpx` to dev deps if it isn't already installed (it's a transitive dep of FastAPI for tests). Check with:

```bash
poetry run python -c "import httpx; print(httpx.__version__)"
```

If it fails, add `httpx = ">=0.27.0,<1.0.0"` to `[tool.poetry.group.dev.dependencies]` and run `poetry install`.

- [ ] **Step 2: Run, verify failure**

Run: `poetry run pytest tests/test_profile_presence.py -v`
Expected: FAIL — assertion `body["online"]` or KeyError because the router doesn't return `online` yet.

- [ ] **Step 3: Update `_build_response` and route handlers**

Replace `src/messenger/backend/app/api_v1/routers/profile_router.py` with:

```python
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.api_v1.schemas.user import (
    PhoneCodeVerify,
    PhoneRequest,
    ProfileUpdate,
    UserProfileResponse,
)
from messenger.backend.app.crud.profile import ProfileCRUD
from messenger.backend.app.ws.presence import is_visible_online
from messenger.backend.core.redis import get_redis
from messenger.backend.db.session import get_db_session
from messenger.backend.models.user import User

profile_router = APIRouter(prefix="/profiles", tags=["profiles"])


async def _build_response(user, viewer_id: int) -> UserProfileResponse:
    """Flatten User+Profile ORM objects, computing `online` and masking
    `presence_preference` if the target is invisible to non-self viewers."""
    p = user.profile
    target_pref = p.presence_preference if p else None
    redis = get_redis()
    online = await is_visible_online(
        redis=redis,
        viewer_id=viewer_id,
        target_user_id=user.id,
        target_pref=target_pref,
    )

    # Mask `invisible` preference from other viewers — hide the fact entirely.
    visible_pref: str | None
    if viewer_id != user.id and target_pref == "invisible":
        visible_pref = None
    else:
        visible_pref = target_pref

    return UserProfileResponse(
        user_id=user.id,
        username=user.username,
        name=user.name,
        phone_number=user.phone_number,
        display_name=p.display_name if p else None,
        bio=p.bio if p else None,
        presence_preference=visible_pref,
        online=online,
        profile_photos=p.profile_photos if p else [],
    )


@profile_router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    user = await ProfileCRUD.get_user_with_profile(db, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="Profile not found")
    return await _build_response(user, viewer_id=current_user.id)


@profile_router.put("/me", response_model=UserProfileResponse)
async def update_my_profile(
    data: ProfileUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    profile = await ProfileCRUD.update_profile(db, current_user.id, data)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    user = await ProfileCRUD.get_user_with_profile(db, current_user.id)
    return await _build_response(user, viewer_id=current_user.id)


@profile_router.post("/phone/send-code")
async def send_phone_code(
    data: PhoneRequest,
    current_user=Depends(get_current_user),
):
    redis = get_redis()
    key = f"phone_verify:{current_user.id}:{data.phone_number}"
    existing = await redis.get(key)
    if existing:
        code = existing
    else:
        code = str(secrets.randbelow(900000) + 100000)
        await redis.setex(key, 300, code)
    print(f"[DEV] Phone verification code for {data.phone_number}: {code}")
    return {"message": True}


@profile_router.post("/phone/verify", response_model=UserProfileResponse)
async def verify_phone_code(
    data: PhoneCodeVerify,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    redis = get_redis()
    key = f"phone_verify:{current_user.id}:{data.phone_number}"
    stored_code = await redis.get(key)
    if not stored_code or stored_code != data.code:
        raise HTTPException(status_code=400, detail="Invalid code")

    await redis.delete(key)

    user = await db.get(User, current_user.id)
    if user:
        user.phone_number = data.phone_number
        await db.commit()

    user_with_profile = await ProfileCRUD.get_user_with_profile(db, current_user.id)
    return await _build_response(user_with_profile, viewer_id=current_user.id)


@profile_router.get("/{user_id}", response_model=UserProfileResponse)
async def get_user_profile(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    user = await ProfileCRUD.get_user_with_profile(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return await _build_response(user, viewer_id=current_user.id)
```

- [ ] **Step 4: Update `ProfileCRUD.update_profile` to handle the new schema**

In `src/messenger/backend/app/crud/profile.py`, `update_profile` already does generic `setattr` for non-phone fields. Verify it correctly skips `phone_number` — yes, it does (`if k != "phone_number"`). No change required, but **double-check** that the loop accepts `presence_preference`:

```python
profile_fields = {k: v for k, v in data.model_dump(exclude_unset=True).items() if k != "phone_number"}
for field, value in profile_fields.items():
    setattr(profile, field, value)
```

`presence_preference` will be passed through. Good.

- [ ] **Step 5: Run tests, verify pass**

Run: `poetry run pytest tests/test_profile_presence.py -v`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/messenger/backend/app/api_v1/routers/profile_router.py tests/test_profile_presence.py
git commit -m "feat: /profiles returns online + masks invisible pref"
```

---

### Task 13: `GET /chats/presence` batch endpoint

**Files:**
- Modify: `src/messenger/backend/app/api_v1/routers/chat_router.py`
- Modify: `tests/test_profile_presence.py`

- [ ] **Step 1: Write failing test**

Append to `tests/test_profile_presence.py`:

```python
@pytest.mark.asyncio
async def test_chat_presence_endpoint_filters_offline_and_invisible(
    patch_redis, fake_redis, monkeypatch
):
    viewer_id = 100

    async def _partners(session, user_id):
        # viewer has three partners: 101 (online), 102 (online but invisible), 103 (offline)
        assert user_id == viewer_id
        return [101, 102, 103]

    async def _get_pref(session, target_id):
        return {101: None, 102: "invisible", 103: None}[target_id]

    from messenger.backend.app.crud.chat import ChatCRUD
    monkeypatch.setattr(ChatCRUD, "get_chat_partners", staticmethod(_partners))

    # Stub a CRUD helper we'll add for fetching preferences in batch
    from messenger.backend.app.crud.profile import ProfileCRUD
    async def _get_prefs(session, user_ids):
        return {uid: {101: None, 102: "invisible", 103: None}[uid] for uid in user_ids}
    monkeypatch.setattr(ProfileCRUD, "get_presence_preferences", staticmethod(_get_prefs), raising=False)

    await set_presence(fake_redis, 101)
    await set_presence(fake_redis, 102)
    # 103 stays offline

    app.dependency_overrides[get_current_user] = lambda: _FakeUser(id=viewer_id)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/chats/presence")
            assert resp.status_code == 200, resp.text
            assert sorted(resp.json()["online_user_ids"]) == [101]
    finally:
        app.dependency_overrides.pop(get_current_user, None)
```

- [ ] **Step 2: Run, verify failure**

Run: `poetry run pytest tests/test_profile_presence.py::test_chat_presence_endpoint_filters_offline_and_invisible -v`
Expected: FAIL — 404 because `/chats/presence` route does not exist.

- [ ] **Step 3: Add `get_presence_preferences` to ProfileCRUD**

In `src/messenger/backend/app/crud/profile.py`, append to the `ProfileCRUD` class:

```python
    @staticmethod
    async def get_presence_preferences(
        session: AsyncSession, user_ids: list[int]
    ) -> dict[int, str | None]:
        """Return {user_id: presence_preference} for the given ids.
        Users without a profile row are absent from the dict."""
        if not user_ids:
            return {}
        query = select(Profile.user_id, Profile.presence_preference).where(
            Profile.user_id.in_(user_ids)
        )
        result = await session.execute(query)
        return {row[0]: row[1] for row in result.all()}
```

- [ ] **Step 4: Add the route to `chat_router.py`**

In `src/messenger/backend/app/api_v1/routers/chat_router.py`, add at the top of imports:

```python
from messenger.backend.app.crud.profile import ProfileCRUD
from messenger.backend.app.ws.presence import is_present
from messenger.backend.core.redis import get_redis
```

And append a new route handler (e.g. after `get_chats`):

```python
@chat_router.get("/presence")
async def get_chat_presence(
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    """Return user_ids of chat partners who are currently online AND not invisible."""
    partner_ids = await ChatCRUD.get_chat_partners(db, current_user.id)
    if not partner_ids:
        return {"online_user_ids": []}

    prefs = await ProfileCRUD.get_presence_preferences(db, partner_ids)
    redis = get_redis()

    online = []
    for uid in partner_ids:
        if prefs.get(uid) == "invisible":
            continue
        if await is_present(redis, uid):
            online.append(uid)

    return {"online_user_ids": online}
```

Note the route is `GET /chats/presence`. Since `chat_router` has `prefix="/chats"`, the relative path is `/presence`. This must be declared **before** the `{chat_id}/...` routes if any of them could collide; here `/presence` is a distinct literal segment, so order doesn't matter, but place it adjacent to `get_chats` for readability.

- [ ] **Step 5: Run test, verify pass**

Run: `poetry run pytest tests/test_profile_presence.py -v`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/messenger/backend/app/api_v1/routers/chat_router.py src/messenger/backend/app/crud/profile.py tests/test_profile_presence.py
git commit -m "feat: GET /chats/presence batch endpoint"
```

---

## Phase 5 — Frontend

### Task 14: Extend `useChatSocket` with presence + reconnect

**Files:**
- Modify: `src/messenger/frontend_react/src/hooks/useChatSocket.js`

- [ ] **Step 1: Replace file contents**

```js
import { useState, useEffect, useRef } from "react";
import { jwtDecode } from "jwt-decode";

const WS_BASE = import.meta.env.VITE_WS_BASE_URL ||
    `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

const RECONNECT_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];

export const useChatSocket = (token) => {
    const [messages, setMessages] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [lastReceivedMessage, setLastReceivedMessage] = useState(null);
    const [lastPresenceEvent, setLastPresenceEvent] = useState(null);

    const currentUserRef = useRef(null);
    const socketRef = useRef(null);
    const manualCloseRef = useRef(false);
    const reconnectAttemptRef = useRef(0);
    const reconnectTimerRef = useRef(null);

    useEffect(() => {
        if (!token) return;

        let cancelled = false;

        const openSocket = () => {
            if (cancelled) return;
            try {
                const decoded = jwtDecode(token);
                currentUserRef.current = decoded.sub || decoded.user_id;
            } catch (err) {
                console.error('JWT decode failed', err);
                return;
            }

            const ws = new WebSocket(`${WS_BASE}/chat`);
            socketRef.current = ws;

            ws.onopen = () => {
                ws.send(JSON.stringify({ type: "auth", token }));
            };

            ws.onmessage = (event) => {
                let data;
                try {
                    data = JSON.parse(event.data);
                } catch {
                    return;
                }

                if (data.type === "auth_ok") {
                    setIsConnected(true);
                    reconnectAttemptRef.current = 0;
                    return;
                }

                if (data.type === "presence") {
                    setLastPresenceEvent(data);
                    return;
                }

                setMessages((prev) => [...prev, {
                    ...data,
                    text: data.text,
                    type: data.sender_id === currentUserRef.current ? "outgoing" : "incoming",
                    id: Date.now(),
                }]);
                setLastReceivedMessage(data);
            };

            ws.onclose = (event) => {
                setIsConnected(false);
                if (cancelled || manualCloseRef.current) return;
                if (event.code === 4401) return;  // auth failed — don't loop forever

                const attempt = reconnectAttemptRef.current;
                const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
                reconnectAttemptRef.current = attempt + 1;
                reconnectTimerRef.current = setTimeout(openSocket, delay);
            };

            ws.onerror = () => {
                // Let onclose handle reconnect.
            };
        };

        openSocket();

        return () => {
            cancelled = true;
            manualCloseRef.current = true;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            if (socketRef.current) socketRef.current.close();
        };
    }, [token]);

    const sendMessage = (text, activeChatId) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
                text,
                chat_id: activeChatId,
                timestamp: new Date().toISOString(),
            }));
            setLastReceivedMessage({
                chat_id: activeChatId,
                text,
                sender_id: currentUserRef.current,
            });
        }
    };

    return {
        messages,
        setMessages,
        sendMessage,
        isConnected,
        lastReceivedMessage,
        lastPresenceEvent,
        socketRef,
    };
};
```

- [ ] **Step 2: Smoke check (no test runner — manual)**

Run: `cd src/messenger/frontend_react && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/messenger/frontend_react/src/hooks/useChatSocket.js
git commit -m "feat: useChatSocket emits lastPresenceEvent + reconnect with backoff"
```

---

### Task 15: Create `usePresence` hook

**Files:**
- Create: `src/messenger/frontend_react/src/hooks/usePresence.js`

- [ ] **Step 1: Create the hook**

```js
import { useEffect, useRef, useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const HEARTBEAT_INTERVAL_MS = 30_000;

const authConfig = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
});

/**
 * Tracks which chat partners are currently online.
 *
 * @param {{current: WebSocket | null}} socketRef — from useChatSocket.
 * @param {boolean} isConnected — true after auth_ok.
 * @param {{type: string, user_id: number, online: boolean} | null} lastPresenceEvent
 * @returns {{onlineUsers: Set<number>}}
 */
export const usePresence = (socketRef, isConnected, lastPresenceEvent) => {
    const [onlineUsers, setOnlineUsers] = useState(() => new Set());
    const heartbeatRef = useRef(null);

    const startHeartbeat = () => {
        if (heartbeatRef.current) return;
        const sendPing = () => {
            const ws = socketRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "ping" }));
            }
        };
        sendPing();  // immediate ping on (re)start
        heartbeatRef.current = setInterval(sendPing, HEARTBEAT_INTERVAL_MS);
    };

    const stopHeartbeat = () => {
        if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
        }
    };

    // Fetch initial snapshot and start heartbeat after auth_ok.
    useEffect(() => {
        if (!isConnected) {
            stopHeartbeat();
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const res = await axios.get(`${API_BASE}/chats/presence`, authConfig());
                if (!cancelled) setOnlineUsers(new Set(res.data.online_user_ids));
            } catch (err) {
                console.error("Failed to load presence snapshot", err);
            }
        })();

        if (document.visibilityState === "visible") startHeartbeat();

        return () => {
            cancelled = true;
            stopHeartbeat();
        };
    }, [isConnected]);

    // Page Visibility — start/stop heartbeat only; server figures out the rest via TTL.
    useEffect(() => {
        const onChange = () => {
            if (!isConnected) return;
            if (document.visibilityState === "visible") {
                startHeartbeat();
            } else {
                stopHeartbeat();
            }
        };
        document.addEventListener("visibilitychange", onChange);
        return () => document.removeEventListener("visibilitychange", onChange);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected]);

    // Apply presence events from the WS.
    useEffect(() => {
        if (!lastPresenceEvent) return;
        const { user_id, online } = lastPresenceEvent;
        setOnlineUsers((prev) => {
            const next = new Set(prev);
            if (online) next.add(user_id);
            else next.delete(user_id);
            return next;
        });
    }, [lastPresenceEvent]);

    return { onlineUsers };
};
```

- [ ] **Step 2: Verify build**

Run: `cd src/messenger/frontend_react && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/messenger/frontend_react/src/hooks/usePresence.js
git commit -m "feat: usePresence hook (heartbeat + visibility + snapshot)"
```

---

### Task 16: Wire `usePresence` into ChatPage and pass down

**Files:**
- Modify: `src/messenger/frontend_react/src/pages/chat/ChatPage.jsx`

- [ ] **Step 1: Add hook usage + partner-profile fetch + prop drilling**

In `ChatPage.jsx`, modify the imports block at top — add `usePresence`:

```jsx
import { useChatSocket } from '../../hooks/useChatSocket';
import { usePresence } from '../../hooks/usePresence';
```

Replace the line:

```jsx
const { messages, setMessages, sendMessage, isConnected, lastReceivedMessage } = useChatSocket(token);
```

with:

```jsx
const { messages, setMessages, sendMessage, isConnected, lastReceivedMessage, lastPresenceEvent, socketRef } = useChatSocket(token);
const { onlineUsers } = usePresence(socketRef, isConnected, lastPresenceEvent);
```

Add a state for the partner's presence preference (the chat header's DND icon depends on it). Put it next to other `useState` calls near the top of the component:

```jsx
const [partnerPresencePreference, setPartnerPresencePreference] = useState(null);
```

Add a `useEffect` that fetches the partner's profile when `activeChat` changes — place it after the existing `useEffect` that loads messages for `activeChat`:

```jsx
useEffect(() => {
    if (!activeChat?.recipient_id) {
        setPartnerPresencePreference(null);
        return;
    }
    let cancelled = false;
    (async () => {
        const p = await fetchUserProfile(activeChat.recipient_id);
        if (!cancelled) {
            setPartnerPresencePreference(p?.presence_preference ?? null);
        }
    })();
    return () => { cancelled = true; };
}, [activeChat?.recipient_id]);
```

Compute partner online state for `ChatWindow`:

```jsx
const isPartnerOnline = activeChat?.recipient_id
    ? onlineUsers.has(activeChat.recipient_id)
    : false;
```

Pass `onlineUsers` to `ChatList`:

```jsx
<ChatList
    chats={chats}
    activeChatId={activeChat?.id}
    onSelectChat={handleSelectChat}
    onlineUsers={onlineUsers}
/>
```

Pass the new props to `ChatWindow`:

```jsx
<ChatWindow activeChat={activeChat}
    messages={messages}
    setMessages={setMessages}
    sendMessage={handleSendMessage}
    isConnected={isConnected}
    isPartnerOnline={isPartnerOnline}
    partnerPresencePreference={partnerPresencePreference}
    messagesEndRef={messagesEndRef}
    inputText={inputText}
    setInputText={setInputText}
    chatName={chatName}
    onOpenProfile={() => activeChat?.recipient_id && handleOpenUserProfile(activeChat.recipient_id)}
    onBack={() => setMobileView('list')}
/>
```

- [ ] **Step 2: Build**

Run: `cd src/messenger/frontend_react && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/messenger/frontend_react/src/pages/chat/ChatPage.jsx
git commit -m "feat: wire usePresence into ChatPage"
```

---

### Task 17: `ChatList` — conditional online dot

**Files:**
- Modify: `src/messenger/frontend_react/src/components/chat/ChatList.jsx`

- [ ] **Step 1: Accept `onlineUsers` prop and render conditionally**

Update the component signature:

```jsx
export const ChatList = ({ chats, activeChatId, onSelectChat, onlineUsers }) => {
```

Replace the existing always-on placeholder:

```jsx
{/* Online status indicator placeholder */}
<div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-zinc-900" />
```

with:

```jsx
{onlineUsers?.has(chat.recipient_id) && (
    <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-lime-400 border-2 border-zinc-900" />
)}
```

Note: `chat.recipient_id` is set by `chat_router.get_chats`. If a chat object lacks `recipient_id` (e.g., still being constructed), `has(undefined)` returns false — no dot shown, no crash.

- [ ] **Step 2: Build**

Run: `cd src/messenger/frontend_react && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/messenger/frontend_react/src/components/chat/ChatList.jsx
git commit -m "feat: ChatList renders online dot from presence set"
```

---

### Task 18: `ChatWindow` — real online text + DND icon

**Files:**
- Modify: `src/messenger/frontend_react/src/components/chat/ChatWindow.jsx`

- [ ] **Step 1: Accept new props and render**

Replace the component signature:

```jsx
export const ChatWindow = ({
    messages, setMessages, activeChat, sendMessage,
    isConnected, messagesEndRef, inputText, setInputText,
    chatName, onOpenProfile, onBack,
    isPartnerOnline, partnerPresencePreference,
}) => {
```

Add the icon import at the top:

```jsx
import { User, Phone, MoreVertical, ChevronLeft, BellOff } from 'lucide-react';
```

Replace the line:

```jsx
<p className="text-xs text-lime-400 font-medium">{isConnected ? "В сети" : "Офлайн"}</p>
```

with:

```jsx
<div className="flex items-center gap-1.5">
    <p className={`text-xs font-medium ${isPartnerOnline ? "text-lime-400" : "text-zinc-500"}`}>
        {isPartnerOnline ? "в сети" : "не в сети"}
    </p>
    {partnerPresencePreference === "dnd" && (
        <BellOff size={12} className="text-amber-400" title="Не беспокоить" />
    )}
</div>
```

Note: this REPLACES the meaning of the status line. Previously it showed *our own* WS connectivity (`isConnected`); now it shows the *partner's* presence. The `isConnected` prop remains used by `InputArea` for the send button.

- [ ] **Step 2: Build**

Run: `cd src/messenger/frontend_react && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/messenger/frontend_react/src/components/chat/ChatWindow.jsx
git commit -m "feat: ChatWindow shows partner presence + DND icon"
```

---

### Task 19: `ProfileModal` — `online` bool + DND badge

**Files:**
- Modify: `src/messenger/frontend_react/src/components/profile/ProfileModal.jsx`

- [ ] **Step 1: Replace status badge logic**

Replace the existing badge block:

```jsx
{/* Status badge */}
<span className={`text-xs font-medium px-3 py-1 rounded-full ${
    profile.status === "Online"
        ? "bg-lime-400/15 text-lime-400"
        : "bg-zinc-700 text-zinc-400"
}`}>
    {profile.status}
</span>
```

with:

```jsx
<div className="flex items-center gap-2">
    <span className={`text-xs font-medium px-3 py-1 rounded-full ${
        profile.online
            ? "bg-lime-400/15 text-lime-400"
            : "bg-zinc-700 text-zinc-400"
    }`}>
        {profile.online ? "в сети" : "не в сети"}
    </span>
    {profile.presence_preference === "dnd" && (
        <span className="text-xs font-medium px-3 py-1 rounded-full bg-amber-400/15 text-amber-400">
            Не беспокоить
        </span>
    )}
</div>
```

- [ ] **Step 2: Build**

Run: `cd src/messenger/frontend_react && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/messenger/frontend_react/src/components/profile/ProfileModal.jsx
git commit -m "feat: ProfileModal uses online bool + DND badge"
```

---

### Task 20: `EditProfileModal` — presence preference selector

**Files:**
- Modify: `src/messenger/frontend_react/src/components/profile/EditProfileModal.jsx`

- [ ] **Step 1: Replace status constants and state**

At the top of the file, replace:

```jsx
const STATUS_OPTIONS = ["Online", "Offline", "Не беспокоить", "Недоступен"];
```

with:

```jsx
const PRESENCE_OPTIONS = [
    { value: "",          label: "Обычный" },
    { value: "dnd",       label: "Не беспокоить" },
    { value: "invisible", label: "Невидимка" },
];
```

(Empty string `""` is used as the sentinel for "no preference" → maps to `null` on save; HTML `<select>` does not allow `null` as an option value.)

In the component body, replace:

```jsx
const [status, setStatus] = useState(profile?.status || "Online");
```

with:

```jsx
const [presencePreference, setPresencePreference] = useState(profile?.presence_preference ?? "");
```

In `handleSave`, replace:

```jsx
await onSave({ display_name: displayName, bio, status });
```

with:

```jsx
await onSave({
    display_name: displayName,
    bio,
    presence_preference: presencePreference === "" ? null : presencePreference,
});
```

In the Profile-tab JSX, replace the existing status field block:

```jsx
<div className="flex flex-col gap-1">
    <label className="text-xs text-zinc-400 font-medium">Статус</label>
    <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 transition-all"
    >
        {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
        ))}
    </select>
</div>
```

with:

```jsx
<div className="flex flex-col gap-1">
    <label className="text-xs text-zinc-400 font-medium">Видимость</label>
    <select
        value={presencePreference}
        onChange={(e) => setPresencePreference(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-lime-400/60 transition-all"
    >
        {PRESENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
        ))}
    </select>
    <p className="text-[10px] text-zinc-500">
        «Обычный» — статус определяется автоматически. «Не беспокоить» — собеседник видит вас в сети с пометкой. «Невидимка» — все видят вас офлайн.
    </p>
</div>
```

- [ ] **Step 2: Build**

Run: `cd src/messenger/frontend_react && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/messenger/frontend_react/src/components/profile/EditProfileModal.jsx
git commit -m "feat: EditProfileModal — presence preference selector"
```

---

## Phase 6 — Verification

### Task 21: Run full backend test + lint suite

**Files:** (none modified)

- [ ] **Step 1: Run pytest**

Run: `poetry run pytest tests/ -v`
Expected: all tests pass, including the new presence/profile tests.

- [ ] **Step 2: Run ruff**

Run: `poetry run ruff check src/ tests/`
Expected: no errors.

If errors appear, fix them inline (style only — no logic changes).

- [ ] **Step 3: Run eslint on frontend**

Run: `cd src/messenger/frontend_react && npm run lint`
Expected: no errors.

If errors appear, fix them inline.

- [ ] **Step 4: Commit any lint fixes** (skip this step if no changes were needed)

```bash
git add -A
git commit -m "style: fix lint warnings in presence module"
```

---

### Task 22: End-to-end smoke test in two browsers

**Files:** (none modified — this is manual verification)

- [ ] **Step 1: Bring up the full stack**

```bash
docker compose up --build -d
docker compose exec backend alembic upgrade head
cd src/messenger/frontend_react && npm run build
```

- [ ] **Step 2: Open two browsers**

- Browser A (Chrome): log in as user 1
- Browser B (Firefox, or Chrome incognito): log in as user 2
- Open a private chat between them in both

- [ ] **Step 3: Verify online indicator turns green**

In A, the avatar of user 2 in the chat list should have a lime dot. In the chat header, "в сети" should be visible.

- [ ] **Step 4: Verify offline propagation on tab close**

Close browser B's tab. Within ~15 seconds (≤ 60s TTL + 10s sweeper), browser A should see the dot vanish and the header show "не в сети".

- [ ] **Step 5: Verify Page Visibility offline**

In browser B, re-open and log in. In A, the dot reappears. Now switch B's tab to a different one for >60 seconds. A should see B go offline.

- [ ] **Step 6: Verify DND**

In B, open profile → "Не беспокоить" → save. In A, the chat header should show the partner online but with an amber `BellOff` icon next to "в сети".

- [ ] **Step 7: Verify Invisible**

In B, switch to "Невидимка" and save. In A, B should appear "не в сети" and the chat list dot should disappear, even though B is connected.

- [ ] **Step 8: Verify multi-tab**

In B, open the messenger in two tabs simultaneously. Close one — A should still see B online. Close the second — A should see B go offline within ~15s.

- [ ] **Step 9: Document any issues**

If anything misbehaves, file a TODO in `docs/troubleshooting/` rather than patching the plan blindly. Common issues to look for:
- Dot doesn't appear: check browser console for axios `/chats/presence` 4xx/5xx.
- Dot never disappears: check backend logs for sweeper task running.
- DND icon doesn't show: verify backend returns `presence_preference: "dnd"` in the partner's profile response.

- [ ] **Step 10: Tear down**

```bash
docker compose down
```

---

### Task 23: Merge into main

- [ ] **Step 1: Merge `feature/realtime-online-status` into main (do not delete the branch)**

```bash
git checkout main
git merge --no-ff feature/realtime-online-status
```

- [ ] **Step 2: Push** (only if a remote is configured and the user wants it published)

```bash
git push origin main
git push origin feature/realtime-online-status
```

Per project convention, the feature branch is kept after merge — do not run `git branch -d`.

---

## Implementation notes

**Heartbeat timing:** 30s client interval + 60s server TTL gives 2× safety margin against single packet loss. Don't reduce TTL below 45s — one missed ping (e.g., during garbage collection or slow tab) would cause spurious offline flicker.

**Sweeper interval:** 10s. Slower = noticeable lag in offline detection; faster = wasted CPU when there are no transitions. 10s is the sweet spot for ≤ a few hundred concurrent users.

**Reconnect backoff:** 2/4/8/16/30s, capped at 30s. Reset to attempt 0 on successful `auth_ok` so a flaky network that briefly drops doesn't escalate to the cap.

**Self always online:** the `if viewer_id == target_user_id: return True` rule in `is_visible_online` matters for the `/profiles/me` case where the user is logged in but might not have a WS open (e.g., made an HTTP request from a different tab).

**Performance — sweep_once and pubsub_listener iterate `manager.active_connections.keys()`:** this is fine for thousands of users (it's just dict iteration), but if user count grows into the hundreds of thousands, switch to keyspace notifications.

**Why no presence_away/presence_back protocol messages:** with `Set[WebSocket]` per user, multi-tab is correct as long as any visible tab pings. A protocol "away" event would race with another tab's ping: DEL by one tab followed by EXPIRE-on-missing-key by another (which is a no-op) would falsely flip user offline. The client-side-only Page Visibility approach is simpler and correct.
