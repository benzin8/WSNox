from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.schemas.user import (
    AuthResponse,
    EmailRequest,
    EmailVerify,
    UserCreate,
    UserLogin,
    UserResponse,
)
from messenger.backend.app.crud.user import UserCRUD
from messenger.backend.core.redis import get_redis
from messenger.backend.core.security import create_pair_jwt_tokens, verify_password
from messenger.backend.db.session import get_db_session
from messenger.backend.services.verification import send_verification_code, verify_code

auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/send-code")
async def send_code(data: EmailRequest):
    await send_verification_code(data.email)
    return {"message": True}


@auth_router.post("/verify-code")
async def verify_sms(data: EmailVerify, db: AsyncSession = Depends(get_db_session)):
    is_valid = await verify_code(data.email, data.code)
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid code")

    user = await UserCRUD.get_user_by_email(db, data.email)
    redis = get_redis()
    if user:
        await redis.setex(f"verified_for_login:{data.email}", 300, "true")
        return {
            "status": "need_password",
            "message": "Email verified. Please enter your password."
        }
    else:
        await redis.setex(f"verified_for_reg:{data.email}", 600, "true")
        return {
            "status": "register",
            "message": "Email verified. Please register."
        }


@auth_router.post("/register", response_model=AuthResponse)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db_session)):
    redis = get_redis()
    verified = await redis.get(f"verified_for_reg:{data.email}")
    if not verified:
        raise HTTPException(status_code=400, detail="Email not verified")

    user = await UserCRUD.create_user(db, data, data.password)
    if not user:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    tokens = create_pair_jwt_tokens(user.id)
    await redis.delete(f"verified_for_reg:{data.email}")
    return {
        "status": "success",
        "user": UserResponse.model_validate(user),
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "token_type": "bearer"
    }


@auth_router.post("/login", response_model=AuthResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db_session)):
    redis = get_redis()
    verified = await redis.get(f"verified_for_login:{data.email}")
    if not verified:
        raise HTTPException(status_code=400, detail="Email not verified")

    user = await UserCRUD.login_user(db, data.email, data.password)
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid email or password")

    tokens = create_pair_jwt_tokens(user.id)
    await redis.delete(f"verified_for_login:{data.email}")
    return {
        "status": "success",
        "user": UserResponse.model_validate(user),
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "token_type": "bearer"
    }
