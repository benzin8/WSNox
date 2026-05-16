from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.schemas.user import UserCreate
from messenger.backend.app.crud.profile import ProfileCRUD
from messenger.backend.core.security import hash_password
from messenger.backend.models import User


class UserCRUD:
    @staticmethod
    async def create_user(session: AsyncSession, user_data: UserCreate, password: str):
        hashed_password = hash_password(password)
        try:
            user = User(
                name=user_data.name,
                username=user_data.username,
                email=user_data.email,
                phone_number=user_data.phone_number,
                hashed_password=hashed_password,
            )
            session.add(user)
            await session.flush()  # get user.id before creating profile

            # Every new user gets a default profile automatically
            await ProfileCRUD.create_default_profile(session, user.id, user_data.name)

            await session.commit()
            await session.refresh(user)
            return user
        except IntegrityError:
            await session.rollback()
            return None

    @staticmethod
    async def get_user_by_phone(session: AsyncSession, phone_number: str) -> User | None:
        query = (
            select(User)
            .where(User.phone_number == phone_number)
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def login_user(session: AsyncSession, phone_number: str, password: str) -> User:
        query = (
            select(User)
            .where(User.phone_number == phone_number)
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()
