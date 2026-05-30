import secrets

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.api_v1.schemas.user import (
    ChangePasswordRequest,
    PhoneCodeVerify,
    PhoneRequest,
    ProfileUpdate,
    UserProfileResponse,
)
from messenger.backend.app.crud.profile import ProfileCRUD
from messenger.backend.app.crud.user import UserCRUD
from messenger.backend.app.ws.presence import is_visible_online
from messenger.backend.app.ws.profile_events import publish_profile_event
from messenger.backend.core.config import settings
from messenger.backend.core.rate_limit import (
    rate_limit_avatar_upload,
    rate_limit_send_code,
)
from messenger.backend.core.redis import get_redis
from messenger.backend.db.session import get_db_session
from messenger.backend.models.user import User
from messenger.backend.services.avatar import (
    AvatarPayload,
    EmptyFile,
    FileTooLarge,
    InvalidImage,
    UnsupportedFormat,
    cleanup_avatar_keys,
    process_and_upload_avatar,
)
from messenger.backend.services.avatar_urls import resolve_avatar_urls
from messenger.backend.services.deps import get_storage, get_storage_optional
from messenger.backend.services.storage import S3Storage, StorageError

profile_router = APIRouter(prefix="/profiles", tags=["profiles"])


async def _build_response(user, viewer_id: int, storage: S3Storage | None = None) -> UserProfileResponse:
    """Flatten User+Profile ORM objects, computing `online` and masking
    `presence_preference` if the target is invisible to non-self viewers.
    Also injects presigned avatar URLs when storage is configured."""
    p = user.profile
    target_pref = p.presence_preference if p else None
    redis = get_redis()
    online = await is_visible_online(
        redis=redis,
        viewer_id=viewer_id,
        target_user_id=user.id,
        target_pref=target_pref,
    )

    visible_pref: str | None
    if viewer_id != user.id and target_pref == "invisible":
        visible_pref = None
    else:
        visible_pref = target_pref

    urls = await resolve_avatar_urls(storage, p.avatar if p else None)

    return UserProfileResponse(
        user_id=user.id,
        username=user.username,
        name=user.name,
        phone_number=user.phone_number,
        email=getattr(user, "email", None) if viewer_id == user.id else None,
        display_name=p.display_name if p else None,
        bio=p.bio if p else None,
        presence_preference=visible_pref,
        online=online,
        avatar_url=urls.full,
        avatar_thumb_url=urls.thumb,
        avatar_uploaded_at=urls.uploaded_at,
        created_at=getattr(user, "created_at", None),
    )


async def _profile_event_payload(storage: S3Storage | None, user) -> dict:
    """Build the dict that goes into publish_profile_event for WS fan-out."""
    p = user.profile
    urls = await resolve_avatar_urls(storage, p.avatar if p else None)
    return {
        "name": user.name,
        "username": user.username,
        "display_name": p.display_name if p else None,
        "bio": p.bio if p else None,
        "presence_preference": p.presence_preference if p else None,
        "avatar_thumb_url": urls.thumb,
        "avatar_uploaded_at": urls.uploaded_at,
    }


@profile_router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage | None = Depends(get_storage_optional),
    current_user=Depends(get_current_user),
):
    user = await ProfileCRUD.get_user_with_profile(db, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="Profile not found")
    return await _build_response(user, viewer_id=current_user.id, storage=storage)


@profile_router.put("/me", response_model=UserProfileResponse)
async def update_my_profile(
    data: ProfileUpdate,
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage | None = Depends(get_storage_optional),
    current_user=Depends(get_current_user),
):
    profile = await ProfileCRUD.update_profile(db, current_user.id, data)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    user = await ProfileCRUD.get_user_with_profile(db, current_user.id)
    await publish_profile_event(
        get_redis(),
        user.id,
        await _profile_event_payload(storage, user),
    )
    return await _build_response(user, viewer_id=current_user.id, storage=storage)


