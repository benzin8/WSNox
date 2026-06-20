"""Media upload pipeline for chat attachments.

Three paths:
- Images go through Pillow (validate, downscale, re-encode as JPEG, thumbnail).
  Re-encoding drops ALL EXIF/metadata (GPS, camera, timestamps) — the saved
  JPEG carries none of the source's tags.
- Videos are streamed to S3. When ffmpeg is available the container metadata
  (incl. GPS) is stripped via a stream copy (no transcode); otherwise the raw
  bytes are stored. Dimensions/duration come from the client-supplied meta blob.
- Voice/audio messages are stored the same way as video (size/mime bound +
  best-effort metadata strip); duration comes from the client meta.

Both flows raise typed exceptions so the router can translate to HTTP cleanly.
"""
from __future__ import annotations

import array
import asyncio
import json
import logging
import os
import shutil
import sys
import tempfile
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
# Voice notes are recorded in-browser via MediaRecorder (usually webm/opus or
# ogg/opus); we also accept the common mp4/aac/mpeg/wav containers.
ALLOWED_AUDIO_MIME = {
    "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg",
    "audio/aac", "audio/wav", "audio/x-wav",
}
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_VIDEO_BYTES = 50 * 1024 * 1024
MAX_AUDIO_BYTES = 20 * 1024 * 1024
MAX_DURATION_MS = 5 * 60 * 1000  # 5 min hard cap for client-reported duration

# ffmpeg path (present in the Docker image; may be absent in local/dev/test —
# metadata stripping is best-effort and falls back to the raw bytes).
FFMPEG_BIN = shutil.which("ffmpeg")
FFMPEG_TIMEOUT_S = 60

_AV_EXT = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
}

IMAGE_MAX_SIDE = 1920
# Thumb is shown in the chat bubble (~260 CSS px) on devices up to ~3x DPR, so
# a 320px thumb was upscaled and looked blurry. 720px keeps it crisp there.
THUMB_MAX_SIDE = 720
IMAGE_QUALITY = 82
THUMB_QUALITY = 82
READ_CHUNK = 64 * 1024
# Number of amplitude bars in a voice-note waveform (computed server-side from
# the decoded audio and stored in attachment_meta["waveform"]).
WAVEFORM_BUCKETS = 40

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


def _validate_av_meta(client_meta_raw: str) -> dict[str, Any]:
    """Parse and bound-check client-supplied A/V meta. Empty/missing → {}."""
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


# Backwards-compatible alias (older imports / tests referenced this name).
_validate_video_meta = _validate_av_meta


async def _strip_av_metadata(raw: bytes, ext: str) -> bytes:
    """Strip container metadata (GPS, device, timestamps) from an A/V blob.

    Uses `ffmpeg -map_metadata -1 -c copy` — a stream copy, so it re-muxes
    without re-encoding (fast, lossless). Best-effort: if ffmpeg is missing or
    fails for any reason we return the ORIGINAL bytes so the upload still works.
    Operates via temp files because mp4's moov atom is not pipe-friendly.
    """
    if not FFMPEG_BIN:
        return raw

    in_path = out_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as fin:
            fin.write(raw)
            in_path = fin.name
        out_path = f"{in_path}.clean.{ext}"

        args = [FFMPEG_BIN, "-y", "-i", in_path, "-map_metadata", "-1", "-c", "copy"]
        if ext in ("mp4", "mov", "m4a"):
            # Move the moov atom to the front for progressive playback.
            args += ["-movflags", "+faststart"]
        args.append(out_path)

        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=FFMPEG_TIMEOUT_S)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            logger.warning("ffmpeg metadata strip timed out; keeping original")
            return raw

        if proc.returncode != 0:
            logger.warning("ffmpeg metadata strip failed (%s); keeping original",
                           (stderr or b"").decode("utf-8", "ignore")[:200])
            return raw

        with open(out_path, "rb") as f:
            cleaned = f.read()
        return cleaned or raw
    except Exception:  # noqa: BLE001
        logger.exception("metadata strip errored; keeping original")
        return raw
    finally:
        for p in (in_path, out_path):
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass


