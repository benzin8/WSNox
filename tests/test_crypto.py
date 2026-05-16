import pytest
from messenger.backend.core.crypto import encrypt_message, decrypt_message


def test_roundtrip_ascii():
    msg = "Hello, World!"
    assert decrypt_message(encrypt_message(msg)) == msg


def test_roundtrip_cyrillic():
    msg = "Привет, мир! Как дела?"
    assert decrypt_message(encrypt_message(msg)) == msg


def test_roundtrip_long_message():
    msg = "А" * 1000
    assert decrypt_message(encrypt_message(msg)) == msg


def test_roundtrip_multiblock():
    # AES block = 16 bytes; test message spanning several blocks
    msg = "x" * 47
    assert decrypt_message(encrypt_message(msg)) == msg


def test_unique_ciphertexts_same_plaintext():
    # Each call must generate a fresh IV — identical plaintext must not produce identical ciphertext
    msg = "одно и то же сообщение"
    c1 = encrypt_message(msg)
    c2 = encrypt_message(msg)
    assert c1 != c2, "IV must be unique per encryption — CBC mode is broken without it"


def test_ciphertext_is_base64_string():
    import base64
    ct = encrypt_message("test")
    # Should not raise
    decoded = base64.b64decode(ct)
    assert len(decoded) > 16  # at least IV (16 bytes) + one cipherblock


def test_invalid_base64_returns_error():
    result = decrypt_message("это_не_base64!!!")
    assert result.startswith("[Ошибка расшифровки")


def test_truncated_ciphertext_returns_error():
    # Only IV bytes, no ciphertext — unpadding will fail
    import base64, os
    bad = base64.b64encode(os.urandom(16)).decode()
    result = decrypt_message(bad)
    assert result.startswith("[Ошибка расшифровки")
