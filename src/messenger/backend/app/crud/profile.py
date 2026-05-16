from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from messenger.backend.app.api_v1.schemas.user import ProfileUpdate
from messenger.backend.models.profile import Profile
from messenger.backend.models.user import User


class ProfileCRUD:
    @staticmethod
    async def get_user_with_profile(session: AsyncSession, user_id: int) -> User | None:
        """Load User row with its Profile eagerly in a single query."""
        query = (
            select(User)
            .options(joinedload(User.profile))
            .where(User.id == user_id)
        )
        result = await session.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_default_profile(session: AsyncSession, user_id: int, display_name: str) -> Profile:
        """Create a blank profile for a newly registered user."""
        profile = Profile(
            user_id=user_id,
            display_name=display_name,
            bio="",
            status="Online",
            profile_photos=[],
        )
        session.add(profile)
        await session.flush()  # persist within the caller's open transaction
        return profile

    @staticmethod
    async def update_profile(session: AsyncSession, user_id: int, data: ProfileUpdate) -> Profile | None:
        """Apply partial update to a user's profile. Returns None if profile not found."""
        query = select(Profile).where(Profile.user_id == user_id)
        result = await session.execute(query)
        profile = result.scalar_one_or_none()
        if not profile:
            return None

        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(profile, field, value)

        await session.commit()
        await session.refresh(profile)
        return profile