def _pcm_to_peaks(pcm: bytes, buckets: int = WAVEFORM_BUCKETS) -> list[int] | None:
    """Reduce signed 16-bit little-endian mono PCM to `buckets` peak amplitudes.

    Each bucket is the max absolute sample in its slice, normalized so the
    loudest bucket is 100 (relative scaling keeps quiet recordings visible).
    Empty or pure-silence audio → None, so the caller can fall back to a static
    placeholder waveform.
    """
    usable = len(pcm) - (len(pcm) % 2)
    if usable <= 0:
        return None
    samples = array.array("h")
    samples.frombytes(pcm[:usable])
    if sys.byteorder == "big":  # ffmpeg emits little-endian; match native
        samples.byteswap()
    n = len(samples)
    if n == 0:
        return None
    step = max(1, n // buckets)
    peaks: list[int] = []
    for i in range(buckets):
        start = i * step
        end = n if i == buckets - 1 else min(n, start + step)
        chunk = samples[start:end]
        peaks.append(max(max(chunk), -min(chunk)) if chunk else 0)
    top = max(peaks)
    if top <= 0:
        return None
    return [round(p * 100 / top) for p in peaks]


async def _compute_waveform(raw: bytes, ext: str, buckets: int = WAVEFORM_BUCKETS) -> list[int] | None:
    """Decode an audio blob to mono PCM via ffmpeg and reduce it to amplitude peaks.

    Best-effort: ffmpeg missing/timeout/failure or silent audio → None and the
    client renders a static placeholder instead. Decodes at 8 kHz mono — plenty
    for an amplitude envelope and cheap to process.
    """
    if not FFMPEG_BIN:
        return None
    in_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as fin:
            fin.write(raw)
            in_path = fin.name
        args = [
            FFMPEG_BIN, "-v", "error", "-i", in_path,
            "-ac", "1", "-ar", "8000", "-f", "s16le", "-",
        ]
        proc = await asyncio.create_subprocess_exec(
            *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        try:
            pcm, stderr = await asyncio.wait_for(proc.communicate(), timeout=FFMPEG_TIMEOUT_S)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            logger.warning("ffmpeg waveform decode timed out")
            return None
        if proc.returncode != 0 or not pcm:
            logger.warning("ffmpeg waveform decode failed (%s)",
                           (stderr or b"").decode("utf-8", "ignore")[:200])
            return None
        return _pcm_to_peaks(pcm, buckets)
    except Exception:  # noqa: BLE001
        logger.exception("waveform computation errored")
        return None
    finally:
        if in_path and os.path.exists(in_path):
            try:
                os.remove(in_path)
            except OSError:
                pass


async def _process_av(
    storage: S3Storage,
    user_id: int,
    file: UploadFile,
    client_meta_raw: str,
    *,
    allowed_mime: set[str],
    max_bytes: int,
    msg_type: str,
    compute_waveform: bool = False,
) -> MediaPayload:
    """Shared path for video + voice: bound size/mime, strip metadata, store."""
    base_mime = (file.content_type or "").split(";")[0].strip()
    if base_mime not in allowed_mime:
        raise UnsupportedFormat()

    raw = await _read_bounded(file, max_bytes)
    if not raw:
        raise EmptyFile()

    client_meta = _validate_av_meta(client_meta_raw)

    ext = _AV_EXT.get(base_mime, "bin")
    cleaned = await _strip_av_metadata(raw, ext)

    ts = int(datetime.now(timezone.utc).timestamp())
    obj_id = uuid.uuid4().hex
    full_key = f"media/{user_id}/{ts}/{obj_id}.{ext}"

    await storage.put_object(full_key, cleaned, base_mime)

    meta: dict[str, Any] = {
        "size_bytes": len(cleaned),
        "content_type": base_mime,
    }
    meta.update(client_meta)
    if compute_waveform:
        peaks = await _compute_waveform(cleaned, ext)
        if peaks:
            meta["waveform"] = peaks
    return MediaPayload(
        attachment_key=full_key,
        attachment_thumb_key=None,
        attachment_meta=meta,
        msg_type=msg_type,
    )


async def process_video(
    storage: S3Storage,
    user_id: int,
    file: UploadFile,
    client_meta_raw: str,
) -> MediaPayload:
    return await _process_av(
        storage, user_id, file, client_meta_raw,
        allowed_mime=ALLOWED_VIDEO_MIME, max_bytes=MAX_VIDEO_BYTES, msg_type="video",
    )


async def process_audio(
    storage: S3Storage,
    user_id: int,
    file: UploadFile,
    client_meta_raw: str,
) -> MediaPayload:
    """Voice note: same pipeline as video, msg_type='voice', plus a waveform."""
    return await _process_av(
        storage, user_id, file, client_meta_raw,
        allowed_mime=ALLOWED_AUDIO_MIME, max_bytes=MAX_AUDIO_BYTES, msg_type="voice",
        compute_waveform=True,
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
