"""Presigned-URL resolver for avatar payloads stored in profiles.avatar JSONB."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from redis.asyncio import Redis

from messenger.backend.services.storage import S3Storage

PRESIGN_TTL = 3600  # 1 hour


@dataclass(frozen=True)
class AvatarUrls:
    full: Optional[str]
    thumb: Optional[str]
    uploaded_at: Optional[str]


async def _presign_cached(
    storage: S3Storage, redis: Optional[Redis], key: str
) -> str:
    """Presign по иммутабельному S3-ключу с кэшем cache:avatar_urls:{key}.

    redis=None → без кэша (back-compat). Никогда не кэширует None: вызывается
    только когда key реальный, а storage гарантированно есть.
    """
    if redis is None:
        return await storage.presigned_get(key, expires_in=PRESIGN_TTL)
    # Локальный импорт во избежание цикла (тесты импортируют PRESIGN_TTL отсюда).
    from messenger.backend.core.cache import AVATAR_URL_TTL, avatar_url, cached

    async def _loader() -> str:
        return await storage.presigned_get(key, expires_in=PRESIGN_TTL)

    return await cached(
        redis,
        avatar_url(key),
        AVATAR_URL_TTL,
        _loader,
        dumps=lambda s: s,   # значение уже строка-URL, JSON-обёртка не нужна
        loads=lambda s: s,
    )


async def resolve_avatar_thumb_url(
    storage: Optional[S3Storage], redis: Optional[Redis], thumb_key: Optional[str]
) -> Optional[str]:
    """Thumb-only путь (большинство call site'ов берут только thumb).

    Сохраняет guard'ы: storage=None или пустой ключ → None (не кэшируем None).
    """
    if not storage or not thumb_key:
        return None
    return await _presign_cached(storage, redis, thumb_key)


async def resolve_avatar_urls(
    storage: Optional[S3Storage],
    avatar: Optional[dict],
    *,
    redis: Optional[Redis] = None,
) -> AvatarUrls:
    if not storage or not avatar:
        return AvatarUrls(full=None, thumb=None, uploaded_at=None)
    full_key = avatar.get("full_key")
    thumb_key = avatar.get("thumb_key")
    if not full_key or not thumb_key:
        return AvatarUrls(full=None, thumb=None, uploaded_at=None)
    full = await _presign_cached(storage, redis, full_key)
    thumb = await _presign_cached(storage, redis, thumb_key)
    return AvatarUrls(full=full, thumb=thumb, uploaded_at=avatar.get("uploaded_at"))
