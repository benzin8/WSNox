"""Route-shape tests for POST/DELETE /profiles/me/avatar.

Uses dependency_overrides to swap S3Storage, current_user, DB, rate-limit, and
ProfileCRUD methods for fakes. This verifies routing + HTTPException mapping
without standing up a real DB or auth pipeline.
"""
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fakeredis import aioredis as fake_aioredis
from fastapi.testclient import TestClient

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.main import app
from messenger.backend.core.rate_limit import rate_limit_avatar_upload
from messenger.backend.db.session import get_db_session
from messenger.backend.services.deps import get_storage, get_storage_optional

FIXTURES = Path(__file__).parent / "fixtures"


def _fake_redis_client():
    """Realistic async fake Redis (cache-miss returns None) for get_redis patches.

    A bare AsyncMock returns a truthy mock from .get(), which the avatar URL
    cache would mistake for a hit — use fakeredis so misses behave correctly.
    """
    return fake_aioredis.FakeRedis(decode_responses=True)


class FakeStorage:
    def __init__(self):
        self.puts: list[tuple[str, bytes, str]] = []
        self.deletes: list[str] = []

    async def put_object(self, key, body, content_type):
        self.puts.append((key, body, content_type))

    async def delete_object(self, key):
        self.deletes.append(key)

    async def presigned_get(self, key, *, expires_in=3600):
        return f"https://signed.example/{key}"


@pytest.fixture
def fake_storage():
    return FakeStorage()


@pytest.fixture
def client(fake_storage):
    fake_user = SimpleNamespace(id=42, username="u", name="U", email="u@example.com", phone_number=None)

    async def _fake_get_current_user():
        return fake_user

    async def _fake_get_db():
        yield SimpleNamespace()

    async def _noop_rate_limit():
        return None

    app.dependency_overrides[get_current_user] = _fake_get_current_user
    app.dependency_overrides[get_db_session] = _fake_get_db
    app.dependency_overrides[get_storage] = lambda: fake_storage
    app.dependency_overrides[get_storage_optional] = lambda: fake_storage
    app.dependency_overrides[rate_limit_avatar_upload] = _noop_rate_limit

    yield TestClient(app)
    app.dependency_overrides.clear()


def _fake_user_with_profile(avatar):
    return SimpleNamespace(
        id=42,
        username="u",
        name="U",
        email="u@example.com",
        phone_number=None,
        profile=SimpleNamespace(
            display_name="U", bio="", presence_preference=None, avatar=avatar,
        ),
    )


def test_post_avatar_ok(client, fake_storage):
    """Happy path: PNG → 200 with avatar URLs, two S3 puts, set_avatar called."""
    file_bytes = (FIXTURES / "avatar_ok.png").read_bytes()

    with patch(
        "messenger.backend.app.api_v1.routers.profile_router.ProfileCRUD.set_avatar",
        new=AsyncMock(return_value=(None, None)),
    ) as set_avatar_mock, patch(
        "messenger.backend.app.api_v1.routers.profile_router.ProfileCRUD.get_user_with_profile",
        new=AsyncMock(return_value=_fake_user_with_profile(
            {"full_key": "avatars/42/123/full.webp",
             "thumb_key": "avatars/42/123/thumb.webp",
             "uploaded_at": "2026-05-30T00:00:00+00:00"}
        )),
    ), patch(
        "messenger.backend.app.api_v1.routers.profile_router.publish_profile_event",
        new=AsyncMock(),
    ), patch(
        "messenger.backend.app.api_v1.routers.profile_router.is_visible_online",
        new=AsyncMock(return_value=True),
    ), patch(
        "messenger.backend.app.api_v1.routers.profile_router.get_redis",
        return_value=_fake_redis_client(),
    ):
        res = client.post(
            "/profiles/me/avatar",
            files={"file": ("a.png", file_bytes, "image/png")},
        )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["avatar_url"].startswith("https://signed.example/")
    assert body["avatar_thumb_url"].startswith("https://signed.example/")
    assert len(fake_storage.puts) == 2
    set_avatar_mock.assert_awaited_once()


def test_post_avatar_too_large(client):
    big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (6 * 1024 * 1024)
    res = client.post(
        "/profiles/me/avatar",
        files={"file": ("b.png", big, "image/png")},
    )
    assert res.status_code == 413


def test_post_avatar_bad_mime(client):
    res = client.post(
        "/profiles/me/avatar",
        files={"file": ("x.txt", b"hello", "text/plain")},
    )
    assert res.status_code == 415


def test_post_avatar_corrupted(client):
    file_bytes = (FIXTURES / "avatar_corrupted.png").read_bytes()
    res = client.post(
        "/profiles/me/avatar",
        files={"file": ("c.png", file_bytes, "image/png")},
    )
    assert res.status_code == 422


def test_delete_avatar_clears(client, fake_storage):
    old_avatar = {
        "full_key": "avatars/42/old/full.webp",
        "thumb_key": "avatars/42/old/thumb.webp",
        "uploaded_at": "2026-05-29T00:00:00+00:00",
    }
    with patch(
        "messenger.backend.app.api_v1.routers.profile_router.ProfileCRUD.set_avatar",
        new=AsyncMock(return_value=(None, old_avatar)),
    ), patch(
        "messenger.backend.app.api_v1.routers.profile_router.ProfileCRUD.get_user_with_profile",
        new=AsyncMock(return_value=_fake_user_with_profile(None)),
    ), patch(
        "messenger.backend.app.api_v1.routers.profile_router.publish_profile_event",
        new=AsyncMock(),
    ), patch(
        "messenger.backend.app.api_v1.routers.profile_router.is_visible_online",
        new=AsyncMock(return_value=True),
    ), patch(
        "messenger.backend.app.api_v1.routers.profile_router.get_redis",
        return_value=_fake_redis_client(),
    ):
        res = client.delete("/profiles/me/avatar")
    assert res.status_code == 200
    body = res.json()
    assert body["avatar_url"] is None
    assert body["avatar_thumb_url"] is None
    assert set(fake_storage.deletes) == {old_avatar["full_key"], old_avatar["thumb_key"]}
