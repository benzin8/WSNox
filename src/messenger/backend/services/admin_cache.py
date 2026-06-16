"""Кэш admin-дашборда: тяжёлый stats-блок (TTL 60) и live-блок (TTL 12).

stats бакетится по UTC-дате (KPI без посекундного now), иначе hit-rate ~0%.
Прогрев фоновой задачей в lifespan с single-flight против thundering-herd.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Awaitable, Callable

from redis.asyncio import Redis

from messenger.backend.core.cache import (
    ADMIN_LIVE_TTL,
    ADMIN_STATS_TTL,
    admin_live,
    admin_stats,
    cached,
)

logger = logging.getLogger(__name__)


def bucketed_utc_now(now: datetime | None = None) -> datetime:
    """now, обрезанный до начала UTC-суток — стабильный «now» для серий/KPI."""
    if now is None:
        now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)


async def get_dashboard_stats_cached(
    redis: Redis, loader: Callable[[], Awaitable[dict]]
) -> dict:
    """Read-through cache тяжёлого DashboardStats-блока. Fail-open через cached()."""
    return await cached(redis, admin_stats(), ADMIN_STATS_TTL, loader)


async def get_live_block_cached(
    redis: Redis, loader: Callable[[], Awaitable[dict]]
) -> dict:
    """Read-through cache live-блока (короткий TTL, держим свежим)."""
    return await cached(redis, admin_live(), ADMIN_LIVE_TTL, loader)


async def warm_admin_stats_forever(
    redis: Redis, loader: Callable[[], Awaitable[dict]], interval: int = ADMIN_STATS_TTL
) -> None:
    """Фоновый прогрев admin:stats. Single-flight: только один воркер пересчитывает.

    Используем SET NX с TTL как лок: если лок не взяли — кто-то уже греет, спим.
    """
    lock_key = "cache:admin:stats:warm_lock"
    while True:
        try:
            got = await redis.set(lock_key, "1", ex=interval, nx=True)
            if got:
                value = await loader()
                await redis.set(admin_stats(), json.dumps(value), ex=ADMIN_STATS_TTL)
        except Exception:  # noqa: BLE001
            logger.exception("warm_admin_stats_forever iteration failed")
        await asyncio.sleep(interval)
