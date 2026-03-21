from datetime import datetime, timedelta, timezone
from jose import jwt
from messenger.backend.core.config import settings
from passlib.context import CryptContext

SECRET_KEY = settings.secret_key
ALGORITHM = settings.algorithm

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password:str) -> str:
    return pwd_context.hash(password)

def verify_password(password:str, hashed_password:str) -> bool:
    return pwd_context.verify(password, hashed_password)

def create_token(data: dict, expires_delta: timedelta, is_refresh: bool = False):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire, "type": "access" if not is_refresh else "refresh"})

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_pair_jwt_tokens(user_id: int):
    access = create_token({"sub": str(user_id)}, timedelta(minutes=30))
    refresh = create_token({"sub": str(user_id)}, timedelta(days=7), is_refresh=True)
    
    return {"access": access, "refresh": refresh}