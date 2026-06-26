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


async def rate_limit_login(request: Request) -> None:
    """10 login attempts / 5 min per IP — brute-force protection."""
    client_ip = request.headers.get("x-real-ip") or request.client.host
    await check_rate_limit(f"rl:login:ip:{client_ip}", max_requests=10, window_seconds=300)


async def rate_limit_refresh(request: Request) -> None:
    """30 token refreshes / 5 min per IP."""
    client_ip = request.headers.get("x-real-ip") or request.client.host
    await check_rate_limit(f"rl:refresh:ip:{client_ip}", max_requests=30, window_seconds=300)


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


def _client_ip(request: Request) -> str:
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")


async def rate_limit_media_upload(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> None:
    """Chat media: 20 / min per user + 60 / min per IP (storage/bandwidth abuse)."""
    await check_rate_limit(f"rl:media:user:{current_user.id}", max_requests=20, window_seconds=60)
    await check_rate_limit(f"rl:media:ip:{_client_ip(request)}", max_requests=60, window_seconds=60)


async def rate_limit_chat_create(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> None:
    """New chats/groups/channels: 30 / 5 min per user (mass-DM / spam brake)."""
    await check_rate_limit(f"rl:chat_create:user:{current_user.id}", max_requests=30, window_seconds=300)


async def rate_limit_search(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> None:
    """Search / media listing: 40 / min per user (enumeration + CPU brake)."""
    await check_rate_limit(f"rl:search:user:{current_user.id}", max_requests=40, window_seconds=60)


async def rate_limit_verify_code(request: Request) -> None:
    """Email/phone code verification: 10 / 5 min per IP — brute-force guard."""
    await check_rate_limit(f"rl:verify:ip:{_client_ip(request)}", max_requests=10, window_seconds=300)


async def rate_limit_register(request: Request) -> None:
    """Registration: 5 / hour per IP — mass-account-creation brake."""
    await check_rate_limit(f"rl:register:ip:{_client_ip(request)}", max_requests=5, window_seconds=3600)


async def rate_limit_reset_password(request: Request) -> None:
    """Password reset: 10 / 10 min per IP."""
    await check_rate_limit(f"rl:reset:ip:{_client_ip(request)}", max_requests=10, window_seconds=600)


# Per-second, per-user, per-message-type caps for the WebSocket receive loop.
# Non-raising (WS path drops the message instead of 429ing).
WS_RATE_LIMITS = {
    "message": 5,
    "react": 12,
    "edit_message": 3,
    "delete_message": 3,
    "message_read": 20,
    "viewing_chat": 5,
    "ping": 5,
    # one-time (ephemeral) chats
    "eph_msg": 5,
    "eph_invite": 1,
    "eph_typing": 6,
}


async def ws_rate_ok(redis, user_id: int, kind: str, max_per_sec: int) -> bool:
    """1-second sliding bucket per (user, message-type). False = over the limit."""
    key = f"rl:ws:{kind}:{user_id}"
    current = await redis.incr(key)
    if current == 1:
        await redis.expire(key, 1)
    return current <= max_per_sec
