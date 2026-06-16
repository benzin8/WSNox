"""Ядро слоя кэширования WSNox.

Единственная точка входа для read-through кэша поверх Redis. Все принципы из
дизайна:
- fail-open: любая ошибка Redis или выключенный kill-switch → исходный loader;
- сериализация только JSON (клиент с decode_responses=True отдаёт str);
- redis передаётся аргументом (тесты на fakeredis), get_redis() на импорте не зовём;
- здесь же централизованы builders ключей и TTL — magic-числа больше нигде.
"""
import json
from typing import Awaitable, Callable, TypeVar

from redis.asyncio import Redis
from redis.exceptions import RedisError

from messenger.backend.core.config import settings

T = TypeVar("T")


async def cached(
    redis: Redis,
    key: str,
    ttl: int,
    loader: Callable[[], Awaitable[T]],
    *,
    dumps=json.dumps,
    loads=json.loads,
) -> T:
    """Read-through кэш. Fail-open: kill-switch off ИЛИ любой RedisError → loader()."""
    if not settings.cache_data_enabled:
        return await loader()
    try:
        raw = await redis.get(key)
    except RedisError:
        return await loader()
    if raw is not None:
        return loads(raw)
    value = await loader()
    try:
        await redis.set(key, dumps(value), ex=ttl)
    except RedisError:
        pass
    return value


async def invalidate(redis: Redis, *keys: str) -> None:
    """DEL ключей. Fail-open: глушим RedisError. No-op, если ключей нет."""
    if not keys:
        return
    try:
        await redis.delete(*keys)
    except RedisError:
        pass


# --- TTL (секунды) -----------------------------------------------------------
USER_AUTH_TTL = 60
NOTIF_PREF_TTL = 600
PUSH_SUBS_TTL = 1800
PARTNERS_TTL = 600
MEMBERS_TTL = 3600
PREFS_TTL = 300
UNREAD_TTL = 300
CHATLIST_TTL = 90
AVATAR_URL_TTL = 3000  # строго < PRESIGN_TTL (3600), иначе клиент получит истёкший URL
ADMIN_STATS_TTL = 60
ADMIN_LIVE_TTL = 12


# --- Builders ключей (всё под префиксом cache:*) -----------------------------
def user_auth(uid: int) -> str:
    return f"cache:user:auth:{uid}"


def notif_dnd(uid: int) -> str:
    return f"cache:notif:dnd:{uid}"


def notif_muted(uid: int) -> str:
    return f"cache:notif:muted:{uid}"


def push_subs(uid: int) -> str:
    return f"cache:push:subs:{uid}"


def chat_partners(uid: int) -> str:
    return f"cache:chat_partners:{uid}"


def members(chat_id: int) -> str:
    return f"cache:members:{chat_id}"


def chats_of(uid: int) -> str:
    return f"cache:chats_of:{uid}"


def prefs_rr(uid: int) -> str:
    return f"cache:prefs:rr:{uid}"


def unread_total(uid: int) -> str:
    return f"cache:unread:total:{uid}"


def chats_unread(uid: int) -> str:
    return f"cache:chats:unread:{uid}"


def chatlist(uid: int) -> str:
    return f"cache:chatlist:{uid}"


def avatar_url(s3_key: str) -> str:
    return f"cache:avatar_urls:{s3_key}"


def admin_stats() -> str:
    return "cache:admin:stats"


def admin_live() -> str:
    return "cache:admin:live"
