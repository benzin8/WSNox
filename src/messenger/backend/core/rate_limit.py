from fastapi import Depends, HTTPException, Request

from messenger.backend.app.api_v1.auth.dependencies import get_current_user
from messenger.backend.core.redis import get_redis
from messenger.backend.models.user import User


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


async def rate_limit_avatar_upload(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> None:
    """10 uploads / 5 min per user (primary) + 30 / 5 min per IP (safety net)."""
    await check_rate_limit(
        f"rl:avatar:user:{current_user.id}", max_requests=10, window_seconds=300
    )
    client_ip = request.headers.get("x-real-ip") or request.client.host
    await check_rate_limit(
        f"rl:avatar:ip:{client_ip}", max_requests=30, window_seconds=300
    )
