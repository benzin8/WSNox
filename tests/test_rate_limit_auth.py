from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from messenger.backend.core import rate_limit
from messenger.backend.core.rate_limit import rate_limit_login, rate_limit_refresh


@pytest.mark.asyncio
async def test_login_limit_kicks_at_11th(monkeypatch, fake_redis):
    monkeypatch.setattr(rate_limit, "get_redis", lambda: fake_redis)
    request = MagicMock()
    request.headers = {"x-real-ip": "1.2.3.4"}
    request.client = MagicMock(host="1.2.3.4")

    for _ in range(10):
        await rate_limit_login(request=request)

    with pytest.raises(HTTPException) as exc:
        await rate_limit_login(request=request)
    assert exc.value.status_code == 429


@pytest.mark.asyncio
async def test_refresh_limit_kicks_at_31st(monkeypatch, fake_redis):
    monkeypatch.setattr(rate_limit, "get_redis", lambda: fake_redis)
    request = MagicMock()
    request.headers = {"x-real-ip": "5.6.7.8"}
    request.client = MagicMock(host="5.6.7.8")

    for _ in range(30):
        await rate_limit_refresh(request=request)

    with pytest.raises(HTTPException) as exc:
        await rate_limit_refresh(request=request)
    assert exc.value.status_code == 429


@pytest.mark.asyncio
async def test_login_limit_is_per_ip(monkeypatch, fake_redis):
    monkeypatch.setattr(rate_limit, "get_redis", lambda: fake_redis)

    def req(ip):
        r = MagicMock()
        r.headers = {"x-real-ip": ip}
        r.client = MagicMock(host=ip)
        return r

    # Exhaust one IP
    for _ in range(10):
        await rate_limit_login(request=req("9.9.9.9"))
    with pytest.raises(HTTPException):
        await rate_limit_login(request=req("9.9.9.9"))

    # A different IP is unaffected
    await rate_limit_login(request=req("8.8.8.8"))
