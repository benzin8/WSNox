import asyncio
import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.core.config import settings
from messenger.backend.core.last_seen import acquire_last_seen_slot, write_last_seen
from messenger.backend.core.redis import get_redis
from messenger.backend.db import get_db_session
from messenger.backend.db.session import AsyncSessionLocal
from messenger.backend.models import User

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


async def get_user_from_token(token: str, db: AsyncSession) -> User | None:
    """Decode a JWT and return the matching User, or None on any failure.

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

    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_current_user(
    auth: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db_session)
) -> User:
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

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    # Fire-and-forget telemetry — не блокирует respond
    asyncio.create_task(_bump_last_seen_bg(user.id))
    return user


async def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """Гейт для /api/admin/* — 403 если не админ."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
