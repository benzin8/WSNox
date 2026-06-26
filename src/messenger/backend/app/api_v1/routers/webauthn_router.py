"""Biometric / passkey login via WebAuthn.

Registration (enable biometrics) requires an authenticated user. Login is
usernameless: the passkey is registered as a discoverable credential, so the
device returns the user handle and we look the credential up by id — one tap,
no login field. A successful biometric login issues the same access token +
refresh cookie as a password login.
"""
import json
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.api_v1.schemas.user import UserResponse
from messenger.backend.app.crud.webauthn import WebAuthnCRUD
from messenger.backend.core.config import settings
from messenger.backend.core.cookies import set_refresh_cookie
from messenger.backend.core.redis import get_redis
from messenger.backend.core.security import create_access_token, create_refresh_token
from messenger.backend.db.session import get_db_session
from messenger.backend.models.user import User

webauthn_router = APIRouter(prefix="/auth/webauthn", tags=["webauthn"])

RP_NAME = "WSNox"
CHALLENGE_TTL = 300


def _rp() -> tuple[str, str]:
    """(rp_id, origin) derived from the configured frontend URL."""
    origin = settings.frontend_base_url.rstrip("/")
    rp_id = urlparse(origin).hostname or "wsnox.urldot.ru"
    return rp_id, origin


@webauthn_router.get("/status")
async def webauthn_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    n = await WebAuthnCRUD.count_for_user(db, current_user.id)
    return {"enabled": n > 0, "count": n}


@webauthn_router.post("/register/options")
async def register_options(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    rp_id, _ = _rp()
    existing = await WebAuthnCRUD.list_for_user(db, current_user.id)
    exclude = [
        PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id))
        for c in existing
    ]
    name = getattr(current_user, "email", None) or f"user{current_user.id}"
    opts = generate_registration_options(
        rp_id=rp_id,
        rp_name=RP_NAME,
        user_id=str(current_user.id).encode(),
        user_name=name,
        user_display_name=name,
        exclude_credentials=exclude,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
    )
    await get_redis().setex(
        f"webauthn:reg:{current_user.id}", CHALLENGE_TTL, bytes_to_base64url(opts.challenge)
    )
    return Response(content=options_to_json(opts), media_type="application/json")


@webauthn_router.post("/register/verify")
async def register_verify(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    redis = get_redis()
    chal = await redis.get(f"webauthn:reg:{current_user.id}")
    if not chal:
        raise HTTPException(status_code=400, detail="Срок действия запроса истёк, попробуйте снова")
    rp_id, origin = _rp()
    try:
        verification = verify_registration_response(
            credential=json.dumps(body),
            expected_challenge=base64url_to_bytes(chal),
            expected_rp_id=rp_id,
            expected_origin=origin,
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Не удалось подтвердить ключ")
    await WebAuthnCRUD.create(
        db,
        current_user.id,
        credential_id=bytes_to_base64url(verification.credential_id),
        public_key=bytes_to_base64url(verification.credential_public_key),
        sign_count=verification.sign_count,
    )
    await redis.delete(f"webauthn:reg:{current_user.id}")
    return {"status": "ok"}


@webauthn_router.delete("/credentials")
async def disable_webauthn(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    await WebAuthnCRUD.delete_for_user(db, current_user.id)
    return {"status": "ok"}


@webauthn_router.post("/login/options")
async def login_options():
    rp_id, _ = _rp()
    opts = generate_authentication_options(
        rp_id=rp_id, user_verification=UserVerificationRequirement.PREFERRED
    )
    chal = bytes_to_base64url(opts.challenge)
    await get_redis().setex(f"webauthn:auth:{chal}", CHALLENGE_TTL, "1")
    return Response(content=options_to_json(opts), media_type="application/json")


@webauthn_router.post("/login/verify")
async def login_verify(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    cred_id = body.get("id") or body.get("rawId")
    if not cred_id:
        raise HTTPException(status_code=400, detail="Некорректный ответ устройства")
    cred = await WebAuthnCRUD.get_by_credential_id(db, cred_id)
    if not cred:
        raise HTTPException(status_code=400, detail="Биометрия не настроена для этого устройства")
    redis = get_redis()
    try:
        client_data = json.loads(base64url_to_bytes(body["response"]["clientDataJSON"]))
        challenge_b64 = client_data["challenge"]
    except Exception:
        raise HTTPException(status_code=400, detail="Некорректный ответ устройства")
    if not await redis.get(f"webauthn:auth:{challenge_b64}"):
        raise HTTPException(status_code=400, detail="Срок действия запроса истёк, попробуйте снова")
    rp_id, origin = _rp()
    try:
        verification = verify_authentication_response(
            credential=json.dumps(body),
            expected_challenge=base64url_to_bytes(challenge_b64),
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=base64url_to_bytes(cred.public_key),
            credential_current_sign_count=cred.sign_count,
            require_user_verification=False,
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Не удалось войти по биометрии")
    await WebAuthnCRUD.update_sign_count(db, cred.id, verification.new_sign_count)
    await redis.delete(f"webauthn:auth:{challenge_b64}")
    user = await db.get(User, cred.user_id)
    if not user or getattr(user, "is_banned", False):
        raise HTTPException(status_code=403, detail="Аккаунт недоступен")
    set_refresh_cookie(response, user.id, create_refresh_token(user.id))
    return {
        "status": "success",
        "user": UserResponse.model_validate(user),
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
    }
