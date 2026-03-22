from messenger.backend.app.api_v1.schemas.user import UserCreate, UserLogin, UserResponse, AuthResponse
from messenger.backend.core.redis import get_redis
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from messenger.backend.db.session import get_db_session
from messenger.backend.services.verification import send_verification_code, verify_code
from messenger.backend.app.api_v1.schemas.user import PhoneVerify, PhoneNumberRequest
from messenger.backend.app.crud.user import UserCRUD
from messenger.backend.core.security import verify_password, create_pair_jwt_tokens

auth_router = APIRouter(prefix="/auth", tags=["auth"])

@auth_router.post("/send-code")
async def send_code(data: PhoneNumberRequest):
    await send_verification_code(data.phone_number)
    return {"message": True}

@auth_router.post("/verify-code")
async def verify_sms(data: PhoneVerify, db: AsyncSession = Depends(get_db_session)):
    is_valid = await verify_code(data.phone_number, data.code)
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid code")
    
    user = await UserCRUD.get_user_by_phone(db, data.phone_number)
    redis = get_redis()
    if user:
        await redis.setex(f"verifed_for_login:{data.phone_number}", 300, "true")
        return {
            "status": "need_password",
            "message": "SMS verified. Please enter your password."
        }
    else:
        await redis.setex(f"verifed_for_reg:{data.phone_number}", 600, "true")
        return {
            "status": "register",
            "message": "Phone number verified. Please register."
            }
        
 
@auth_router.post("/register", response_model=AuthResponse)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db_session)):
    redis = get_redis()

    verifed_number = await redis.get(f"verifed_for_reg:{data.phone_number}")
    if not verifed_number:
        raise HTTPException(status_code=400, detail="Phone number not verified")

    user = await UserCRUD.create_user(db, data, data.password)
    if not user:
        raise HTTPException(status_code=400, detail="User with this phone number already exists")

    tokens = create_pair_jwt_tokens(user.id)
    await redis.delete(f"verifed_for_reg:{data.phone_number}")
    return {
        "status": "success",
        "user": UserResponse.model_validate(user),
        **tokens
    }
    
@auth_router.post("/login", response_model=AuthResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db_session)):
    redis = get_redis()
    
    verifed_number = await redis.get(f"verifed_for_login:{data.phone_number}")
    if not verifed_number:
        raise HTTPException(status_code=400, detail="Phone number not verified")

    user = await UserCRUD.login_user(db, data.phone_number, data.password)
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid phone number or password")

    tokens = create_pair_jwt_tokens(user.id)
    await redis.delete(f"verifed_for_login:{data.phone_number}")
    return {
        "status": "success",
        "user": UserResponse.model_validate(user),
        **tokens
    }