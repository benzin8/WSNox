from messenger.backend.models import User
from messenger.backend.app.api_v1.schemas.user import UserCreate

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from messenger.backend.core.security import hash_password

class UserCRUD:
    async def create_user(self, session: AsyncSession, user_data: UserCreate, password: str):
        hashed_password = hash_password(password)
        pass
    
    @staticmethod
    async def get_user_by_phone(session: AsyncSession, phone_number: str) -> User | None:
        query = (
            select(User)
            .where(User.phone_number == phone_number)
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()
