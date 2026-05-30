from io import BytesIO
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi import UploadFile
from PIL import Image
from starlette.datastructures import Headers

from messenger.backend.services.avatar import (
    FileTooLarge,
    InvalidImage,
    UnsupportedFormat,
    process_and_upload_avatar,
)

FIXTURES = Path(__file__).parent / "fixtures"


def _upload_file(data: bytes, filename: str, content_type: str) -> UploadFile:
    """Build an UploadFile with an explicit content-type via headers."""
    headers = Headers({"content-type": content_type})
    return UploadFile(filename=filename, file=BytesIO(data), headers=headers)


@pytest.fixture
def mock_storage():
    return AsyncMock()


@pytest.mark.asyncio
async def test_ok_png_produces_two_webp_uploads(mock_storage):
    upload = _upload_file(
        (FIXTURES / "avatar_ok.png").read_bytes(), "avatar.png", "image/png"
    )

    result = await process_and_upload_avatar(mock_storage, user_id=42, file=upload)

    assert mock_storage.put_object.await_count == 2
    full_call, thumb_call = mock_storage.put_object.await_args_list
    assert full_call.args[0].startswith("avatars/42/")
    assert full_call.args[0].endswith("/full.webp")
    assert thumb_call.args[0].startswith("avatars/42/")
    assert thumb_call.args[0].endswith("/thumb.webp")
    assert full_call.args[2] == "image/webp"
    assert thumb_call.args[2] == "image/webp"
    full_img = Image.open(BytesIO(full_call.args[1]))
    thumb_img = Image.open(BytesIO(thumb_call.args[1]))
    assert full_img.size == (512, 512)
    assert thumb_img.size == (96, 96)
    assert result.full_key == full_call.args[0]
    assert result.thumb_key == thumb_call.args[0]


@pytest.mark.asyncio
async def test_unsupported_mime_raises_and_uploads_nothing(mock_storage):
    upload = _upload_file(
        (FIXTURES / "avatar_ok.png").read_bytes(), "avatar.png", "text/plain"
    )

    with pytest.raises(UnsupportedFormat):
        await process_and_upload_avatar(mock_storage, user_id=1, file=upload)

    mock_storage.put_object.assert_not_called()


@pytest.mark.asyncio
async def test_corrupted_image_raises_invalid(mock_storage):
    upload = _upload_file(
        (FIXTURES / "avatar_corrupted.png").read_bytes(), "x.png", "image/png"
    )

    with pytest.raises(InvalidImage):
        await process_and_upload_avatar(mock_storage, user_id=1, file=upload)

    mock_storage.put_object.assert_not_called()


@pytest.mark.asyncio
async def test_oversize_raises_file_too_large(mock_storage):
    big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (6 * 1024 * 1024)
    upload = _upload_file(big, "big.png", "image/png")

    with pytest.raises(FileTooLarge):
        await process_and_upload_avatar(mock_storage, user_id=1, file=upload)

    mock_storage.put_object.assert_not_called()
