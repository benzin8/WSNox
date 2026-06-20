"""Тесты identity-кэша: лёгкий снимок личности + read-through резолвер."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from redis.exceptions import RedisError

from messenger.backend.core.identity import CachedUser
from messenger.backend.models.user import User


def _orm_user(user_id: int = 7, is_admin: bool = False) -> User:
    u = User(
        id=user_id,
        name="Alice",
        username=f"alice{user_id}",
        email=f"a{user_id}@example.com",
        phone_number="+79991234567",
        hashed_password="secret-hash",
    )
    u.role = "admin" if is_admin else "user"
    u.is_admin = is_admin
    u.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    u.last_seen = None
    return u


def test_cached_user_from_orm_exposes_all_attributes():
    """Снимок отдаёт все читаемые call-site'ами атрибуты."""
    snap = CachedUser.from_orm(_orm_user(is_admin=True))
    assert snap.id == 7
    assert snap.is_admin is True
    assert snap.username == "alice7"
    assert snap.name == "Alice"
    assert snap.email == "a7@example.com"
    assert snap.phone_number == "+79991234567"
    assert snap.created_at == datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert snap.last_seen is None


def test_cached_user_does_not_carry_hashed_password():
    """Секрет в кэш не попадает."""
    snap = CachedUser.from_orm(_orm_user())
    assert not hasattr(snap, "hashed_password")


def test_cached_user_json_roundtrip():
    """to_dict -> from_dict сохраняет все поля и тип datetime."""
    snap = CachedUser.from_orm(_orm_user(is_admin=True))
    restored = CachedUser.from_dict(snap.to_dict())
    assert restored == snap
    assert restored.created_at == snap.created_at
    assert restored.is_admin is True


def test_cached_user_handles_null_optional_fields():
    """phone_number/last_seen=None и created_at=None переживают roundtrip."""
    u = _orm_user()
    u.phone_number = None
    u.created_at = None
    snap = CachedUser.from_orm(u)
    restored = CachedUser.from_dict(snap.to_dict())
    assert restored.phone_number is None
    assert restored.created_at is None
    assert restored.last_seen is None


from messenger.backend.core.cache import user_auth
from messenger.backend.core.identity import get_cached_user


def _mock_db_returning(user):
    """Мокнутая сессия: db.execute(...).scalar_one_or_none() -> user."""
    session = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=user)
    session.execute = AsyncMock(return_value=result)
    return session


@pytest.mark.asyncio
async def test_get_cached_user_miss_populates_then_hit_skips_db(fake_redis):
    """Промах: SELECT + запись в кэш. Повторный вызов: хит, БД не трогаем."""
    user = _orm_user(user_id=7, is_admin=True)
    db = _mock_db_returning(user)

    snap1 = await get_cached_user(fake_redis, db, 7)
    assert snap1.id == 7 and snap1.is_admin is True
    assert db.execute.call_count == 1
    assert await fake_redis.get(user_auth(7)) is not None

    db2 = _mock_db_returning(user)
    snap2 = await get_cached_user(fake_redis, db2, 7)
    assert snap2 == snap1
    assert db2.execute.call_count == 0  # хит — БД не трогали


@pytest.mark.asyncio
async def test_get_cached_user_absent_user_returns_none_and_not_cached(fake_redis):
    """Несуществующий юзер: None, ключ НЕ создаётся (не отравляем кэш)."""
    db = _mock_db_returning(None)
    snap = await get_cached_user(fake_redis, db, 999)
    assert snap is None
    assert await fake_redis.get(user_auth(999)) is None


@pytest.mark.asyncio
async def test_get_cached_user_disabled_bypasses_cache(fake_redis, monkeypatch):
    """kill-switch off: всегда идём в БД, ничего не пишем."""
    import messenger.backend.core.identity as identity_mod
    monkeypatch.setattr(identity_mod.settings, "cache_data_enabled", False)
    user = _orm_user(user_id=7)
    db = _mock_db_returning(user)

    snap = await get_cached_user(fake_redis, db, 7)
    assert snap.id == 7
    assert db.execute.call_count == 1
    assert await fake_redis.get(user_auth(7)) is None


@pytest.mark.asyncio
async def test_get_cached_user_fail_open_on_redis_error():
    """RedisError на GET → проваливаемся в БД, значение возвращается."""
    broken = MagicMock()
    broken.get = AsyncMock(side_effect=RedisError("boom"))
    broken.set = AsyncMock(side_effect=RedisError("boom"))
    user = _orm_user(user_id=7)
    db = _mock_db_returning(user)

    snap = await get_cached_user(broken, db, 7)
    assert snap.id == 7
    assert db.execute.call_count == 1


