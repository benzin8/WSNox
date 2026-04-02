from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.core.redis import get_redis
from messenger.backend.db.session import get_db_session
from messenger.backend.app.api_v1.auth.dependencies import get_current_user, oauth2_scheme

from messenger.backend.app.api_v1.schemas.chat import UserSearchResponse, ChatCreateRequest, ChatResponse

from messenger.backend.app.crud.chat import ChatCRUD

chat_router = APIRouter(prefix="/chats", tags=["chats"])

@chat_router.get("/search", response_model=UserSearchResponse)
async def search_users(query: str, db: AsyncSession = Depends(get_db_session), user=Depends(get_current_user)):
    chats = await ChatCRUD.search_chats(db, query, user.id)
    return UserSearchResponse(chats=chats)

@chat_router.post("/get-or-create", response_model=ChatResponse)
async def get_or_create_chat(request: ChatCreateRequest, db: AsyncSession = Depends(get_db_session), current_user=Depends(get_current_user), _token: str = Depends(oauth2_scheme)):
    exising_chat = await ChatCRUD.get_chat_by_user_id(db, current_user.id, request.other_user_id)
    if exising_chat:
        return ChatResponse(chat=exising_chat)
    
    new_chat = await ChatCRUD.create_private_chat(
        session=db,
        chat_data=request,
        members=[current_user.id, request.other_user_id]
    )
    return ChatResponse(chat=new_chat)
