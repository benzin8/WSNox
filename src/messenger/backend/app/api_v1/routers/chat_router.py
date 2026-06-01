import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.api_v1.schemas.chat import (
    ChatCreateRequest,
    ChatResponse,
    UserSearchResponse,
)
from messenger.backend.app.api_v1.schemas.message import MessageResponse
from messenger.backend.app.api_v1.schemas.user import UserResponse
from messenger.backend.app.crud.chat import ChatCRUD
from messenger.backend.app.crud.message import MessageCRUD
from messenger.backend.app.crud.profile import ProfileCRUD
from messenger.backend.app.ws.presence import is_present
from messenger.backend.app.ws.router import (
    publish_media_message,
    publish_read_receipt,
)
from messenger.backend.core.crypto import decrypt_message
from messenger.backend.core.redis import get_redis
from messenger.backend.db.session import get_db_session
from messenger.backend.services import media as media_service
from messenger.backend.services.avatar_urls import resolve_avatar_urls
from messenger.backend.services.deps import get_storage, get_storage_optional
from messenger.backend.services.storage import S3Storage

logging.basicConfig(level=logging.INFO)

chat_router = APIRouter(prefix="/chats", tags=["chats"])

@chat_router.get("/search", response_model=UserSearchResponse)
async def search_users(
    query: str,
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage | None = Depends(get_storage_optional),
    user=Depends(get_current_user),
):
    chats = await ChatCRUD.search_chats(db, query, user.id)
    enriched = []
    for u in chats:
        resp = UserResponse.model_validate(u)
        avatar = getattr(getattr(u, "profile", None), "avatar", None)
        urls = await resolve_avatar_urls(storage, avatar)
        resp.avatar_thumb_url = urls.thumb
        enriched.append(resp)
    return UserSearchResponse(chats=enriched)

@chat_router.post("/get-or-create", response_model=ChatResponse)
async def get_or_create_chat(request: ChatCreateRequest, db: AsyncSession = Depends(get_db_session), current_user=Depends(get_current_user)):
    exising_chat = await ChatCRUD.get_chat_by_user_id(db, current_user.id, request.other_user_id)
    if exising_chat:
        other_user = await ChatCRUD.get_other_user_by_chat_id(db, exising_chat.id, current_user.id)
        exising_chat.recipient_id = other_user.user_id
        return ChatResponse.model_validate(exising_chat)
    
    new_chat = await ChatCRUD.create_private_chat(
        session=db,
        chat_data=request,
        members=[current_user.id, request.other_user_id],
        current_user=current_user
    )
    other_user = await ChatCRUD.get_other_user_by_chat_id(db, new_chat.id, current_user.id)
    new_chat.recipient_id = other_user.user_id
    return ChatResponse.model_validate(new_chat)

