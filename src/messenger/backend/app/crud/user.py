from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.app.api_v1.schemas.user import UserCreate
from messenger.backend.app.crud.profile import ProfileCRUD
from messenger.backend.core.cache import invalidate, user_auth
from messenger.backend.core.security import hash_password, verify_password
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
            await session.flush()

            await ProfileCRUD.create_default_profile(session, user.id, user_data.name)

            await session.commit()
            await session.refresh(user)
            return user
        except IntegrityError:
            await session.rollback()
            return None

    @staticmethod
    async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
        query = select(User).where(User.email == email)
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_user_by_id(session: AsyncSession, user_id: int) -> User | None:
        result = await session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def login_user(session: AsyncSession, email: str, password: str) -> User | None:
        query = select(User).where(User.email == email)
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def set_password(
        session: AsyncSession, user: User, new_password: str, redis: Redis
    ) -> None:
        user.hashed_password = hash_password(new_password)
        await session.commit()
        await invalidate(redis, user_auth(user.id))

    @staticmethod
    def check_password(user: User, password: str) -> bool:
        return verify_password(password, user.hashed_password)
