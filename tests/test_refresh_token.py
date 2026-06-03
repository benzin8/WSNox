from datetime import timedelta

from messenger.backend.core.security import (
    create_pair_jwt_tokens,
    create_token,
    decode_token,
)


def test_decode_refresh_returns_user_id():
    tokens = create_pair_jwt_tokens(user_id=42)
    assert decode_token(tokens["refresh_token"], expected_type="refresh") == 42


def test_decode_rejects_access_token_when_refresh_expected():
    tokens = create_pair_jwt_tokens(user_id=42)
    assert decode_token(tokens["access_token"], expected_type="refresh") is None


def test_decode_rejects_expired_token():
    token = create_token({"sub": "1"}, timedelta(seconds=-1), is_refresh=True)
    assert decode_token(token, expected_type="refresh") is None


def test_decode_rejects_garbage():
    assert decode_token("not-a-jwt", expected_type="refresh") is None


def test_refresh_route_registered():
    from messenger.backend.app.main import app
    paths = [r.path for r in app.routes]
    assert any(p.endswith("/auth/refresh") for p in paths), \
        "POST /auth/refresh route missing"
