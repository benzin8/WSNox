import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.api_v1.schemas.chat import (
    ChatCreateRequest,
    ChatMemberResponse,
    ChatResponse,
    GroupAddMembersRequest,
    GroupChatCreateRequest,
    GroupChatMembersResponse,
    UserSearchResponse,
)
from messenger.backend.app.api_v1.schemas.message import MessageResponse
from messenger.backend.app.api_v1.schemas.user import UserResponse
from messenger.backend.app.crud.chat import (
    ChatCRUD,
    cached_chat_partners,
    cached_is_chat_member,
    cached_member_ids,
    invalidate_membership,
)
from messenger.backend.app.crud.message import MessageCRUD
from messenger.backend.app.crud.profile import ProfileCRUD
from messenger.backend.app.ws.presence import is_present
from messenger.backend.app.ws.router import (
    publish_chat_event,
    publish_media_message,
    publish_read_receipt,
    send_media_ack_to_sender,
)
from messenger.backend.core.crypto import decrypt_message
from messenger.backend.core.redis import get_redis
from messenger.backend.db.session import get_db_session
from messenger.backend.services import media as media_service
from messenger.backend.services.avatar_urls import resolve_avatar_urls
from messenger.backend.services.deps import get_storage, get_storage_optional
from messenger.backend.services.storage import S3Storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
    await invalidate_membership(
        get_redis(),
        user_ids=[current_user.id, request.other_user_id],
        chat_id=new_chat.id,
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
    if not await cached_is_chat_member(get_redis(), db, chat_id, current_user.id):
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

@chat_router.get("/unread-total")
async def get_unread_total(
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    total = await ChatCRUD.get_unread_total(db, current_user.id)
    return {"unread_total": total}

@chat_router.get("/", response_model=list[ChatResponse])
async def get_chats(
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage | None = Depends(get_storage_optional),
    current_user=Depends(get_current_user),
):
    result = await ChatCRUD.get_chats(db, current_user.id)
    chats = []
    for row in result:
        (
            chat,
            other_user,
            rcpt_display_name,
            rcpt_avatar,
            encrypted_data,
            last_msg_type,
            last_msg_time,
            last_sender_id,
            last_sender_display_name,
            unread_cnt,
            member_count,
        ) = row
        chat_resp = ChatResponse.model_validate(chat)
        if other_user is not None:
            chat_resp.recipient = UserResponse.model_validate(other_user)
            chat_resp.recipient.display_name = rcpt_display_name
            chat_resp.recipient_id = other_user.id
            urls = await resolve_avatar_urls(storage, rcpt_avatar)
            chat_resp.recipient.avatar_thumb_url = urls.thumb
        else:
            chat_resp.recipient = None
            chat_resp.recipient_id = None
            chat_resp.member_count = member_count or 0
            chat_resp.last_sender_id = last_sender_id
            chat_resp.last_sender_display_name = last_sender_display_name
        decoded = None
        if encrypted_data:
            try:
                decoded = decrypt_message(encrypted_data)
            except Exception:
                decoded = None
        if not decoded and last_msg_type == "image":
            decoded = "📷 Фото"
        elif not decoded and last_msg_type == "video":
            decoded = "🎥 Видео"
        chat_resp.last_message = decoded
        chat_resp.last_message_time = last_msg_time
        chat_resp.unread_count = unread_cnt or 0
        chats.append(chat_resp)
    return chats


@chat_router.post("/group", response_model=ChatResponse, status_code=status.HTTP_201_CREATED)
async def create_group_chat(
    request: GroupChatCreateRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    """Create a new group chat. Creator is implicitly added as admin."""
    if not request.name or not request.name.strip():
        raise HTTPException(status_code=400, detail="Group name is required")
    # All requested members must already share a private chat with the creator,
    # so we don't accidentally let anyone pull arbitrary users into a group.
    partners = set(await ChatCRUD.get_chat_partners(db, current_user.id))
    bad = [uid for uid in request.member_ids if uid != current_user.id and uid not in partners]
    if bad:
        raise HTTPException(status_code=400, detail=f"Not a chat partner: {bad}")
    try:
        chat = await ChatCRUD.create_group_chat(db, request, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    member_ids = await cached_member_ids(get_redis(), db, chat.id)
    await invalidate_membership(get_redis(), user_ids=member_ids, chat_id=chat.id)
    resp = ChatResponse.model_validate(chat)
    resp.member_count = len(member_ids)

    # Notify all members (other than the creator) so their chat list updates
    # without a refresh. The event carries enough metadata that the client
    # can render a placeholder row immediately.
    try:
        await publish_chat_event({
            "type": "group_created",
            "chat_id": chat.id,
            "name": chat.name,
            "created_by": current_user.id,
            "member_ids": member_ids,
        })
    except Exception:  # noqa: BLE001
        logger.exception("publish_chat_event(group_created) failed")
    return resp


@chat_router.get("/{chat_id}/members", response_model=GroupChatMembersResponse)
async def get_group_members(
    chat_id: int,
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage | None = Depends(get_storage_optional),
    current_user=Depends(get_current_user),
):
    if not await cached_is_chat_member(get_redis(), db, chat_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому чату")
    rows = await ChatCRUD.get_chat_members_full(db, chat_id)
    members = []
    for member, user, profile in rows:
        member_resp = ChatMemberResponse(
            user_id=user.id,
            role=member.role,
            username=user.username,
            display_name=profile.display_name if profile else None,
            avatar=None,
        )
        if profile and profile.avatar:
            urls = await resolve_avatar_urls(storage, profile.avatar)
            member_resp.avatar = urls.thumb
        members.append(member_resp)
    return GroupChatMembersResponse(chat_id=chat_id, members=members)


@chat_router.post("/{chat_id}/members", response_model=GroupChatMembersResponse)
async def add_group_members(
    chat_id: int,
    request: GroupAddMembersRequest,
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage | None = Depends(get_storage_optional),
    current_user=Depends(get_current_user),
):
    """Add new members to a group chat. Admin only.

    Caller may only invite users they already share a private chat with —
    same guard as group creation, so this can't be used to pull arbitrary
    accounts into a conversation.
    """
    chat = await ChatCRUD.get_chat(db, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if chat.chat_type != "group":
        raise HTTPException(status_code=400, detail="Group chats only")
    role = await ChatCRUD.get_chat_role(db, chat_id, current_user.id)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    partners = set(await ChatCRUD.get_chat_partners(db, current_user.id))
    bad = [uid for uid in request.member_ids if uid != current_user.id and uid not in partners]
    if bad:
        raise HTTPException(status_code=400, detail=f"Not a chat partner: {bad}")

    added = await ChatCRUD.add_members(db, chat_id, request.member_ids)
    member_ids_now = await cached_member_ids(get_redis(), db, chat_id)
    await invalidate_membership(get_redis(), user_ids=member_ids_now, chat_id=chat_id)

    if added:
        try:
            await publish_chat_event({
                "type": "group_members_added",
                "chat_id": chat_id,
                "added_user_ids": added,
                "member_ids": member_ids_now,
            })
        except Exception:  # noqa: BLE001
            logger.exception("publish_chat_event(group_members_added) failed")

    rows = await ChatCRUD.get_chat_members_full(db, chat_id)
    members = []
    for member, user, profile in rows:
        member_resp = ChatMemberResponse(
            user_id=user.id,
            role=member.role,
            username=user.username,
            display_name=profile.display_name if profile else None,
            avatar=None,
        )
        if profile and profile.avatar:
            urls = await resolve_avatar_urls(storage, profile.avatar)
            member_resp.avatar = urls.thumb
        members.append(member_resp)
    return GroupChatMembersResponse(chat_id=chat_id, members=members)


@chat_router.post("/{chat_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_group_chat(
    chat_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    chat = await ChatCRUD.get_chat(db, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if chat.chat_type != "group":
        raise HTTPException(status_code=400, detail="Can leave group chats only")
    if not await cached_is_chat_member(get_redis(), db, chat_id, current_user.id):
        raise HTTPException(status_code=403, detail="Not a member")

    member_ids = await cached_member_ids(get_redis(), db, chat_id)
    await ChatCRUD.remove_member(db, chat_id, current_user.id)
    await invalidate_membership(get_redis(), user_ids=member_ids, chat_id=chat_id)
    try:
        await publish_chat_event({
            "type": "group_member_left",
            "chat_id": chat_id,
            "user_id": current_user.id,
            "member_ids": member_ids,
        })
    except Exception:  # noqa: BLE001
        logger.exception("publish_chat_event(group_member_left) failed")


@chat_router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(
    chat_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    """Delete a group chat. Only admin may do this."""
    chat = await ChatCRUD.get_chat(db, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if chat.chat_type != "group":
        raise HTTPException(status_code=400, detail="Can delete group chats only")
    role = await ChatCRUD.get_chat_role(db, chat_id, current_user.id)
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    member_ids = await cached_member_ids(get_redis(), db, chat_id)
    await ChatCRUD.delete_chat(db, chat_id)
    await invalidate_membership(
        get_redis(), user_ids=member_ids, chat_id=chat_id, bust_notif=True
    )
    try:
        await publish_chat_event({
            "type": "group_deleted",
            "chat_id": chat_id,
            "member_ids": member_ids,
        })
    except Exception:  # noqa: BLE001
        logger.exception("publish_chat_event(group_deleted) failed")

@chat_router.get("/presence")
async def get_chat_presence(
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    """Return user_ids of chat partners who are currently online AND not invisible."""
    redis = get_redis()
    partner_ids = await cached_chat_partners(redis, db, current_user.id)
    if not partner_ids:
        return {"online_user_ids": []}

    prefs = await ProfileCRUD.get_presence_preferences(db, partner_ids)

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
    if not await cached_is_chat_member(get_redis(), db, chat_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому чату")
    chat = await ChatCRUD.get_chat(db, chat_id)
    max_id = await MessageCRUD.mark_as_read(db, chat_id, current_user.id)
    if max_id:
        await publish_read_receipt(db, chat_id, current_user.id, max_id)
    messages = await MessageCRUD.get_messages(db, chat_id)

    # Per-user read receipts in groups are a separate iteration — for MVP we
    # hide read_at in groups entirely. Private chats follow the reciprocity
    # rule based on the two participants' settings.
    from messenger.backend.app.crud.notification import should_expose_read_receipts
    expose = False
    if chat and chat.chat_type == "private":
        other_user = await ChatCRUD.get_other_user_by_chat_id(db, chat_id, current_user.id)
        if other_user:
            expose = await should_expose_read_receipts(db, current_user.id, other_user.user_id)

    # For group chats, batch-resolve sender display name + avatar thumb URL
    # so the client can render "{name}" + avatar next to each incoming bubble
    # without N profile fetches. Private chats skip this — the client knows
    # the other participant from the chat row.
    sender_display: dict[int, str | None] = {}
    sender_avatar: dict[int, str | None] = {}
    if chat and chat.chat_type == "group" and messages:
        from sqlalchemy import select

        from messenger.backend.models.profile import Profile
        sender_ids = {m.sender_id for m in messages}
        rows = await db.execute(
            select(Profile).where(Profile.user_id.in_(sender_ids))
        )
        profiles = {p.user_id: p for p in rows.scalars().all()}
        for uid in sender_ids:
            prof = profiles.get(uid)
            sender_display[uid] = prof.display_name if prof else None
            if prof and prof.avatar:
                urls = await resolve_avatar_urls(storage, prof.avatar)
                sender_avatar[uid] = urls.thumb
            else:
                sender_avatar[uid] = None

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
        if sender_display:
            resp.sender_display_name = sender_display.get(message.sender_id)
            resp.sender_avatar_url = sender_avatar.get(message.sender_id)
        result.append(resp)
    return result


@chat_router.post("/{chat_id}/media", response_model=MessageResponse)
async def upload_chat_media(
    chat_id: int,
    file: UploadFile = File(...),
    caption: str = Form(""),
    reply_to_id: int | None = Form(None),
    client_meta: str = Form(""),
    client_msg_id: str | None = Form(None),
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage = Depends(get_storage),
    current_user=Depends(get_current_user),
):
    """Upload an image or video as a chat message.

    The request is multipart/form-data. Caption is optional and reuses the
    same encryption pipeline as text bodies. After persistence the server
    publishes a WS event so the recipient sees the message immediately.
    """
    if not await cached_is_chat_member(get_redis(), db, chat_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому чату")
    chat = await ChatCRUD.get_chat(db, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    # For private chats we still persist recipient_id (back-compat with old
    # clients reading the column). For group chats recipient_id is NULL and
    # fan-out happens via chat_members.
    recipient_id: int | None = None
    if chat.chat_type == "private":
        other = await ChatCRUD.get_other_user_by_chat_id(db, chat_id, current_user.id)
        if not other:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Чат без второго участника")
        recipient_id = other.user_id

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
        recipient_id=recipient_id,
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

    # Fan out via the existing WS pubsub channel. For groups the
    # publish helper computes recipient_ids from chat_members; for
    # private it short-circuits to the one recipient. Failures are
    # swallowed — the message is already persisted, so a missed live
    # event will still show up on next refresh.
    try:
        await publish_media_message(
            db=db,
            chat_id=chat_id,
            sender_id=current_user.id,
            recipient_id=recipient_id,
            message=message,
            caption=caption,
            attachment_url=full_url,
            attachment_thumb_url=thumb_url,
            chat_type=chat.chat_type,
            storage=storage,
        )
    except Exception:  # noqa: BLE001
        logger.exception("publish_media_message failed (message persisted)")

    # Direct WS ack to the sender — if the HTTP response is lost (slow
    # link / proxy timeout) this is what flips the optimistic upload
    # from "uploading" to "sent" without requiring a chat refresh.
    if client_msg_id:
        try:
            await send_media_ack_to_sender(
                sender_id=current_user.id,
                temp_id=client_msg_id,
                message_id=message.id,
                chat_id=chat_id,
                attachment_url=full_url,
                attachment_thumb_url=thumb_url,
                attachment_meta=message.attachment_meta,
            )
        except Exception:  # noqa: BLE001
            logger.exception("send_media_ack_to_sender failed")

    # MessageBase.text is required; the Message ORM object doesn't carry it,
    # so we attach the cleartext caption before validation.
    message.text = caption or ""
    resp = MessageResponse.model_validate(message)
    resp.attachment_url = full_url
    resp.attachment_thumb_url = thumb_url
    return resp

@chat_router.post("/{chat_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_chat_as_read(chat_id: int, db: AsyncSession = Depends(get_db_session), current_user=Depends(get_current_user)):
    if not await cached_is_chat_member(get_redis(), db, chat_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому чату")
    max_id = await MessageCRUD.mark_as_read(db, chat_id, current_user.id)
    if max_id:
        await publish_read_receipt(db, chat_id, current_user.id, max_id)