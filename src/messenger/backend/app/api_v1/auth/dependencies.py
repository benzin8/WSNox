import asyncio
import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.core.config import settings
from messenger.backend.core.identity import CachedUser, get_cached_user
from messenger.backend.core.last_seen import acquire_last_seen_slot, write_last_seen
from messenger.backend.core.redis import get_redis
from messenger.backend.db import get_db_session
from messenger.backend.db.session import AsyncSessionLocal

bearer_scheme = HTTPBearer()
logger = logging.getLogger(__name__)


async def _bump_last_seen_bg(user_id: int) -> None:
    """Фоновая задача: слот через SETNX ДО открытия сессии. Без exception'ов наружу."""
    try:
        redis = get_redis()
        if not await acquire_last_seen_slot(redis, user_id):
            return  # троттл не пройден — сессию вообще не открываем
        async with AsyncSessionLocal() as session:
            await write_last_seen(session, user_id)
    except Exception:  # noqa: BLE001 — это телеметрия
        logger.debug("bump_last_seen failed", exc_info=True)


async def get_user_from_token(token: str, db: AsyncSession) -> CachedUser | None:
    """Decode a JWT and return the matching user snapshot, or None on any failure.

    Used by both the HTTP `get_current_user` dependency and the WebSocket
    handler, which can't depend on FastAPI's HTTPBearer flow.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = payload.get("sub")
        if user_id is None:
            return None
        user_id = int(user_id)
    except (JWTError, ValueError, TypeError):
        return None

    redis = get_redis()
    return await get_cached_user(redis, db, user_id)


async def get_current_user(
    auth: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db_session)
) -> CachedUser:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Сессия истекла, войдите снова",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(auth.credentials, settings.secret_key, algorithms=[settings.algorithm])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        user_id = int(user_id)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Срок действия токена истек",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise credentials_exception
    except Exception:
        raise credentials_exception

    redis = get_redis()
    user = await get_cached_user(redis, db, user_id)

    if user is None:
        raise credentials_exception
    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт заблокирован",
        )

    # Fire-and-forget telemetry — не блокирует respond
    asyncio.create_task(_bump_last_seen_bg(user.id))
    return user


async def get_current_admin(current_user: CachedUser = Depends(get_current_user)) -> CachedUser:
    """Гейт «есть админ-доступ» — 403 если роль не admin/owner (is_admin)."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нужны права администратора",
        )
    return current_user


def require_permission(permission: str):
    """Зависимость-фабрика: 403, если у роли текущего юзера нет permission.

    Использование: `_=Depends(require_permission(PERM_VIEW_DASHBOARD))`.
    """
    async def _dep(current_user: CachedUser = Depends(get_current_user)) -> CachedUser:
        if not current_user.has(permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав",
            )
        return current_user

    return _dep
