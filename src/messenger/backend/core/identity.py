"""Лёгкий сериализуемый снимок личности пользователя для identity-кэша.

CachedUser НЕ ORM-instance и НЕ dict: это frozen-dataclass, отдающий ровно тот
набор атрибутов, который читают call-site'ы (`current_user.*`). hashed_password
сюда НЕ кладётся — он читается только со свежей ORM-строки в change-password.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.core.cache import USER_AUTH_TTL, user_auth
from messenger.backend.core.config import settings
from messenger.backend.models.user import User


@dataclass(frozen=True)
class CachedUser:
    id: int
    is_admin: bool
    username: str
    name: str
    email: str
    phone_number: Optional[str]
    created_at: Optional[datetime]
    last_seen: Optional[datetime]

    @classmethod
    def from_orm(cls, user: User) -> "CachedUser":
        """Построить снимок из ORM-строки User."""
        return cls(
            id=user.id,
            is_admin=bool(user.is_admin),
            username=user.username,
            name=user.name,
            email=user.email,
            phone_number=user.phone_number,
            created_at=user.created_at,
            last_seen=user.last_seen,
        )

    def to_dict(self) -> dict:
        """JSON-safe dict (datetime -> ISO-строка) для json.dumps."""
        return {
            "id": self.id,
            "is_admin": self.is_admin,
            "username": self.username,
            "name": self.name,
            "email": self.email,
            "phone_number": self.phone_number,
            "created_at": self.created_at.isoformat() if self.created_at is not None else None,
            "last_seen": self.last_seen.isoformat() if self.last_seen is not None else None,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "CachedUser":
        """Восстановить снимок из dict (после json.loads)."""
        created_at = data.get("created_at")
        last_seen = data.get("last_seen")
        return cls(
            id=data["id"],
            is_admin=data["is_admin"],
            username=data["username"],
            name=data["name"],
            email=data["email"],
            phone_number=data.get("phone_number"),
            created_at=datetime.fromisoformat(created_at) if created_at is not None else None,
            last_seen=datetime.fromisoformat(last_seen) if last_seen is not None else None,
        )


async def get_cached_user(redis: Redis, db: AsyncSession, user_id: int) -> Optional[CachedUser]:
    """Read-through identity-кэш. Хит -> CachedUser из Redis.
    Промах -> SELECT User, снимок, SETEX. Несуществующий юзер -> None, НЕ кэшируем.
    Fail-open: kill-switch off ИЛИ любой RedisError -> идём прямо в БД."""

    async def _load() -> Optional[CachedUser]:
        result = await db.execute(select(User).where(User.id == user_id))
        row = result.scalar_one_or_none()
        return CachedUser.from_orm(row) if row is not None else None

    if not settings.cache_data_enabled:
        return await _load()

    key = user_auth(user_id)
    try:
        raw = await redis.get(key)
    except RedisError:
        return await _load()
    if raw is not None:
        return CachedUser.from_dict(json.loads(raw))

    snap = await _load()
    if snap is None:
        return None  # отсутствие НЕ кэшируем (не отравляем ключ)
    try:
        await redis.set(key, json.dumps(snap.to_dict()), ex=USER_AUTH_TTL)
    except RedisError:
        pass
    return snap
