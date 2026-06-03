def test_unread_total_route_registered():
    from messenger.backend.app.main import app
    paths = [r.path for r in app.routes]
    assert any(p.endswith("/chats/unread-total") for p in paths), \
        "GET /chats/unread-total route missing"
