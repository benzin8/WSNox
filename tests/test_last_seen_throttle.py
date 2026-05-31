"""Тесты throttle'а last_seen: SETNX-paттерн через Redis."""
from unittest.mock import AsyncMock, MagicMock

import pytest

from messenger.backend.core.last_seen import bump_last_seen


@pytest.mark.asyncio
async def test_first_call_acquires_and_updates(fake_redis):
    """Первый вызов: ключ свободен → SETNX успех → UPDATE last_seen."""
    session = MagicMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()

    await bump_last_seen(fake_redis, session, user_id=42)

    assert session.execute.call_count == 1
    assert session.commit.call_count == 1
    assert await fake_redis.get("user_active:42") == "1"


@pytest.mark.asyncio
async def test_second_call_within_ttl_skips(fake_redis):
    """Второй вызов до истечения TTL: SETNX fail → ничего не пишем."""
    await fake_redis.set("user_active:42", "1", ex=60)

    session = MagicMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()

    await bump_last_seen(fake_redis, session, user_id=42)

    assert session.execute.call_count == 0
    assert session.commit.call_count == 0


@pytest.mark.asyncio
async def test_redis_error_silent_skip(fake_redis):
    """Падение Redis не должно ломать вызывающий код."""
    from redis.exceptions import RedisError

    broken_redis = MagicMock()
    broken_redis.set = AsyncMock(side_effect=RedisError("boom"))

    session = MagicMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()

    await bump_last_seen(broken_redis, session, user_id=42)

    assert session.execute.call_count == 0
