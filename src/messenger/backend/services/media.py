"""Media upload pipeline for chat attachments.

Two paths:
- Images go through Pillow (validate, downscale, re-encode as JPEG, thumbnail).
- Videos are streamed straight to S3 — no transcoding (no ffmpeg in the image).
  Dimensions/duration come from the client-supplied meta blob; the server only
  bounds size and mime.

Both flows raise typed exceptions so the router can translate to HTTP cleanly.
"""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from typing import Any

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from messenger.backend.services.storage import S3Storage

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_MIME = {"video/mp4", "video/quicktime", "video/webm"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_VIDEO_BYTES = 50 * 1024 * 1024
MAX_DURATION_MS = 5 * 60 * 1000  # 5 min hard cap for client-reported duration

IMAGE_MAX_SIDE = 1920
THUMB_MAX_SIDE = 320
IMAGE_QUALITY = 82
THUMB_QUALITY = 75
READ_CHUNK = 64 * 1024

# Decompression-bomb guard for Pillow.
Image.MAX_IMAGE_PIXELS = 24_000_000


class MediaError(Exception):
    """Base for media pipeline errors."""


class UnsupportedFormat(MediaError):
    pass


class FileTooLarge(MediaError):
    pass


class EmptyFile(MediaError):
    pass


class InvalidImage(MediaError):
    pass


class InvalidMeta(MediaError):
    pass


@dataclass(frozen=True)
class MediaPayload:
    attachment_key: str
    attachment_thumb_key: str | None
    attachment_meta: dict[str, Any]
    msg_type: str  # "image" | "video"


async def _read_bounded(file: UploadFile, max_bytes: int) -> bytes:
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


def _fit_max_side(img: Image.Image, max_side: int) -> Image.Image:
    """Resize so that the longest side ≤ max_side, preserving aspect ratio."""
    w, h = img.size
    longest = max(w, h)
    if longest <= max_side:
        return img
    scale = max_side / longest
    return img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)


def _encode_jpeg(img: Image.Image, quality: int) -> bytes:
    buf = BytesIO()
    img.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


async def process_image(storage: S3Storage, user_id: int, file: UploadFile) -> MediaPayload:
    if file.content_type not in ALLOWED_IMAGE_MIME:
        raise UnsupportedFormat()

    raw = await _read_bounded(file, MAX_IMAGE_BYTES)
    if not raw:
        raise EmptyFile()

    try:
        Image.open(BytesIO(raw)).verify()
        img = Image.open(BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as e:
        logger.info("Media image decode failed: %s", e)
        raise InvalidImage() from e

    original_w, original_h = img.size
    full_img = _fit_max_side(img, IMAGE_MAX_SIDE)
    thumb_img = _fit_max_side(img, THUMB_MAX_SIDE)

    full_bytes = _encode_jpeg(full_img, IMAGE_QUALITY)
    thumb_bytes = _encode_jpeg(thumb_img, THUMB_QUALITY)

    now = datetime.now(timezone.utc)
    ts = int(now.timestamp())
    obj_id = uuid.uuid4().hex
    full_key = f"media/{user_id}/{ts}/{obj_id}.jpg"
    thumb_key = f"media/{user_id}/{ts}/{obj_id}_thumb.jpg"

    await storage.put_object(full_key, full_bytes, "image/jpeg")
    await storage.put_object(thumb_key, thumb_bytes, "image/jpeg")

    meta = {
        "width": full_img.size[0],
        "height": full_img.size[1],
        "original_width": original_w,
        "original_height": original_h,
        "size_bytes": len(full_bytes),
        "content_type": "image/jpeg",
    }
    return MediaPayload(
        attachment_key=full_key,
        attachment_thumb_key=thumb_key,
        attachment_meta=meta,
        msg_type="image",
    )


def _validate_video_meta(client_meta_raw: str) -> dict[str, Any]:
    """Parse and bound-check client-supplied video meta. Empty/missing → {}."""
    if not client_meta_raw:
        return {}
    try:
        data = json.loads(client_meta_raw)
    except (json.JSONDecodeError, TypeError) as e:
        raise InvalidMeta("client_meta is not valid JSON") from e
    if not isinstance(data, dict):
        raise InvalidMeta("client_meta must be an object")
    out: dict[str, Any] = {}
    for k in ("width", "height", "duration_ms"):
        v = data.get(k)
        if v is None:
            continue
        if not isinstance(v, (int, float)) or v < 0 or v > 1_000_000_000:
            raise InvalidMeta(f"invalid {k}")
        out[k] = int(v)
    if "duration_ms" in out and out["duration_ms"] > MAX_DURATION_MS:
        raise InvalidMeta("duration exceeds cap")
    return out


async def process_video(
    storage: S3Storage,
    user_id: int,
    file: UploadFile,
    client_meta_raw: str,
) -> MediaPayload:
    if file.content_type not in ALLOWED_VIDEO_MIME:
        raise UnsupportedFormat()

    raw = await _read_bounded(file, MAX_VIDEO_BYTES)
    if not raw:
        raise EmptyFile()

    client_meta = _validate_video_meta(client_meta_raw)

    now = datetime.now(timezone.utc)
    ts = int(now.timestamp())
    obj_id = uuid.uuid4().hex
    ext = {
        "video/mp4": "mp4",
        "video/quicktime": "mov",
        "video/webm": "webm",
    }[file.content_type]
    full_key = f"media/{user_id}/{ts}/{obj_id}.{ext}"

    await storage.put_object(full_key, raw, file.content_type)

    meta: dict[str, Any] = {
        "size_bytes": len(raw),
        "content_type": file.content_type,
    }
    meta.update(client_meta)
    return MediaPayload(
        attachment_key=full_key,
        attachment_thumb_key=None,
        attachment_meta=meta,
        msg_type="video",
    )


async def resolve_attachment_urls(
    storage: S3Storage | None,
    attachment_key: str | None,
    attachment_thumb_key: str | None,
) -> tuple[str | None, str | None]:
    """Return (full_url, thumb_url) presigned. Both None if storage unavailable
    or keys missing. Best-effort: storage errors fall back to (None, None)."""
    if not storage or (not attachment_key and not attachment_thumb_key):
        return (None, None)
    full_url = None
    thumb_url = None
    try:
        if attachment_key:
            full_url = await storage.presigned_get(attachment_key)
        if attachment_thumb_key:
            thumb_url = await storage.presigned_get(attachment_thumb_key)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to presign attachment URLs")
        return (None, None)
    return (full_url, thumb_url)
