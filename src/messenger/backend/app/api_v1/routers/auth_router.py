from messenger.backend.core.redis import get_redis
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from messenger.backend.db.session import get_db_session
from messenger.backend.services.verification import send_verification_code, verify_code
from messenger.backend.app.api_v1.schemas.user import PhoneVerify, PhoneNumberRequest
from messenger.backend.app.crud.user import UserCRUD
from messenger.backend.core.security import hash_password, verify_password, create_pair_jwt_tokens

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
    if user:
        tokens = create_pair_jwt_tokens(user.id)
        return {
            "status": "login",
            "is_new_user": False,
            **tokens,
            "user": user
            }
    else:
        redis = get_redis()
        await redis.setex(f"verifed_for_reg:{data.phone_number}", 600, "true")
        return {
            "status": "register",
            "is_new_user": True,
            "message": "Phone number verified. Please register."
            }
        
 
@auth_router.post("/register")
async def register(name: str, username: str, password: str):
    hashed_password = hash_password(password)
    pass
    
@auth_router.get("/login")
async def login(db: AsyncSession = Depends(get_db_session)):
    pass
