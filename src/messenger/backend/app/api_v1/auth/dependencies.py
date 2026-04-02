from typing import Dict
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from jose import JWTError, jwt

from messenger.backend.core.config import settings
from messenger.backend.db import get_db_session
from messenger.backend.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(
    tokens: Dict[str, str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db_session)
) -> User:
    print("Tokens: ", jwt.decode(tokens, settings.secret_key, algorithms=[settings.algorithm]))
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Сессия истекла, войдите снова",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(tokens, settings.secret_key, algorithms=[settings.algorithm])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except:
        raise credentials_exception
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception
    return user