@chat_router.get("/{chat_id}/user", response_model=UserResponse)
async def get_user_data_by_chat_id(
    chat_id: int,
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage | None = Depends(get_storage_optional),
    current_user=Depends(get_current_user),
):
    if not await ChatCRUD.is_chat_member(db, chat_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому чату")
    user = await ChatCRUD.get_user_data_by_chat_id(db, chat_id, current_user.id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    resp = UserResponse.model_validate(user)
    resp.display_name = user.profile.display_name if user.profile else None
    avatar = user.profile.avatar if user.profile else None
    urls = await resolve_avatar_urls(storage, avatar)
    resp.avatar_thumb_url = urls.thumb
    return resp

@chat_router.get("/me", response_model=UserResponse)
async def get_my_data(db: AsyncSession = Depends(get_db_session), current_user=Depends(get_current_user)):
    return UserResponse.model_validate(current_user)

@chat_router.get("/", response_model=list[ChatResponse])
async def get_chats(
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage | None = Depends(get_storage_optional),
    current_user=Depends(get_current_user),
):
    result = await ChatCRUD.get_chats(db, current_user.id)
    chats = []
    for chat, other_user, rcpt_display_name, rcpt_avatar, encrypted_data, last_msg_time, unread_cnt in result:
        chat_resp = ChatResponse.model_validate(chat)
        chat_resp.recipient = UserResponse.model_validate(other_user)
        chat_resp.recipient.display_name = rcpt_display_name
        chat_resp.recipient_id = other_user.id
        urls = await resolve_avatar_urls(storage, rcpt_avatar)
        chat_resp.recipient.avatar_thumb_url = urls.thumb
        if encrypted_data:
            try:
                chat_resp.last_message = decrypt_message(encrypted_data)
            except Exception:
                chat_resp.last_message = None
        chat_resp.last_message_time = last_msg_time
        chat_resp.unread_count = unread_cnt or 0
        chats.append(chat_resp)
    return chats

@chat_router.get("/presence")
async def get_chat_presence(
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    """Return user_ids of chat partners who are currently online AND not invisible."""
    partner_ids = await ChatCRUD.get_chat_partners(db, current_user.id)
    if not partner_ids:
        return {"online_user_ids": []}

    prefs = await ProfileCRUD.get_presence_preferences(db, partner_ids)
    redis = get_redis()

    online = []
    for uid in partner_ids:
        if prefs.get(uid) == "invisible":
            continue
        if await is_present(redis, uid):
            online.append(uid)

    return {"online_user_ids": online}

@chat_router.get("/{chat_id}/messages", response_model=list[MessageResponse])
async def get_messages_by_chat_id(
    chat_id: int,
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage | None = Depends(get_storage_optional),
    current_user=Depends(get_current_user),
):
    if not await ChatCRUD.is_chat_member(db, chat_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому чату")
    max_id = await MessageCRUD.mark_as_read(db, chat_id, current_user.id)
    if max_id:
        await publish_read_receipt(db, chat_id, current_user.id, max_id)
    messages = await MessageCRUD.get_messages(db, chat_id)

    # Determine whether to expose read_at based on reciprocity
    from messenger.backend.app.crud.notification import should_expose_read_receipts
    other_user = await ChatCRUD.get_other_user_by_chat_id(db, chat_id, current_user.id)
    expose = False
    if other_user:
        expose = await should_expose_read_receipts(db, current_user.id, other_user.user_id)

    result = []
    for message in messages:
        resp = MessageResponse.model_validate(message)
        if message.attachment_key or message.attachment_thumb_key:
            full_url, thumb_url = await media_service.resolve_attachment_urls(
                storage, message.attachment_key, message.attachment_thumb_key
            )
            resp.attachment_url = full_url
            resp.attachment_thumb_url = thumb_url
        if not expose:
            resp.read_at = None
        result.append(resp)
    return result


@chat_router.post("/{chat_id}/media", response_model=MessageResponse)
async def upload_chat_media(
    chat_id: int,
    file: UploadFile = File(...),
    caption: str = Form(""),
    reply_to_id: int | None = Form(None),
    client_meta: str = Form(""),
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage = Depends(get_storage),
    current_user=Depends(get_current_user),
):
    """Upload an image or video as a chat message.

    The request is multipart/form-data. Caption is optional and reuses the
    same encryption pipeline as text bodies. After persistence the server
    publishes a WS event so the recipient sees the message immediately.
    """
    if not await ChatCRUD.is_chat_member(db, chat_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому чату")
    other = await ChatCRUD.get_other_user_by_chat_id(db, chat_id, current_user.id)
    if not other:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Чат без второго участника")

    content_type = file.content_type or ""
    try:
        if content_type in media_service.ALLOWED_IMAGE_MIME:
            payload = await media_service.process_image(storage, current_user.id, file)
        elif content_type in media_service.ALLOWED_VIDEO_MIME:
            payload = await media_service.process_video(storage, current_user.id, file, client_meta)
        else:
            raise HTTPException(status_code=415, detail="Unsupported media type")
    except media_service.FileTooLarge as e:
        raise HTTPException(status_code=413, detail="File too large") from e
    except media_service.UnsupportedFormat as e:
        raise HTTPException(status_code=415, detail="Unsupported media type") from e
    except media_service.EmptyFile as e:
        raise HTTPException(status_code=400, detail="Empty file") from e
    except media_service.InvalidImage as e:
        raise HTTPException(status_code=400, detail="Invalid image") from e
    except media_service.InvalidMeta as e:
        raise HTTPException(status_code=400, detail=str(e) or "Invalid meta") from e

    message = await MessageCRUD.create_media_message(
        db,
        chat_id=chat_id,
        sender_id=current_user.id,
        recipient_id=other.user_id,
        msg_type=payload.msg_type,
        attachment_key=payload.attachment_key,
        attachment_thumb_key=payload.attachment_thumb_key,
        attachment_meta=payload.attachment_meta,
        caption=caption,
        reply_to_id=reply_to_id,
    )

    full_url, thumb_url = await media_service.resolve_attachment_urls(
        storage, message.attachment_key, message.attachment_thumb_key
    )

    # Fan out to the recipient via the existing WS pubsub channel.
    await publish_media_message(
        db=db,
        chat_id=chat_id,
        sender_id=current_user.id,
        recipient_id=other.user_id,
        message=message,
        caption=caption,
        attachment_url=full_url,
        attachment_thumb_url=thumb_url,
    )

    # MessageBase.text is required; the Message ORM object doesn't carry it,
    # so we attach the cleartext caption before validation.
    message.text = caption or ""
    resp = MessageResponse.model_validate(message)
    resp.attachment_url = full_url
    resp.attachment_thumb_url = thumb_url
    return resp

@chat_router.post("/{chat_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_chat_as_read(chat_id: int, db: AsyncSession = Depends(get_db_session), current_user=Depends(get_current_user)):
    if not await ChatCRUD.is_chat_member(db, chat_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому чату")
    max_id = await MessageCRUD.mark_as_read(db, chat_id, current_user.id)
    if max_id:
        await publish_read_receipt(db, chat_id, current_user.id, max_id)