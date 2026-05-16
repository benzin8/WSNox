import logging

from fastapi import APIRouter, Depends
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
from messenger.backend.db.session import get_db_session

logging.basicConfig(level=logging.INFO)

chat_router = APIRouter(prefix="/chats", tags=["chats"])

@chat_router.get("/search", response_model=UserSearchResponse)
async def search_users(query: str, db: AsyncSession = Depends(get_db_session), user=Depends(get_current_user)):
    chats = await ChatCRUD.search_chats(db, query, user.id)
    return UserSearchResponse(chats=chats)

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
async def get_user_data_by_chat_id(chat_id: int, db: AsyncSession = Depends(get_db_session), current_user=Depends(get_current_user)):
    if not await ChatCRUD.is_chat_member(db, chat_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому чату")
    user = await ChatCRUD.get_user_data_by_chat_id(db, chat_id, current_user.id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return UserResponse.model_validate(user)

@chat_router.get("/me", response_model=UserResponse)
async def get_my_data(db: AsyncSession = Depends(get_db_session), current_user=Depends(get_current_user)):
    return UserResponse.model_validate(current_user)

@chat_router.get("/", response_model=list[ChatResponse])
async def get_chats(db:AsyncSession = Depends(get_db_session), current_user=Depends(get_current_user)): 
    result = await ChatCRUD.get_chats(db, current_user.id)
    chats = []
    for chat, other_user in result:
        chat_resp = ChatResponse.model_validate(chat)
        chat_resp.recipient = UserResponse.model_validate(other_user)
        chat_resp.recipient_id = other_user.id
        chats.append(chat_resp)
    return chats

@chat_router.get("/{chat_id}/messages", response_model=list[MessageResponse])
async def get_messages_by_chat_id(chat_id: int, db: AsyncSession = Depends(get_db_session), current_user=Depends(get_current_user)):
    if not await ChatCRUD.is_chat_member(db, chat_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к этому чату")
    messages = await MessageCRUD.get_messages(db, chat_id)
    return [MessageResponse.model_validate(message) for message in messages]