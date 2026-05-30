"""Avatar upload pipeline — validate, resize, encode WebP, push to S3."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from messenger.backend.services.storage import S3Storage, StorageError

logger = logging.getLogger(__name__)

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB
FULL_SIZE = 512
THUMB_SIZE = 96
WEBP_QUALITY = 85
READ_CHUNK = 64 * 1024

# Guard against decompression-bomb attacks: refuse images whose pixel count exceeds this.
Image.MAX_IMAGE_PIXELS = 24_000_000


class AvatarError(Exception):
    """Base for avatar pipeline errors."""


class UnsupportedFormat(AvatarError):
    pass


class FileTooLarge(AvatarError):
    pass


class EmptyFile(AvatarError):
    pass


class InvalidImage(AvatarError):
    pass


@dataclass(frozen=True)
class AvatarPayload:
    full_key: str
    thumb_key: str
    uploaded_at: datetime


async def _read_bounded(file: UploadFile, max_bytes: int) -> bytes:
    """Read up to max_bytes from the upload stream; raise FileTooLarge if exceeded."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(READ_CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise FileTooLarge()
        chunks.append(chunk)
    return b"".join(chunks)


def _fit_square(img: Image.Image, size: int) -> Image.Image:
    """Center-crop to a square (defensive against non-square inputs), then resize."""
    w, h = img.size
    if w != h:
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))
    return img.resize((size, size), Image.LANCZOS)


def _encode_webp(img: Image.Image) -> bytes:
    buf = BytesIO()
    img.save(buf, "WEBP", quality=WEBP_QUALITY, method=6)
    return buf.getvalue()


async def process_and_upload_avatar(
    storage: S3Storage, user_id: int, file: UploadFile
) -> AvatarPayload:
    if file.content_type not in ALLOWED_MIME:
        raise UnsupportedFormat()

    raw = await _read_bounded(file, MAX_UPLOAD_BYTES)
    if not raw:
        raise EmptyFile()

    try:
        Image.open(BytesIO(raw)).verify()
        img = Image.open(BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as e:
        logger.info("Avatar decode failed: %s", e)
        raise InvalidImage() from e

    full_bytes = _encode_webp(_fit_square(img, FULL_SIZE))
    thumb_bytes = _encode_webp(_fit_square(img, THUMB_SIZE))

    uploaded_at = datetime.now(timezone.utc)
    ts = int(uploaded_at.timestamp())
    full_key = f"avatars/{user_id}/{ts}/full.webp"
    thumb_key = f"avatars/{user_id}/{ts}/thumb.webp"

    await storage.put_object(full_key, full_bytes, "image/webp")
    await storage.put_object(thumb_key, thumb_bytes, "image/webp")

    return AvatarPayload(full_key=full_key, thumb_key=thumb_key, uploaded_at=uploaded_at)


async def cleanup_avatar_keys(storage: S3Storage, old_avatar: dict | None) -> None:
    """Best-effort delete of old avatar keys. Never raises."""
    if not old_avatar:
        return
    for key in (old_avatar.get("full_key"), old_avatar.get("thumb_key")):
        if not key:
            continue
        try:
            await storage.delete_object(key)
        except StorageError as e:
            logger.warning("Failed to cleanup avatar key %s: %s", key, e)
