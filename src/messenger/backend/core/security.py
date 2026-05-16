from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt

from messenger.backend.core.config import settings

SECRET_KEY = settings.secret_key
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

def create_pair_jwt_tokens(user_id: int):
    access = create_token({"sub": str(user_id)}, timedelta(days=30))
    refresh = create_token({"sub": str(user_id)}, timedelta(days=7), is_refresh=True)
    
    return {"access_token": access, "refresh_token": refresh}