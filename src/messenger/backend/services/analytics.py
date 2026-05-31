"""Pure async aggregations for the founder dashboard.

Каждая функция принимает session/redis как аргумент — тестируется на моках,
без глобалов. Никакого кеширования.
"""
from datetime import datetime, timedelta, timezone

from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.ws.presence import PRESENCE_KEY_PREFIX
from messenger.backend.models.message import Message
from messenger.backend.models.user import User

DAYS_HISTORY = 90


def pct_change(a: int | float, b: int | float) -> float:
    """Процентное изменение a относительно b. При b==0 возвращает 0.0."""
    if b == 0:
        return 0.0
    return round((a - b) / b * 100, 1)


def labels_series(now: datetime | None = None) -> list[str]:
    """90 подряд идущих дат '{day}.{month}', от now-89d до now включительно (UTC)."""
    if now is None:
        now = datetime.now(timezone.utc)
    today = now.date()
    return [
        f"{(today - timedelta(days=DAYS_HISTORY - 1 - i)).day}."
        f"{(today - timedelta(days=DAYS_HISTORY - 1 - i)).month}"
        for i in range(DAYS_HISTORY)
    ]


async def _count_by_day(
    session: AsyncSession,
    ts_column,
    now: datetime,
) -> list[int]:
    """GROUP BY day для произвольного timestamp-столбца, паддинг нулями до 90 дней."""
    today = now.date()
    start = datetime.combine(
        today - timedelta(days=DAYS_HISTORY - 1),
        datetime.min.time(),
        tzinfo=timezone.utc,
    )
    stmt = (
        select(func.date(ts_column).label("d"), func.count().label("c"))
        .where(ts_column >= start)
        .group_by(func.date(ts_column))
    )
    result = await session.execute(stmt)
    by_date = {row[0]: row[1] for row in result.all()}
    return [
        by_date.get(today - timedelta(days=DAYS_HISTORY - 1 - i), 0)
        for i in range(DAYS_HISTORY)
    ]


async def reg_series(session: AsyncSession, now: datetime | None = None) -> list[int]:
    """Регистраций в день за последние 90 дней (старое → новое)."""
    if now is None:
        now = datetime.now(timezone.utc)
    return await _count_by_day(session, User.created_at, now)


async def msg_series(session: AsyncSession, now: datetime | None = None) -> list[int]:
    """Сообщений в день за последние 90 дней (старое → новое)."""
    if now is None:
        now = datetime.now(timezone.utc)
    return await _count_by_day(session, Message.created_at, now)


async def dau_series(session: AsyncSession, now: datetime | None = None) -> list[int]:
    """DAU-серия по дням (юзеры с last_seen в этот день).

    Caveat: до того, как last_seen накопится за 90 дней — ранние значения будут 0.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    return await _count_by_day(session, User.last_seen, now)


async def _count_in_window(
    session: AsyncSession, ts_column, start: datetime, end: datetime
) -> int:
    stmt = select(func.count()).where(ts_column >= start, ts_column < end)
    result = await session.execute(stmt)
    return result.scalar() or 0


async def _total(session: AsyncSession, model_cls) -> int:
    result = await session.execute(select(func.count()).select_from(model_cls))
    return result.scalar() or 0


async def _kpi_with_deltas(
    session: AsyncSession, model_cls, ts_column, now: datetime
) -> dict:
    total = await _total(session, model_cls)
    deltas = {}
    for window in (7, 30, 90):
        end = now
        mid = now - timedelta(days=window)
        start = now - timedelta(days=window * 2)
        cur = await _count_in_window(session, ts_column, mid, end)
        prev = await _count_in_window(session, ts_column, start, mid)
        deltas[str(window)] = pct_change(cur, prev)
    return {"total": total, "deltas": deltas}


async def kpi_users(session: AsyncSession, now: datetime | None = None) -> dict:
    if now is None:
        now = datetime.now(timezone.utc)
    return await _kpi_with_deltas(session, User, User.created_at, now)


async def kpi_msgs(session: AsyncSession, now: datetime | None = None) -> dict:
    if now is None:
        now = datetime.now(timezone.utc)
    return await _kpi_with_deltas(session, Message, Message.created_at, now)


async def kpi_dau(session: AsyncSession, now: datetime | None = None) -> dict:
    """DAU/MAU/stickiness через users.last_seen."""
    if now is None:
        now = datetime.now(timezone.utc)
    day_ago = now - timedelta(days=1)
    month_ago = now - timedelta(days=30)

    dau_stmt = select(func.count()).where(User.last_seen >= day_ago)
    mau_stmt = select(func.count()).where(User.last_seen >= month_ago)
    dau = (await session.execute(dau_stmt)).scalar() or 0
    mau = (await session.execute(mau_stmt)).scalar() or 0
    stickiness = round(dau / mau * 100, 1) if mau else 0.0

    deltas = {}
    for window in (7, 30, 90):
        end = now
        mid = now - timedelta(days=window)
        start = now - timedelta(days=window * 2)
        cur = await _count_in_window(session, User.last_seen, mid, end)
        prev = await _count_in_window(session, User.last_seen, start, mid)
        deltas[str(window)] = pct_change(cur, prev)

    return {"value": dau, "mau": mau, "stickiness": stickiness, "deltas": deltas}


async def live_online(redis: Redis) -> int:
    """Кол-во ключей presence:* через SCAN (НЕ KEYS — KEYS блокирует Redis)."""
    count = 0
    async for _ in redis.scan_iter(match=f"{PRESENCE_KEY_PREFIX}*", count=500):
        count += 1
    return count


async def live_msgs_per_min(session: AsyncSession, now: datetime | None = None) -> int:
    """Кол-во сообщений за последние 60 секунд."""
    if now is None:
        now = datetime.now(timezone.utc)
    minute_ago = now - timedelta(seconds=60)
    stmt = select(func.count()).where(Message.created_at >= minute_ago)
    result = await session.execute(stmt)
    return result.scalar() or 0
