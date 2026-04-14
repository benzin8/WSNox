import bcrypt
import hashlib
import bcrypt
from pydantic.networks import import_email_validator
from datetime import datetime, timedelta, timezone
from jose import jwt
from passlib.context import CryptContext


from messenger.backend.core.config import settings


SECRET_KEY = settings.secret_key
ALGORITHM = settings.algorithm


def hash_password(password:str) -> str:
   pass_hash = hashlib.sha256(password.encode()).digest()
   salt = bcrypt.gensalt()
   hashed = bcrypt.hashpw(pass_hash, salt)

   return hashed.decode('utf-8')

def verify_password(password:str, hashed_password:str) -> bool:
    pass_hash = hashlib.sha256(password.encode()).digest()
    return bcrypt.checkpw(pass_hash, hashed_password.encode('utf-8'))

def create_token(data: dict, expires_delta: timedelta, is_refresh: bool = False):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire, "type": "access" if not is_refresh else "refresh"})

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_pair_jwt_tokens(user_id: int):
    access = create_token({"sub": str(user_id)}, timedelta(days=30))
    refresh = create_token({"sub": str(user_id)}, timedelta(days=7), is_refresh=True)
    
    return {"access_token": access, "refresh_token": refresh}