from datetime import datetime, timedelta, timezone
from jose import jwt
from messenger.backend.config import settings

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM

def create_token(data: dict, expires_delta: timedelta, is_refresh: bool = False):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire, "type": "access" if not is_refresh else "refresh"})

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_pair_jwt_tokens(user_id: int):
    access = create_token({"sub": str(user_id)}, timedelta(minutes=30))
    refresh = create_token({"sub": str(user_id)}, timedelta(days=7), is_refresh=True)
    
    return {"access": access, "refresh": refresh}
