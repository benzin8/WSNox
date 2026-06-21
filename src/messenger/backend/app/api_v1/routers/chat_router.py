import logging
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.app.api_v1.schemas.chat import (
    ChannelCreateRequest,
    ChatCreateRequest,
    ChatMemberResponse,
    ChatResponse,
    GroupAddMembersRequest,
    GroupChatCreateRequest,
    GroupChatMembersResponse,
    UserSearchResponse,
)
from messenger.backend.app.api_v1.schemas.message import MessagePage, MessageResponse
from messenger.backend.app.api_v1.schemas.user import UserResponse
from messenger.backend.app.crud.block import BlockCRUD
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
from messenger.backend.core.albums import is_valid_album_id, is_valid_album_index
from messenger.backend.core.crypto import decrypt_message
from messenger.backend.core.rate_limit import (
    rate_limit_chat_create,
    rate_limit_media_upload,
    rate_limit_search,
)
from messenger.backend.core.redis import get_redis
from messenger.backend.db.session import get_db_session
from messenger.backend.services import media as media_service
from messenger.backend.services.avatar_urls import resolve_avatar_urls
from messenger.backend.services.deps import get_storage, get_storage_optional
from messenger.backend.services.storage import S3Storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

chat_router = APIRouter(prefix="/chats", tags=["chats"])


async def _channel_response(db, chat, user_id, *, expose_token: bool = False) -> ChatResponse:
    """ChatResponse for a channel: subscriber count, ownership, and the invite
    token (handed to the owner only, and only when explicitly requested)."""
    role = await ChatCRUD.get_member_role(db, chat.id, user_id)
    member_ids = await ChatCRUD.get_member_ids(db, chat.id)
    resp = ChatResponse.model_validate(chat)
    resp.member_count = len(member_ids)
    resp.is_owner = role == "owner"
    resp.is_official = chat.invite_token is None
    resp.invite_token = chat.invite_token if (resp.is_owner and expose_token) else None
    return resp


@chat_router.get("/search", response_model=UserSearchResponse, dependencies=[Depends(rate_limit_search)])
async def search_users(
    query: str,
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage | None = Depends(get_storage_optional),
    user=Depends(get_current_user),
):
    chats = await ChatCRUD.search_chats(db, query, user.id) or []
    enriched = []
    for u in chats:
        resp = UserResponse.model_validate(u)
        avatar = getattr(getattr(u, "profile", None), "avatar", None)
        urls = await resolve_avatar_urls(storage, avatar, redis=get_redis())
        resp.avatar_thumb_url = urls.thumb
        enriched.append(resp)
    channels = [
        await _channel_response(db, ch, user.id)
        for ch in await ChatCRUD.search_channels(db, query)
    ]
    return UserSearchResponse(chats=enriched, channels=channels)

