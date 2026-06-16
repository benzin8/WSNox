from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.schemas.user import (
    AuthResponse,
    EmailRequest,
    EmailVerify,
    ForgotPasswordRequest,
    LogoutRequest,
    RefreshRequest,
    ResetPasswordRequest,
    UserCreate,
    UserLogin,
    UserResponse,
)
from messenger.backend.app.crud.user import UserCRUD
from messenger.backend.core.cookies import (
    clear_refresh_cookie,
    refresh_cookie_name,
    set_refresh_cookie,
)
from messenger.backend.core.rate_limit import (
    rate_limit_login,
    rate_limit_refresh,
    rate_limit_send_code,
)
from messenger.backend.core.redis import get_redis
from messenger.backend.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from messenger.backend.db.session import get_db_session
from messenger.backend.services.verification import (
    consume_password_reset_token,
    create_password_reset_token,
    send_password_reset_email,
    send_verification_code,
    verify_code,
)

auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/send-code", dependencies=[Depends(rate_limit_send_code)])
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
async def register(data: UserCreate, response: Response, db: AsyncSession = Depends(get_db_session)):
    redis = get_redis()
    verified = await redis.get(f"verified_for_reg:{data.email}")
    if not verified:
        raise HTTPException(status_code=400, detail="Email not verified")

    user = await UserCRUD.create_user(db, data, data.password)
    if not user:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    set_refresh_cookie(response, user.id, create_refresh_token(user.id))
    await redis.delete(f"verified_for_reg:{data.email}")
    return {
        "status": "success",
        "user": UserResponse.model_validate(user),
        "access_token": create_access_token(user.id),
        "token_type": "bearer"
    }


@auth_router.post("/forgot-password", dependencies=[Depends(rate_limit_send_code)])
async def forgot_password(
    data: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """Send a reset link if the email belongs to a real account.

    Always returns 200 with `{ok: true}` to avoid leaking which emails are
    registered.
    """
    user = await UserCRUD.get_user_by_email(db, data.email)
    if user:
        token = await create_password_reset_token(data.email)
        await send_password_reset_email(data.email, token)
    return {"ok": True}


@auth_router.post("/reset-password", response_model=AuthResponse)
async def reset_password(
    data: ResetPasswordRequest,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
):
    email = await consume_password_reset_token(data.token)
    if not email:
        raise HTTPException(status_code=400, detail="Ссылка недействительна или истекла")

    user = await UserCRUD.get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=400, detail="Аккаунт не найден")

    await UserCRUD.set_password(db, user, data.password, redis=get_redis())

    set_refresh_cookie(response, user.id, create_refresh_token(user.id))
    return {
        "status": "success",
        "user": UserResponse.model_validate(user),
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
    }


@auth_router.post("/login", response_model=AuthResponse, dependencies=[Depends(rate_limit_login)])
async def login(data: UserLogin, response: Response, db: AsyncSession = Depends(get_db_session)):
    redis = get_redis()
    verified = await redis.get(f"verified_for_login:{data.email}")
    if not verified:
        raise HTTPException(status_code=400, detail="Email not verified")

    user = await UserCRUD.login_user(db, data.email, data.password)
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid email or password")

    set_refresh_cookie(response, user.id, create_refresh_token(user.id))
    await redis.delete(f"verified_for_login:{data.email}")
    return {
        "status": "success",
        "user": UserResponse.model_validate(user),
        "access_token": create_access_token(user.id),
        "token_type": "bearer"
    }


@auth_router.post("/refresh", dependencies=[Depends(rate_limit_refresh)])
async def refresh_tokens(
    data: RefreshRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
):
    """Mint a fresh access token for `data.user_id`.

    The refresh token is read from the httpOnly cookie `refresh_<user_id>`.
    For migrating pre-cookie sessions, a legacy `refresh_token` may be supplied
    in the body; if so (and no cookie yet), it is validated and the cookie is set.
    """
    cookie_token = request.cookies.get(refresh_cookie_name(data.user_id))
    token = cookie_token or data.refresh_token
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")

    token_user_id = decode_token(token, expected_type="refresh")
    # The token must be valid AND belong to the requested account.
    if token_user_id is None or token_user_id != data.user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = await UserCRUD.get_user_by_id(db, token_user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    # Re-affirm the cookie (sets it during legacy migration; refreshes max-age).
    set_refresh_cookie(response, user.id, token)
    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
    }


@auth_router.post("/logout", status_code=204)
async def logout(data: LogoutRequest, response: Response):
    """Clear the refresh cookie for a single account."""
    clear_refresh_cookie(response, data.user_id)
