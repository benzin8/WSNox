"""Phase 5: реестр ключей/TTL для chat-list, аватаров, админки."""
from messenger.backend.core import cache as cache_mod
from messenger.backend.core.cache import (
    ADMIN_LIVE_TTL,
    ADMIN_STATS_TTL,
    AVATAR_URL_TTL,
    CHATLIST_TTL,
    admin_live,
    admin_stats,
    avatar_url,
    chatlist,
    chats_unread,
)
from messenger.backend.services.avatar_urls import PRESIGN_TTL


def test_key_builders_are_namespaced():
    assert chats_unread(7) == "cache:chats:unread:7"
    assert chatlist(7) == "cache:chatlist:7"
    assert avatar_url("dev/avatars/abc.jpg") == "cache:avatar_urls:dev/avatars/abc.jpg"
    assert admin_stats() == "cache:admin:stats"
    assert admin_live() == "cache:admin:live"


def test_ttls_have_expected_values():
    assert CHATLIST_TTL == 90
    assert AVATAR_URL_TTL == 3000
    assert ADMIN_STATS_TTL == 60
    assert ADMIN_LIVE_TTL == 12


def test_avatar_ttl_strictly_below_presign_ttl():
    # Иначе клиент получит истёкший presigned-URL/403.
    assert AVATAR_URL_TTL < PRESIGN_TTL
    assert getattr(cache_mod, "AVATAR_URL_TTL") < PRESIGN_TTL


def test_chatlist_payload_flag_defaults_off():
    from messenger.backend.core.config import settings
    assert settings.cache_chatlist_payload is False
