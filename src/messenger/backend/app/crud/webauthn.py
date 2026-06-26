from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from messenger.backend.models.webauthn_credential import WebAuthnCredential


class WebAuthnCRUD:
    @staticmethod
    async def list_for_user(db: AsyncSession, user_id: int) -> list[WebAuthnCredential]:
        res = await db.execute(
            select(WebAuthnCredential).where(WebAuthnCredential.user_id == user_id)
        )
        return list(res.scalars().all())

    @staticmethod
    async def count_for_user(db: AsyncSession, user_id: int) -> int:
        res = await db.execute(
            select(WebAuthnCredential.id).where(WebAuthnCredential.user_id == user_id)
        )
        return len(list(res.scalars().all()))

    @staticmethod
    async def get_by_credential_id(db: AsyncSession, credential_id: str) -> WebAuthnCredential | None:
        res = await db.execute(
            select(WebAuthnCredential).where(WebAuthnCredential.credential_id == credential_id)
        )
        return res.scalar_one_or_none()

    @staticmethod
    async def create(
        db: AsyncSession,
        user_id: int,
        credential_id: str,
        public_key: str,
        sign_count: int = 0,
        transports: str | None = None,
    ) -> WebAuthnCredential:
        cred = WebAuthnCredential(
            user_id=user_id,
            credential_id=credential_id,
            public_key=public_key,
            sign_count=sign_count,
            transports=transports,
        )
        db.add(cred)
        await db.commit()
        await db.refresh(cred)
        return cred

    @staticmethod
    async def update_sign_count(db: AsyncSession, cred_pk: int, new_count: int) -> None:
        await db.execute(
            update(WebAuthnCredential)
            .where(WebAuthnCredential.id == cred_pk)
            .values(sign_count=new_count)
        )
        await db.commit()

    @staticmethod
    async def delete_for_user(db: AsyncSession, user_id: int) -> None:
        await db.execute(
            delete(WebAuthnCredential).where(WebAuthnCredential.user_id == user_id)
        )
        await db.commit()
