"""Album (multi-photo collage) constraints, shared by the upload path and tests."""
import re

# Max photos per album. Multiplies upload volume, so this cap is enforced
# server-side too (not just in the picker).
ALBUM_MAX = 10

_ALBUM_ID_RE = re.compile(r"^[A-Za-z0-9]{1,32}$")


def is_valid_album_id(value) -> bool:
    """A client-generated album id: 1..32 alphanumeric chars, nothing else
    (so it can't inject into S3 keys, logs, or queries)."""
    return isinstance(value, str) and bool(_ALBUM_ID_RE.match(value))


def is_valid_album_index(value) -> bool:
    """0-based position within an album, 0..ALBUM_MAX-1."""
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value < ALBUM_MAX


def album_keys_to_delete(rows) -> set:
    """Collect every non-null S3 object key across an album's rows.

    ``rows`` is any iterable of objects/dicts exposing ``attachment_key`` and
    ``attachment_thumb_key`` (dicts in tests, ORM rows in prod via getattr)."""
    keys = set()
    for r in rows:
        get = r.get if isinstance(r, dict) else (lambda k, _r=r: getattr(_r, k, None))
        for field in ("attachment_key", "attachment_thumb_key"):
            v = get(field, None)
            if v:
                keys.add(v)
    return keys