@pytest.mark.asyncio
async def test_get_current_admin_gates_on_snapshot_is_admin():
    """get_current_admin читает .is_admin со снимка: non-admin -> 403, admin -> pass."""
    from fastapi import HTTPException

    from messenger.backend.app.api_v1.auth.dependencies import get_current_admin

    admin_snap = CachedUser.from_orm(_orm_user(user_id=1, is_admin=True))
    user_snap = CachedUser.from_orm(_orm_user(user_id=2, is_admin=False))

    assert await get_current_admin(admin_snap) is admin_snap

    with pytest.raises(HTTPException) as exc:
        await get_current_admin(user_snap)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_set_password_invalidates_identity(fake_redis):
    """UserCRUD.set_password бьёт cache:user:auth:{id} после commit."""
    from messenger.backend.app.crud.user import UserCRUD

    await fake_redis.set(user_auth(7), "{}")
    user = _orm_user(user_id=7)
    session = MagicMock()
    session.commit = AsyncMock()

    await UserCRUD.set_password(session, user, "new-strong-password", redis=fake_redis)

    session.commit.assert_awaited_once()
    assert await fake_redis.get(user_auth(7)) is None


@pytest.mark.asyncio
async def test_set_password_fail_open_when_redis_broken(fake_redis):
    """RedisError на инвалидации не ломает смену пароля."""
    from messenger.backend.app.crud.user import UserCRUD

    broken = MagicMock()
    broken.delete = AsyncMock(side_effect=RedisError("boom"))
    user = _orm_user(user_id=7)
    session = MagicMock()
    session.commit = AsyncMock()

    await UserCRUD.set_password(session, user, "new-strong-password", redis=broken)
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_admin_set_role_busts_identity_cache(fake_redis, monkeypatch):
    """admin_set_role: после commit DEL cache:user:auth:{target_id}."""
    from httpx import ASGITransport, AsyncClient

    from messenger.backend.app.api_v1.auth.dependencies import get_current_user
    from messenger.backend.app.main import app
    from messenger.backend.core import redis as redis_module
    from messenger.backend.db import get_db_session

    monkeypatch.setattr(redis_module, "redis_client", fake_redis)
    await fake_redis.set(user_auth(2), "{}")  # stale cached identity for the target

    target = _orm_user(user_id=2, is_admin=False)
    target.email = "bob@example.com"
    session = MagicMock()
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=target)
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()
    session.refresh = AsyncMock()

    # Actor must be owner to grant the admin role (hierarchy).
    owner = CachedUser(
        id=1, is_admin=True, username="owner", name="O", email="owner@example.com",
        phone_number=None, created_at=None, last_seen=None, role="owner",
    )

    app.dependency_overrides[get_current_user] = lambda: owner
    app.dependency_overrides[get_db_session] = lambda: session
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.patch(
                "/api/admin/users/2/admin",
                json={"is_admin": True, "confirm_email": "bob@example.com"},
            )
            assert r.status_code == 200, r.text
            session.commit.assert_awaited_once()
            assert await fake_redis.get(user_auth(2)) is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_verify_phone_code_busts_identity_cache(fake_redis, monkeypatch):
    """verify_phone_code: после commit телефона DEL cache:user:auth:{id}."""
    from types import SimpleNamespace

    from httpx import ASGITransport, AsyncClient

    from messenger.backend.app.api_v1.auth.dependencies import get_current_user
    from messenger.backend.app.crud.profile import ProfileCRUD
    from messenger.backend.app.main import app
    from messenger.backend.core import redis as redis_module
    from messenger.backend.db import get_db_session

    monkeypatch.setattr(redis_module, "redis_client", fake_redis)
    await fake_redis.set("phone_verify:7:+79990000000", "123456")  # stored code matches
    await fake_redis.set(user_auth(7), "{}")

    target = _orm_user(user_id=7)
    session = MagicMock()
    session.get = AsyncMock(return_value=target)
    session.commit = AsyncMock()

    async def _fake_gup(db, user_id):
        return SimpleNamespace(
            id=user_id, username="alice7", name="Alice", phone_number="+79990000000",
            profile=SimpleNamespace(
                display_name="Alice", bio="", presence_preference=None, avatar=None,
            ),
        )

    monkeypatch.setattr(ProfileCRUD, "get_user_with_profile", staticmethod(_fake_gup))

    me = CachedUser.from_orm(_orm_user(user_id=7))
    app.dependency_overrides[get_current_user] = lambda: me
    app.dependency_overrides[get_db_session] = lambda: session
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/profiles/phone/verify",
                json={"phone_number": "+79990000000", "code": "123456"},
            )
            assert r.status_code == 200, r.text
            session.commit.assert_awaited_once()
            assert await fake_redis.get(user_auth(7)) is None
    finally:
        app.dependency_overrides.clear()
