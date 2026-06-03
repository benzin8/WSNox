"""Helpers for the per-account httpOnly refresh-token cookies.

Each logged-in account stores its refresh token in its own cookie
`refresh_<user_id>`, scoped to the /auth path. The token is never readable
by JS (HttpOnly); the short-lived access token lives client-side.
"""
from fastapi import Response

from messenger.backend.core.config import settings

REFRESH_COOKIE_PREFIX = "refresh_"
REFRESH_COOKIE_PATH = "/auth"
REFRESH_MAX_AGE = 7 * 24 * 3600  # 7 days, matches REFRESH_TTL


def refresh_cookie_name(user_id: int) -> str:
    return f"{REFRESH_COOKIE_PREFIX}{user_id}"


def set_refresh_cookie(response: Response, user_id: int, token: str) -> None:
    response.set_cookie(
        key=refresh_cookie_name(user_id),
        value=token,
        max_age=REFRESH_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path=REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response, user_id: int) -> None:
    response.delete_cookie(
        key=refresh_cookie_name(user_id),
        path=REFRESH_COOKIE_PATH,
    )