@chat_router.post("/get-or-create", response_model=ChatResponse, dependencies=[Depends(rate_limit_chat_create)])
async def get_or_create_chat(request: ChatCreateRequest, db: AsyncSession = Depends(get_db_session), current_user=Depends(get_current_user)):
    if request.other_user_id != current_user.id and await BlockCRUD.is_blocked_either(
        db, current_user.id, request.other_user_id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Чат недоступен")
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


@chat_router.post("/users/{user_id}/block")
async def block_user(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    """Block a user: no new DMs and no message delivery either way."""
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя заблокировать себя")
    await BlockCRUD.block(db, current_user.id, user_id)
    return {"ok": True, "blocked": True}


@chat_router.post("/users/{user_id}/unblock")
async def unblock_user(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    await BlockCRUD.unblock(db, current_user.id, user_id)
    return {"ok": True, "blocked": False}


@chat_router.get("/users/{user_id}/block-status")
async def block_status(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    return {"blocked": await BlockCRUD.has_blocked(db, current_user.id, user_id)}


async def _request_recipient_guard(db, chat_id: int, current_user):
    """Validate the caller is a member of this private chat; return the chat."""
    chat = await ChatCRUD.get_chat(db, chat_id)
    if not chat or chat.chat_type != "private":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Чат не найден")
    if not await cached_is_chat_member(get_redis(), db, chat_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа")
    return chat


async def _dismiss_request(db, chat_id: int) -> None:
    member_ids = await cached_member_ids(get_redis(), db, chat_id)
    await ChatCRUD.delete_chat(db, chat_id)
    await invalidate_membership(get_redis(), user_ids=member_ids, chat_id=chat_id, bust_notif=True)


@chat_router.post("/{chat_id}/accept")
async def accept_chat_request(
    chat_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    """Recipient accepts a pending chat request → the chat opens."""
    chat = await _request_recipient_guard(db, chat_id, current_user)
    if not chat.is_request:
        return {"ok": True}
    if chat.initiator_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Это ваш запрос")
    chat.is_request = False
    await db.commit()
    return {"ok": True}


@chat_router.post("/{chat_id}/decline")
async def decline_chat_request(
    chat_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    """Recipient declines a pending request → the chat is removed."""
    chat = await _request_recipient_guard(db, chat_id, current_user)
    if chat.initiator_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Это ваш запрос")
    await _dismiss_request(db, chat_id)
    return {"ok": True}


@chat_router.post("/{chat_id}/report-spam")
async def report_chat_spam(
    chat_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    """Recipient reports a request as spam → block the initiator + remove the chat."""
    chat = await _request_recipient_guard(db, chat_id, current_user)
    initiator = chat.initiator_id
    if initiator and initiator != current_user.id:
        await BlockCRUD.block(db, current_user.id, initiator)
        logger.warning(
            "SPAM REPORT: chat=%s reporter=%s initiator=%s", chat_id, current_user.id, initiator
        )
    await _dismiss_request(db, chat_id)
    return {"ok": True}


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
    urls = await resolve_avatar_urls(storage, avatar, redis=get_redis())
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
    from messenger.backend.app.crud.chat import cached_unread_total
    total = await cached_unread_total(get_redis(), db, current_user.id)
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
        if chat.chat_type == "channel":
            # The official broadcast channel is the singleton with no invite
            # token; user-created channels always carry one. Only the owner may
            # see/share the token, and sees the composer instead of read-only.
            chat_resp.is_official = chat.invite_token is None
            role = await ChatCRUD.get_member_role(db, chat.id, current_user.id)
            chat_resp.is_owner = role == "owner"
            if not chat_resp.is_owner:
                chat_resp.invite_token = None
        if other_user is not None:
            chat_resp.recipient = UserResponse.model_validate(other_user)
            chat_resp.recipient.display_name = rcpt_display_name
            chat_resp.recipient_id = other_user.id
            urls = await resolve_avatar_urls(storage, rcpt_avatar, redis=get_redis())
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
        elif not decoded and last_msg_type == "voice":
            decoded = "🎤 Голосовое сообщение"
        chat_resp.last_message = decoded
        chat_resp.last_message_time = last_msg_time
        chat_resp.unread_count = unread_cnt or 0
        chats.append(chat_resp)
    return chats


@chat_router.post("/group", response_model=ChatResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit_chat_create)])
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


@chat_router.post("/channels", response_model=ChatResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit_chat_create)])
async def create_channel(
    request: ChannelCreateRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    """Create a public channel. The creator becomes its owner (the only poster)."""
    if not request.name or not request.name.strip():
        raise HTTPException(status_code=400, detail="Название канала обязательно")
    chat = await ChatCRUD.create_channel(
        db, request.name, request.description, current_user.id, redis=get_redis()
    )
    return await _channel_response(db, chat, current_user.id, expose_token=True)


@chat_router.post("/channels/{chat_id}/subscribe", response_model=ChatResponse)
async def subscribe_to_channel(
    chat_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    chat = await ChatCRUD.get_chat(db, chat_id)
    if not chat or chat.chat_type != "channel":
        raise HTTPException(status_code=404, detail="Канал не найден")
    await ChatCRUD.subscribe_to_channel(db, chat_id, current_user.id, redis=get_redis())
    return await _channel_response(db, chat, current_user.id, expose_token=True)


@chat_router.post("/channels/join/{token}", response_model=ChatResponse)
async def join_channel_by_token(
    token: str,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    chat = await ChatCRUD.get_channel_by_token(db, token)
    if not chat:
        raise HTTPException(status_code=404, detail="Канал не найден")
    await ChatCRUD.subscribe_to_channel(db, chat.id, current_user.id, redis=get_redis())
    return await _channel_response(db, chat, current_user.id, expose_token=True)


@chat_router.post("/channels/{chat_id}/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe_from_channel(
    chat_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    role = await ChatCRUD.get_member_role(db, chat_id, current_user.id)
    if role == "owner":
        raise HTTPException(status_code=400, detail="Владелец не может отписаться — удалите канал")
    await ChatCRUD.unsubscribe_from_channel(db, chat_id, current_user.id, redis=get_redis())


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
            urls = await resolve_avatar_urls(storage, profile.avatar, redis=get_redis())
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
            urls = await resolve_avatar_urls(storage, profile.avatar, redis=get_redis())
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
    max_id = await MessageCRUD.mark_as_read(db, chat_id, current_user.id, redis=get_redis())
    if max_id:
        await publish_read_receipt(db, chat_id, current_user.id, max_id)
    messages = await MessageCRUD.get_messages(db, chat_id)

    # Reaction summaries (counts + this viewer's own reaction) for all messages
    # in one query, so reactions are already on the bubbles when the chat opens.
    from messenger.backend.app.crud.reaction import ReactionCRUD
    reaction_summary = await ReactionCRUD.summary_for_messages(
        db, [m.id for m in messages], current_user.id
    )
    # Turn low-count reactions into reactor avatars (Telegram-style faces).
    await ReactionCRUD.attach_reactors(db, reaction_summary, storage, get_redis())

    # Per-user read receipts in groups are a separate iteration — for MVP we
    # hide read_at in groups entirely. Private chats follow the reciprocity
    # rule based on the two participants' settings.
    from messenger.backend.app.crud.notification import should_expose_read_receipts
    expose = False
    if chat and chat.chat_type == "private":
        other_user = await ChatCRUD.get_other_user_by_chat_id(db, chat_id, current_user.id)
        if other_user:
            expose = await should_expose_read_receipts(
                get_redis(), db, current_user.id, other_user.user_id
            )

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
                urls = await resolve_avatar_urls(storage, prof.avatar, redis=get_redis())
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
        resp.reactions = reaction_summary.get(message.id)
        result.append(resp)
    return result


async def _media_resp(m, storage) -> MessageResponse:
    """MessageResponse for a media/search hit, with presigned attachment URLs."""
    resp = MessageResponse.model_validate(m)
    if m.attachment_key or m.attachment_thumb_key:
        full_url, thumb_url = await media_service.resolve_attachment_urls(
            storage, m.attachment_key, m.attachment_thumb_key
        )
        resp.attachment_url = full_url
        resp.attachment_thumb_url = thumb_url
    return resp


@chat_router.get("/{chat_id}/media", response_model=MessagePage, dependencies=[Depends(rate_limit_search)])
async def get_chat_media(
    chat_id: int,
    before_id: int | None = None,
    limit: int = 30,
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage = Depends(get_storage),
    current_user=Depends(get_current_user),
):
    """All photos/videos in a chat (newest first), id-cursor paginated."""
    if not await cached_is_chat_member(get_redis(), db, chat_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому чату")
    limit = max(1, min(limit, 60))
    msgs = await MessageCRUD.get_media_messages(db, chat_id, before_id=before_id, limit=limit)
    items = [await _media_resp(m, storage) for m in msgs]
    next_before = msgs[-1].id if len(msgs) == limit else None
    return MessagePage(items=items, next_before_id=next_before)


@chat_router.get("/{chat_id}/search", response_model=MessagePage, dependencies=[Depends(rate_limit_search)])
async def search_chat_messages(
    chat_id: int,
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    before_id: int | None = None,
    limit: int = 30,
    db: AsyncSession = Depends(get_db_session),
    storage: S3Storage = Depends(get_storage),
    current_user=Depends(get_current_user),
):
    """Search one chat by words (decrypt on the fly) and/or a date range."""
    if not await cached_is_chat_member(get_redis(), db, chat_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому чату")
    has_q = bool(q and q.strip())
    if not has_q and date_from is None and date_to is None:
        raise HTTPException(status_code=400, detail="Нужен запрос или дата")
    limit = max(1, min(limit, 50))
    msgs, next_before = await MessageCRUD.search_messages(
        db,
        chat_id,
        q=q.strip() if has_q else None,
        date_from=date_from,
        date_to=date_to,
        before_id=before_id,
        limit=limit,
    )
    items = [await _media_resp(m, storage) for m in msgs]
    return MessagePage(items=items, next_before_id=next_before)


@chat_router.post("/{chat_id}/media", response_model=MessageResponse, dependencies=[Depends(rate_limit_media_upload)])
async def upload_chat_media(
    chat_id: int,
    file: UploadFile = File(...),
    caption: str = Form(""),
    reply_to_id: int | None = Form(None),
    client_meta: str = Form(""),
    client_msg_id: str | None = Form(None),
    album_id: str | None = Form(None),
    album_index: int | None = Form(None),
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
    # Channels are read-only over this path too (mirrors the WS text rule):
    # only the owner may post. The official channel has no owner, so its
    # members can't post media here — it stays admin-only via the dashboard.
    if chat.chat_type == "channel" and await ChatCRUD.get_member_role(db, chat_id, current_user.id) != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Только владелец может публиковать в канале")
    # Album fields are optional; when present they must be well-formed and the
    # file must be a photo (albums are photo-only in v1). The cap (<= 10) is
    # enforced via is_valid_album_index (0..9).
    if album_id is not None or album_index is not None:
        if not (is_valid_album_id(album_id) and is_valid_album_index(album_index)):
            raise HTTPException(status_code=400, detail="Invalid album fields")
        content_type_peek = (file.content_type or "").split(";")[0].strip()
        if content_type_peek not in media_service.ALLOWED_IMAGE_MIME:
            raise HTTPException(status_code=400, detail="Albums are photo-only")
    # For private chats we still persist recipient_id (back-compat with old
    # clients reading the column). For group chats recipient_id is NULL and
    # fan-out happens via chat_members.
    recipient_id: int | None = None
    if chat.chat_type == "private":
        other = await ChatCRUD.get_other_user_by_chat_id(db, chat_id, current_user.id)
        if not other:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Чат без второго участника")
        recipient_id = other.user_id

    # Normalise away any codecs parameter (e.g. "audio/webm;codecs=opus" from
    # MediaRecorder) before matching the allowlists.
    content_type = (file.content_type or "").split(";")[0].strip()
    try:
        if content_type in media_service.ALLOWED_IMAGE_MIME:
            payload = await media_service.process_image(storage, current_user.id, file)
        elif content_type in media_service.ALLOWED_VIDEO_MIME:
            payload = await media_service.process_video(storage, current_user.id, file, client_meta)
        elif content_type in media_service.ALLOWED_AUDIO_MIME:
            payload = await media_service.process_audio(storage, current_user.id, file, client_meta)
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

    # Fold the album position into the persisted meta (no extra column).
    meta = payload.attachment_meta or {}
    if album_index is not None:
        meta = {**meta, "album_index": album_index}

    message = await MessageCRUD.create_media_message(
        db,
        chat_id=chat_id,
        sender_id=current_user.id,
        recipient_id=recipient_id,
        msg_type=payload.msg_type,
        attachment_key=payload.attachment_key,
        attachment_thumb_key=payload.attachment_thumb_key,
        attachment_meta=meta,
        caption=caption,
        reply_to_id=reply_to_id,
        album_id=album_id,
        redis=get_redis(),
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
    max_id = await MessageCRUD.mark_as_read(db, chat_id, current_user.id, redis=get_redis())
    if max_id:
        await publish_read_receipt(db, chat_id, current_user.id, max_id)