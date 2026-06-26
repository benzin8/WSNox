"""Dependency providers for S3Storage."""
from __future__ import annotations

from fastapi import HTTPException, Request

from messenger.backend.services.storage import S3Storage


def get_storage(request: Request) -> S3Storage:
    """Return the request's app S3Storage, or 503 if storage is unconfigured."""
    storage: S3Storage | None = getattr(request.app.state, "storage", None)
    if storage is None:
        raise HTTPException(status_code=503, detail="Хранилище временно недоступно")
    return storage


def get_storage_optional(request: Request) -> S3Storage | None:
    """Like get_storage but returns None when storage is unconfigured."""
    return getattr(request.app.state, "storage", None)
