"""Tests for the chat media upload pipeline (image + video paths)."""
from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi import UploadFile
from PIL import Image
from starlette.datastructures import Headers

from messenger.backend.services.media import (
    EmptyFile,
    FileTooLarge,
    InvalidImage,
    InvalidMeta,
    UnsupportedFormat,
    _validate_video_meta,
    process_image,
    process_video,
    resolve_attachment_urls,
)

FIXTURES = Path(__file__).parent / "fixtures"


def _upload(data: bytes, filename: str, content_type: str) -> UploadFile:
    headers = Headers({"content-type": content_type})
    return UploadFile(filename=filename, file=BytesIO(data), headers=headers)


@pytest.fixture
def mock_storage():
    s = AsyncMock()
    s.presigned_get.return_value = "https://signed.example/x"
    return s


# ── images ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_process_image_uploads_full_and_thumb(mock_storage):
    raw = (FIXTURES / "avatar_ok.png").read_bytes()
    upload = _upload(raw, "pic.png", "image/png")

    result = await process_image(mock_storage, user_id=7, file=upload)

    assert result.msg_type == "image"
    assert mock_storage.put_object.await_count == 2
    full_call, thumb_call = mock_storage.put_object.await_args_list
    assert full_call.args[0].startswith("media/7/")
    assert full_call.args[0].endswith(".jpg")
    assert thumb_call.args[0].endswith("_thumb.jpg")
    assert full_call.args[2] == "image/jpeg"
    assert thumb_call.args[2] == "image/jpeg"
    # both should decode
    Image.open(BytesIO(full_call.args[1])).verify()
    Image.open(BytesIO(thumb_call.args[1])).verify()
    assert result.attachment_meta["content_type"] == "image/jpeg"
    assert "width" in result.attachment_meta
    assert "height" in result.attachment_meta


@pytest.mark.asyncio
async def test_process_image_rejects_unsupported_mime(mock_storage):
    upload = _upload(b"hello", "x.txt", "text/plain")
    with pytest.raises(UnsupportedFormat):
        await process_image(mock_storage, 1, upload)
    mock_storage.put_object.assert_not_called()


@pytest.mark.asyncio
async def test_process_image_rejects_corrupted(mock_storage):
    raw = (FIXTURES / "avatar_corrupted.png").read_bytes()
    upload = _upload(raw, "x.png", "image/png")
    with pytest.raises(InvalidImage):
        await process_image(mock_storage, 1, upload)
    mock_storage.put_object.assert_not_called()


@pytest.mark.asyncio
async def test_process_image_rejects_oversize(mock_storage):
    big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (11 * 1024 * 1024)
    upload = _upload(big, "big.png", "image/png")
    with pytest.raises(FileTooLarge):
        await process_image(mock_storage, 1, upload)
    mock_storage.put_object.assert_not_called()


@pytest.mark.asyncio
async def test_process_image_rejects_empty(mock_storage):
    upload = _upload(b"", "empty.png", "image/png")
    with pytest.raises(EmptyFile):
        await process_image(mock_storage, 1, upload)


@pytest.mark.asyncio
async def test_process_image_downscales_large_image(mock_storage):
    # generate a 3000×2000 image — bigger than IMAGE_MAX_SIDE=1920
    img = Image.new("RGB", (3000, 2000), color=(120, 200, 80))
    buf = BytesIO()
    img.save(buf, "PNG")
    upload = _upload(buf.getvalue(), "big.png", "image/png")

    result = await process_image(mock_storage, user_id=1, file=upload)

    assert result.attachment_meta["width"] <= 1920
    assert result.attachment_meta["height"] <= 1920
    assert result.attachment_meta["original_width"] == 3000
    assert result.attachment_meta["original_height"] == 2000


# ── videos ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_process_video_uploads_raw_and_uses_client_meta(mock_storage):
    raw = b"\x00\x00\x00\x20ftypmp42" + b"\x01" * 1024  # not a real mp4 but enough for stub
    upload = _upload(raw, "clip.mp4", "video/mp4")
    client_meta = '{"width": 720, "height": 1280, "duration_ms": 12500}'

    result = await process_video(mock_storage, user_id=11, file=upload, client_meta_raw=client_meta)

    assert result.msg_type == "video"
    assert result.attachment_thumb_key is None
    assert mock_storage.put_object.await_count == 1
    call = mock_storage.put_object.await_args
    assert call.args[0].startswith("media/11/")
    assert call.args[0].endswith(".mp4")
    assert call.args[2] == "video/mp4"
    assert result.attachment_meta["width"] == 720
    assert result.attachment_meta["height"] == 1280
    assert result.attachment_meta["duration_ms"] == 12500
    assert result.attachment_meta["content_type"] == "video/mp4"


@pytest.mark.asyncio
async def test_process_video_rejects_unknown_mime(mock_storage):
    upload = _upload(b"\x00" * 100, "x.avi", "video/x-msvideo")
    with pytest.raises(UnsupportedFormat):
        await process_video(mock_storage, 1, upload, "{}")
    mock_storage.put_object.assert_not_called()


@pytest.mark.asyncio
async def test_process_video_rejects_oversize(mock_storage):
    big = b"\x00" * (51 * 1024 * 1024)
    upload = _upload(big, "huge.mp4", "video/mp4")
    with pytest.raises(FileTooLarge):
        await process_video(mock_storage, 1, upload, "{}")
    mock_storage.put_object.assert_not_called()


def test_validate_video_meta_drops_unknown_keys():
    out = _validate_video_meta('{"width": 100, "height": 200, "duration_ms": 1000, "foo": "bar"}')
    assert out == {"width": 100, "height": 200, "duration_ms": 1000}


def test_validate_video_meta_rejects_negative():
    with pytest.raises(InvalidMeta):
        _validate_video_meta('{"width": -1}')


def test_validate_video_meta_rejects_oversized_duration():
    with pytest.raises(InvalidMeta):
        _validate_video_meta('{"duration_ms": 999999999}')


def test_validate_video_meta_empty_string_is_ok():
    assert _validate_video_meta("") == {}


def test_validate_video_meta_invalid_json():
    with pytest.raises(InvalidMeta):
        _validate_video_meta("{not json")


# ── url resolver ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_resolve_attachment_urls_returns_none_when_storage_missing():
    full, thumb = await resolve_attachment_urls(None, "k", "t")
    assert full is None and thumb is None


@pytest.mark.asyncio
async def test_resolve_attachment_urls_calls_storage(mock_storage):
    full, thumb = await resolve_attachment_urls(mock_storage, "media/1/a.jpg", "media/1/a_thumb.jpg")
    assert full == "https://signed.example/x"
    assert thumb == "https://signed.example/x"
    assert mock_storage.presigned_get.await_count == 2


@pytest.mark.asyncio
async def test_resolve_attachment_urls_handles_only_full(mock_storage):
    full, thumb = await resolve_attachment_urls(mock_storage, "media/1/a.mp4", None)
    assert full == "https://signed.example/x"
    assert thumb is None
    assert mock_storage.presigned_get.await_count == 1
