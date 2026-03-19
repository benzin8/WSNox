import asyncio
import sys
import os

from src.messenger.backend.db import Base
from src.messenger.backend.db.session import engine
from src.messenger.backend.models import \
Chat, ChatMember, User, Message, Profile


async def init_db():
    try:
        async with engine.begin() as conn:
            """Создание таблиц"""
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        print(f"Ошибка при создании таблиц {e}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(init_db())