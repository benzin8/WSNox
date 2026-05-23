from fastapi import HTTPException, Request

from messenger.backend.core.redis import get_redis


async def check_rate_limit(key: str, max_requests: int, window_seconds: int) -> None:
    redis = get_redis()
    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, window_seconds)
    if current > max_requests:
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")


async def rate_limit_send_code(request: Request) -> None:
    client_ip = request.headers.get("x-real-ip") or request.client.host
    await check_rate_limit(f"rl:send_code:ip:{client_ip}", max_requests=5, window_seconds=300)
