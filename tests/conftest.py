import pytest_asyncio
from fakeredis import aioredis as fake_aioredis


@pytest_asyncio.fixture
async def fake_redis():
    """In-memory async Redis for unit tests."""
    client = fake_aioredis.FakeRedis(decode_responses=True)
    try:
        yield client
    finally:
        await client.aclose()
