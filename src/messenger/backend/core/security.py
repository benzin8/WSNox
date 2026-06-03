from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt

from messenger.backend.core.config import settings

SECRET_KEY = settings.jwt_secret_key or settings.secret_key
ALGORITHM = settings.algorithm


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_token(data: dict, expires_delta: timedelta, is_refresh: bool = False):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire, "type": "access" if not is_refresh else "refresh"})

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=7)


def create_access_token(user_id: int) -> str:
    return create_token({"sub": str(user_id)}, ACCESS_TTL)


def create_refresh_token(user_id: int) -> str:
    return create_token({"sub": str(user_id)}, REFRESH_TTL, is_refresh=True)


def create_pair_jwt_tokens(user_id: int):
    return {
        "access_token": create_access_token(user_id),
        "refresh_token": create_refresh_token(user_id),
    }


def decode_token(token: str, expected_type: str) -> int | None:
    """Decode a JWT, enforce its `type`, and return the int user id.

    Returns None on any failure (bad signature, wrong type, expired,
    missing/non-int sub). Pure — no DB access.
    """
    from jose import JWTError

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    sub = payload.get("sub")
    if sub is None:
        return None
    try:
        return int(sub)
    except (ValueError, TypeError):
        return None