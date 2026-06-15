def test_unread_total_route_registered():
    from messenger.backend.app.main import app
    from tests._helpers import iter_route_paths
    paths = iter_route_paths(app.routes)
    assert any(p.endswith("/chats/unread-total") for p in paths), \
        "GET /chats/unread-total route missing"
