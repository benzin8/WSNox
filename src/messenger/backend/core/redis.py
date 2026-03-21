import redis.asyncio as redis
from messenger.backend.core.config import settings

# Global Redis client instance
redis_client: redis.Redis | None = None

async def init_redis() -> None:
    global redis_client
    redis_client = redis.from_url(
        settings.redis_url, 
        encoding="utf-8", 
        decode_responses=True
    )

async def close_redis() -> None:
    global redis_client
    if redis_client:
        await redis_client.close()

def get_redis() -> redis.Redis:
    if redis_client is None:
        raise RuntimeError("Redis is not initialized. Call init_redis() on startup.")
    return redis_client
