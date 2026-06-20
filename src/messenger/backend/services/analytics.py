"""Pure async aggregations for the founder dashboard.

Каждая функция принимает session/redis как аргумент — тестируется на моках,
без глобалов. Никакого кеширования.
"""
from datetime import datetime, timedelta, timezone

from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.ws.presence import PRESENCE_KEY_PREFIX
from messenger.backend.models.chat import Chat
from messenger.backend.models.message import Message
from messenger.backend.models.push_subscription import PushSubscription
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


def _fmt_ru(n: int | float) -> str:
    """Russian locale formatting for thousand-separated ints."""
    if isinstance(n, float) and n != int(n):
        return f"{n:,.1f}".replace(",", " ").replace(".", ",")
    return f"{int(n):,}".replace(",", " ")


async def _kpi_with_deltas(
    session: AsyncSession, model_cls, ts_column, now: datetime
) -> dict:
    total = await _total(session, model_cls)
    deltas = {}
    counts = {}
    for window in (7, 30, 90):
        end = now
        mid = now - timedelta(days=window)
        start = now - timedelta(days=window * 2)
        cur = await _count_in_window(session, ts_column, mid, end)
        prev = await _count_in_window(session, ts_column, start, mid)
        deltas[str(window)] = pct_change(cur, prev)
        counts[window] = cur
    today = await _count_in_window(session, ts_column, now - timedelta(days=1), now)
    daily_avg = round(counts[30] / 30, 1) if counts[30] else 0
    details = [
        {"label": "Сегодня", "value": _fmt_ru(today)},
        {"label": "За 7 дней", "value": _fmt_ru(counts[7])},
        {"label": "За 30 дней", "value": _fmt_ru(counts[30])},
        {"label": "Ср. в день", "value": _fmt_ru(daily_avg)},
    ]
    return {"total": total, "deltas": deltas, "details": details}


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
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    dau_stmt = select(func.count()).where(User.last_seen >= day_ago)
    wau_stmt = select(func.count()).where(User.last_seen >= week_ago)
    mau_stmt = select(func.count()).where(User.last_seen >= month_ago)
    dau = (await session.execute(dau_stmt)).scalar() or 0
    wau = (await session.execute(wau_stmt)).scalar() or 0
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

    details = [
        {"label": "DAU", "value": _fmt_ru(dau)},
        {"label": "WAU", "value": _fmt_ru(wau)},
        {"label": "MAU", "value": _fmt_ru(mau)},
        {"label": "Stickiness", "value": f"{stickiness}%"},
    ]
    return {
        "value": dau, "mau": mau, "stickiness": stickiness,
        "deltas": deltas, "details": details,
    }


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


async def retention(session: AsyncSession, now: datetime | None = None) -> dict:
    """Rolling activity retention (честный прокси без event-логов).

    Для каждого окна N: из юзеров, зарегистрированных РАНЬШЕ чем N дней назад,
    какая доля была активна (last_seen) за последние N дней. Не строгая
    cohort-аналитика, но реальный показатель «возвращаемости» из имеющихся
    колонок created_at + last_seen.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    out: dict[str, float] = {}
    for n in (1, 7, 30):
        cutoff = now - timedelta(days=n)
        cohort = (
            await session.execute(
                select(func.count()).where(User.created_at < cutoff)
            )
        ).scalar() or 0
        if not cohort:
            out[f"d{n}"] = 0.0
            continue
        retained = (
            await session.execute(
                select(func.count()).where(
                    User.created_at < cutoff, User.last_seen >= cutoff
                )
            )
        ).scalar() or 0
        out[f"d{n}"] = round(retained / cohort * 100, 1)
    return out


async def funnel(session: AsyncSession, now: datetime | None = None) -> list[dict]:
    """Воронка: регистрация → написал сообщение → активен за 7 дней."""
    if now is None:
        now = datetime.now(timezone.utc)
    total = await _total(session, User)
    senders = (
        await session.execute(select(func.count(func.distinct(Message.sender_id))))
    ).scalar() or 0
    week_ago = now - timedelta(days=7)
    active = (
        await session.execute(select(func.count()).where(User.last_seen >= week_ago))
    ).scalar() or 0

    def pct(x: int) -> float:
        return round(x / total * 100, 1) if total else 0.0

    return [
        {"stage": "Регистрация", "count": total, "pct": 100.0 if total else 0.0},
        {"stage": "Написал сообщение", "count": senders, "pct": pct(senders)},
        {"stage": "Активен (7д)", "count": active, "pct": pct(active)},
    ]


async def recent_signups(session: AsyncSession, limit: int = 12) -> list[dict]:
    """Лента последних регистраций (username + время) для админ-фида.

    Приватность: только админ-видимая идентичность (как в списке юзеров) и
    время; НИКАКОГО содержимого сообщений.
    """
    stmt = (
        select(User.username, User.name, User.created_at)
        .order_by(User.created_at.desc())
        .limit(limit)
    )
    rows = (await session.execute(stmt)).all()
    return [
        {
            "type": "signup",
            "username": r[0],
            "name": r[1],
            "at": r[2].isoformat() if r[2] is not None else None,
        }
        for r in rows
    ]


async def breakdowns(session: AsyncSession) -> dict:
    """Агрегатные разбивки: типы сообщений, типы чатов, доля медиа/реплаев."""
    mt_rows = (
        await session.execute(
            select(Message.msg_type, func.count()).group_by(Message.msg_type)
        )
    ).all()
    msg_types = {(row[0] or "text"): row[1] for row in mt_rows}
    total_msgs = sum(msg_types.values())

    ct_rows = (
        await session.execute(
            select(Chat.chat_type, func.count()).group_by(Chat.chat_type)
        )
    ).all()
    chat_types = {(row[0] or "private"): row[1] for row in ct_rows}

    media = (
        await session.execute(
            select(func.count()).where(Message.attachment_key.isnot(None))
        )
    ).scalar() or 0
    replies = (
        await session.execute(
            select(func.count()).where(Message.reply_to_id.isnot(None))
        )
    ).scalar() or 0

    return {
        "msg_types": msg_types,
        "chat_types": chat_types,
        "media_pct": round(media / total_msgs * 100, 1) if total_msgs else 0.0,
        "reply_pct": round(replies / total_msgs * 100, 1) if total_msgs else 0.0,
    }


async def health(session: AsyncSession, redis: Redis) -> dict:
    """Состояние системы: доступность БД/Redis, флаг кэша, тоталы."""
    from messenger.backend.core.config import settings

    db_ok = True
    try:
        await session.execute(select(1))
    except Exception:  # noqa: BLE001
        db_ok = False
    redis_ok = True
    try:
        await redis.ping()
    except Exception:  # noqa: BLE001
        redis_ok = False
    total_users = await _total(session, User)
    # Users who enabled push notifications = distinct users with at least one
    # subscription (a user can register several devices/browsers).
    notif_users = (
        await session.execute(
            select(func.count(func.distinct(PushSubscription.user_id)))
        )
    ).scalar() or 0
    notif_pct = round(notif_users / total_users * 100, 1) if total_users else 0.0
    return {
        "db_ok": db_ok,
        "redis_ok": redis_ok,
        "cache_enabled": bool(settings.cache_data_enabled),
        "users": total_users,
        "messages": await _total(session, Message),
        "chats": await _total(session, Chat),
        "notif_users": notif_users,
        "notif_pct": notif_pct,
    }
