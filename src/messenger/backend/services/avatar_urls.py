"""Presigned-URL resolver for avatar payloads stored in profiles.avatar JSONB."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from messenger.backend.services.storage import S3Storage

PRESIGN_TTL = 3600  # 1 hour


@dataclass(frozen=True)
class AvatarUrls:
    full: Optional[str]
    thumb: Optional[str]
    uploaded_at: Optional[str]


async def resolve_avatar_urls(
    storage: Optional[S3Storage], avatar: Optional[dict]
) -> AvatarUrls:
    if not storage or not avatar:
        return AvatarUrls(full=None, thumb=None, uploaded_at=None)
    full_key = avatar.get("full_key")
    thumb_key = avatar.get("thumb_key")
    if not full_key or not thumb_key:
        return AvatarUrls(full=None, thumb=None, uploaded_at=None)
    full = await storage.presigned_get(full_key, expires_in=PRESIGN_TTL)
    thumb = await storage.presigned_get(thumb_key, expires_in=PRESIGN_TTL)
    return AvatarUrls(full=full, thumb=thumb, uploaded_at=avatar.get("uploaded_at"))
