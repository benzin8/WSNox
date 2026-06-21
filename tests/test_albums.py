from messenger.backend.core.albums import (
    ALBUM_MAX,
    album_keys_to_delete,
    is_valid_album_id,
    is_valid_album_index,
)


def test_album_max_is_ten():
    assert ALBUM_MAX == 10


def test_valid_album_id_accepts_short_alnum():
    assert is_valid_album_id("a1b2c3d4")
    assert is_valid_album_id("ABCdef0123456789")


def test_valid_album_id_rejects_bad():
    assert not is_valid_album_id("")
    assert not is_valid_album_id(None)
    assert not is_valid_album_id("has space")
    assert not is_valid_album_id("slash/inject")
    assert not is_valid_album_id("x" * 33)  # over 32 chars


def test_valid_album_index_within_cap():
    assert is_valid_album_index(0)
    assert is_valid_album_index(9)


def test_invalid_album_index():
    assert not is_valid_album_index(-1)
    assert not is_valid_album_index(10)  # 0..9 only
    assert not is_valid_album_index(None)
    assert not is_valid_album_index(True)  # bool is not a valid index


def test_album_keys_collects_all_rows():
    rows = [
        {"attachment_key": "a", "attachment_thumb_key": "at"},
        {"attachment_key": "b", "attachment_thumb_key": None},
        {"attachment_key": "c", "attachment_thumb_key": "ct"},
    ]
    assert album_keys_to_delete(rows) == {"a", "at", "b", "c", "ct"}


def test_album_keys_skips_none():
    rows = [{"attachment_key": None, "attachment_thumb_key": None}]
    assert album_keys_to_delete(rows) == set()
