"""S3 wrapper for Yandex Object Storage (S3-compatible).

S3Storage prepends an environment prefix to every key (dev/ or prod/)
and surfaces errors as StorageError so callers don't depend on botocore.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import aioboto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class StorageError(RuntimeError):
    """Raised when an S3 operation fails for any reason other than expected idempotency."""


class S3Storage:
    def __init__(
        self,
        session: aioboto3.Session,
        *,
        endpoint_url: str,
        region: str,
        bucket: str,
        prefix: str,
    ) -> None:
        self._session = session
        self._endpoint_url = endpoint_url
        self._region = region
        self._bucket = bucket
        self._prefix = prefix.strip("/")

    def _full_key(self, key: str) -> str:
        return f"{self._prefix}/{key}" if self._prefix else key

    @asynccontextmanager
    async def _client(self) -> AsyncIterator[object]:
        async with self._session.client(
            "s3",
            endpoint_url=self._endpoint_url,
            region_name=self._region,
        ) as client:
            yield client

    async def put_object(self, key: str, body: bytes, content_type: str) -> None:
        try:
            async with self._client() as s3:
                await s3.put_object(
                    Bucket=self._bucket,
                    Key=self._full_key(key),
                    Body=body,
                    ContentType=content_type,
                )
        except ClientError as e:
            logger.exception("S3 put_object failed for key=%s", key)
            raise StorageError(str(e)) from e

    async def delete_object(self, key: str) -> None:
        try:
            async with self._client() as s3:
                await s3.delete_object(Bucket=self._bucket, Key=self._full_key(key))
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code")
            if code == "NoSuchKey":
                return
            logger.exception("S3 delete_object failed for key=%s", key)
            raise StorageError(str(e)) from e

    async def presigned_get(self, key: str, *, expires_in: int = 3600) -> str:
        try:
            async with self._client() as s3:
                return await s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": self._bucket, "Key": self._full_key(key)},
                    ExpiresIn=expires_in,
                )
        except ClientError as e:
            logger.exception("S3 generate_presigned_url failed for key=%s", key)
            raise StorageError(str(e)) from e
