from unittest.mock import AsyncMock, MagicMock

import pytest
from botocore.exceptions import ClientError
from fastapi import FastAPI, HTTPException
from starlette.requests import Request

from messenger.backend.services.deps import get_storage
from messenger.backend.services.storage import S3Storage, StorageError


def _make_session_mock(client_mock):
    """Build aioboto3.Session-shaped mock whose client() context-yields client_mock."""
    session = MagicMock()
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client_mock)
    cm.__aexit__ = AsyncMock(return_value=None)
    session.client = MagicMock(return_value=cm)
    return session


@pytest.mark.asyncio
async def test_put_object_prepends_prefix_to_key():
    client = AsyncMock()
    session = _make_session_mock(client)
    storage = S3Storage(
        session,
        endpoint_url="https://storage.yandexcloud.net",
        region="ru-central1",
        bucket="b",
        prefix="prod",
    )

    await storage.put_object("avatars/42/123/full.webp", b"data", "image/webp")

    client.put_object.assert_awaited_once()
    kwargs = client.put_object.await_args.kwargs
    assert kwargs["Bucket"] == "b"
    assert kwargs["Key"] == "prod/avatars/42/123/full.webp"
    assert kwargs["Body"] == b"data"
    assert kwargs["ContentType"] == "image/webp"


@pytest.mark.asyncio
async def test_presigned_get_uses_prefix():
    client = AsyncMock()
    client.generate_presigned_url.return_value = "https://signed.example/x"
    session = _make_session_mock(client)
    storage = S3Storage(
        session,
        endpoint_url="https://storage.yandexcloud.net",
        region="ru-central1",
        bucket="b",
        prefix="prod",
    )

    url = await storage.presigned_get("avatars/42/123/full.webp", expires_in=3600)

    assert url == "https://signed.example/x"
    client.generate_presigned_url.assert_awaited_once()
    args = client.generate_presigned_url.await_args
    assert args.args == ("get_object",)
    assert args.kwargs["Params"] == {
        "Bucket": "b",
        "Key": "prod/avatars/42/123/full.webp",
    }
    assert args.kwargs["ExpiresIn"] == 3600


@pytest.mark.asyncio
async def test_delete_object_passes_prefixed_key():
    client = AsyncMock()
    session = _make_session_mock(client)
    storage = S3Storage(
        session,
        endpoint_url="https://storage.yandexcloud.net",
        region="ru-central1",
        bucket="b",
        prefix="dev",
    )

    await storage.delete_object("avatars/7/x/thumb.webp")

    client.delete_object.assert_awaited_once_with(
        Bucket="b", Key="dev/avatars/7/x/thumb.webp"
    )


@pytest.mark.asyncio
async def test_delete_object_swallows_no_such_key():
    client = AsyncMock()
    client.delete_object.side_effect = ClientError(
        {"Error": {"Code": "NoSuchKey", "Message": "missing"}}, "DeleteObject"
    )
    session = _make_session_mock(client)
    storage = S3Storage(
        session,
        endpoint_url="https://storage.yandexcloud.net",
        region="ru-central1",
        bucket="b",
        prefix="dev",
    )

    # should NOT raise
    await storage.delete_object("avatars/7/x/thumb.webp")


@pytest.mark.asyncio
async def test_put_object_wraps_client_error_as_storage_error():
    client = AsyncMock()
    client.put_object.side_effect = ClientError(
        {"Error": {"Code": "InternalError", "Message": "boom"}}, "PutObject"
    )
    session = _make_session_mock(client)
    storage = S3Storage(
        session,
        endpoint_url="https://storage.yandexcloud.net",
        region="ru-central1",
        bucket="b",
        prefix="prod",
    )

    with pytest.raises(StorageError):
        await storage.put_object("k", b"d", "image/webp")


def _make_request(app: FastAPI) -> Request:
    return Request({"type": "http", "app": app, "headers": []})


def test_get_storage_returns_app_state():
    app = FastAPI()
    sentinel = object()
    app.state.storage = sentinel
    assert get_storage(_make_request(app)) is sentinel


def test_get_storage_raises_503_when_none():
    app = FastAPI()
    app.state.storage = None
    with pytest.raises(HTTPException) as e:
        get_storage(_make_request(app))
    assert e.value.status_code == 503
