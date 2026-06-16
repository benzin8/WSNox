"""Тесты раздельных функций last_seen: слот через SETNX отдельно от записи."""
from unittest.mock import AsyncMock, MagicMock

import pytest
from redis.exceptions import RedisError

from messenger.backend.core.last_seen import (
    acquire_last_seen_slot,
    write_last_seen,
)


@pytest.mark.asyncio
async def test_acquire_returns_true_when_free(fake_redis):
    """Свободный ключ → SETNX успех → True, ключ выставлен."""
    acquired = await acquire_last_seen_slot(fake_redis, user_id=42)

    assert acquired is True
    assert await fake_redis.get("user_active:42") == "1"


@pytest.mark.asyncio
async def test_acquire_returns_false_when_taken(fake_redis):
    """Занятый ключ → SETNX fail → False."""
    await fake_redis.set("user_active:42", "1", ex=60)

    acquired = await acquire_last_seen_slot(fake_redis, user_id=42)

    assert acquired is False


@pytest.mark.asyncio
async def test_acquire_redis_error_returns_false(fake_redis):
    """RedisError → False (fail-open: пропускаем запись, наружу не падаем)."""
    broken = MagicMock()
    broken.set = AsyncMock(side_effect=RedisError("boom"))

    acquired = await acquire_last_seen_slot(broken, user_id=42)

    assert acquired is False


@pytest.mark.asyncio
async def test_write_executes_update_and_commits():
    """write_last_seen делает UPDATE + commit."""
    session = MagicMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()

    await write_last_seen(session, user_id=42)

    assert session.execute.call_count == 1
    assert session.commit.call_count == 1


@pytest.mark.asyncio
async def test_write_rolls_back_on_db_error():
    """Ошибка БД глушится через rollback, наружу не летит."""
    from sqlalchemy.exc import SQLAlchemyError

    session = MagicMock()
    session.execute = AsyncMock(side_effect=SQLAlchemyError("boom"))
    session.commit = AsyncMock()
    session.rollback = AsyncMock()

    await write_last_seen(session, user_id=42)  # must not raise

    assert session.rollback.call_count == 1
