import pytest

from messenger.backend.app.ws.viewing_chat import (
    VIEWING_CHAT_TTL_SECONDS,
    clear_viewing_chat,
    get_viewing_chat,
    set_viewing_chat,
)


@pytest.mark.asyncio
async def test_set_and_get_returns_chat_id(fake_redis):
    await set_viewing_chat(fake_redis, user_id=42, chat_id=7)
    assert await get_viewing_chat(fake_redis, user_id=42) == 7


@pytest.mark.asyncio
async def test_get_unknown_user_returns_none(fake_redis):
    assert await get_viewing_chat(fake_redis, user_id=42) is None


@pytest.mark.asyncio
async def test_set_applies_ttl(fake_redis):
    await set_viewing_chat(fake_redis, user_id=42, chat_id=7)
    ttl = await fake_redis.ttl("viewing:42")
    assert 0 < ttl <= VIEWING_CHAT_TTL_SECONDS


@pytest.mark.asyncio
async def test_clear_removes_value(fake_redis):
    await set_viewing_chat(fake_redis, user_id=42, chat_id=7)
    await clear_viewing_chat(fake_redis, user_id=42)
    assert await get_viewing_chat(fake_redis, user_id=42) is None


@pytest.mark.asyncio
async def test_set_overwrites_previous_chat(fake_redis):
    await set_viewing_chat(fake_redis, user_id=42, chat_id=7)
    await set_viewing_chat(fake_redis, user_id=42, chat_id=99)
    assert await get_viewing_chat(fake_redis, user_id=42) == 99


@pytest.mark.asyncio
async def test_corrupted_value_returns_none(fake_redis):
    await fake_redis.set("viewing:42", "not-a-number")
    assert await get_viewing_chat(fake_redis, user_id=42) is None
