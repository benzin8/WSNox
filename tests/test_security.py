import pytest
from messenger.backend.core.security import (
    hash_password,
    verify_password,
    create_pair_jwt_tokens,
    create_token,
    SECRET_KEY,
    ALGORITHM,
)
from datetime import timedelta
from jose import jwt


def test_hash_returns_bcrypt_string():
    h = hash_password("mypassword123")
    assert isinstance(h, str)
    assert h.startswith("$2b$"), "Expected bcrypt hash format $2b$..."


def test_verify_correct_password():
    password = "correct_horse_battery"
    h = hash_password(password)
    assert verify_password(password, h) is True


def test_verify_wrong_password():
    h = hash_password("correct_password")
    assert verify_password("wrong_password", h) is False


def test_same_password_different_hashes():
    # bcrypt includes random salt — two hashes of same password must differ
    h1 = hash_password("password")
    h2 = hash_password("password")
    assert h1 != h2, "bcrypt must produce unique hashes (different salts)"


def test_verify_still_works_after_different_hash():
    password = "stable_password"
    h1 = hash_password(password)
    h2 = hash_password(password)
    assert verify_password(password, h1) is True
    assert verify_password(password, h2) is True


def test_create_pair_returns_both_tokens():
    tokens = create_pair_jwt_tokens(user_id=42)
    assert "access_token" in tokens
    assert "refresh_token" in tokens


def test_access_token_is_string():
    tokens = create_pair_jwt_tokens(user_id=1)
    assert isinstance(tokens["access_token"], str)
    assert isinstance(tokens["refresh_token"], str)


def test_access_and_refresh_differ():
    tokens = create_pair_jwt_tokens(user_id=1)
    assert tokens["access_token"] != tokens["refresh_token"]


def test_access_token_payload():
    tokens = create_pair_jwt_tokens(user_id=99)
    payload = jwt.decode(tokens["access_token"], SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == "99"
    assert payload["type"] == "access"


def test_refresh_token_payload():
    tokens = create_pair_jwt_tokens(user_id=7)
    payload = jwt.decode(tokens["refresh_token"], SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == "7"
    assert payload["type"] == "refresh"


def test_expired_token_raises():
    from jose import ExpiredSignatureError
    token = create_token({"sub": "1"}, expires_delta=timedelta(seconds=-1))
    with pytest.raises(ExpiredSignatureError):
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
