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
                avatar=None,
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
                display_name="Alice", bio="hi", presence_preference="dnd", avatar=None,
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
                display_name="Self", bio="", presence_preference="invisible", avatar=None,
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