@profile_router.post(
    "/me/avatar",
    response_model=UserProfileResponse,
    dependencies=[Depends(rate_limit_avatar_upload)],
)
async def upload_my_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage = Depends(get_storage),
    current_user=Depends(get_current_user),
):
    try:
        payload: AvatarPayload = await process_and_upload_avatar(
            storage, current_user.id, file
        )
    except UnsupportedFormat:
        raise HTTPException(status_code=415, detail="Unsupported image format")
    except FileTooLarge:
        raise HTTPException(status_code=413, detail="File too large")
    except EmptyFile:
        raise HTTPException(status_code=400, detail="Empty file")
    except InvalidImage:
        raise HTTPException(status_code=422, detail="Invalid image data")
    except StorageError:
        raise HTTPException(status_code=503, detail="Storage unavailable")

    avatar_dict = {
        "full_key": payload.full_key,
        "thumb_key": payload.thumb_key,
        "uploaded_at": payload.uploaded_at.isoformat(),
    }
    _profile, old_avatar = await ProfileCRUD.set_avatar(db, current_user.id, avatar_dict)
    await cleanup_avatar_keys(storage, old_avatar)

    user = await ProfileCRUD.get_user_with_profile(db, current_user.id)
    await publish_profile_event(
        get_redis(),
        user.id,
        await _profile_event_payload(storage, user),
    )
    return await _build_response(user, viewer_id=current_user.id, storage=storage)


@profile_router.delete("/me/avatar", response_model=UserProfileResponse)
async def delete_my_avatar(
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage = Depends(get_storage),
    current_user=Depends(get_current_user),
):
    _profile, old_avatar = await ProfileCRUD.set_avatar(db, current_user.id, None)
    await cleanup_avatar_keys(storage, old_avatar)
    user = await ProfileCRUD.get_user_with_profile(db, current_user.id)
    await publish_profile_event(
        get_redis(),
        user.id,
        await _profile_event_payload(storage, user),
    )
    return await _build_response(user, viewer_id=current_user.id, storage=storage)


@profile_router.post("/phone/send-code", dependencies=[Depends(rate_limit_send_code)])
async def send_phone_code(
    data: PhoneRequest,
    current_user=Depends(get_current_user),
):
    redis = get_redis()
    key = f"phone_verify:{current_user.id}:{data.phone_number}"
    existing = await redis.get(key)
    if existing:
        code = existing
    else:
        code = str(secrets.randbelow(900000) + 100000)
        await redis.setex(key, 300, code)
    if settings.debug:
        print(f"[DEV] Phone verification code for {data.phone_number}: {code}")
    return {"message": True}


@profile_router.post("/phone/verify", response_model=UserProfileResponse)
async def verify_phone_code(
    data: PhoneCodeVerify,
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage | None = Depends(get_storage_optional),
    current_user=Depends(get_current_user),
):
    redis = get_redis()
    key = f"phone_verify:{current_user.id}:{data.phone_number}"
    stored_code = await redis.get(key)
    if not stored_code or stored_code != data.code:
        raise HTTPException(status_code=400, detail="Invalid code")

    await redis.delete(key)

    user = await db.get(User, current_user.id)
    if user:
        user.phone_number = data.phone_number
        await db.commit()

    user_with_profile = await ProfileCRUD.get_user_with_profile(db, current_user.id)
    return await _build_response(user_with_profile, viewer_id=current_user.id, storage=storage)


@profile_router.post("/me/password", status_code=204)
async def change_my_password(
    data: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    user = await db.get(User, current_user.id)
    if not user or not UserCRUD.check_password(user, data.current_password):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")
    if data.new_password == data.current_password:
        raise HTTPException(status_code=400, detail="Новый пароль совпадает с текущим")
    await UserCRUD.set_password(db, user, data.new_password)
    return None


@profile_router.get("/{user_id}", response_model=UserProfileResponse)
async def get_user_profile(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage | None = Depends(get_storage_optional),
    current_user=Depends(get_current_user),
):
    user = await ProfileCRUD.get_user_with_profile(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return await _build_response(user, viewer_id=current_user.id, storage=storage)
