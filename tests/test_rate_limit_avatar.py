from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from messenger.backend.core import rate_limit
from messenger.backend.core.rate_limit import rate_limit_avatar_upload


@pytest.mark.asyncio
async def test_avatar_upload_limit_kicks_at_11th(monkeypatch, fake_redis):
    monkeypatch.setattr(rate_limit, "get_redis", lambda: fake_redis)
    request = MagicMock()
    request.headers = {"x-real-ip": "1.2.3.4"}
    request.client = MagicMock(host="1.2.3.4")
    user = MagicMock(id=99)

    for _ in range(10):
        await rate_limit_avatar_upload(request=request, current_user=user)

    with pytest.raises(HTTPException) as exc:
        await rate_limit_avatar_upload(request=request, current_user=user)
    assert exc.value.status_code == 429
