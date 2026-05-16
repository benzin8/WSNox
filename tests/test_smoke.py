def test_app_imports_and_has_routes():
    from messenger.backend.app.main import app
    routes = [r.path for r in app.routes]
    assert len(routes) > 3
    assert any("/ws" in r for r in routes), "WebSocket route missing"
    assert any("/auth" in r for r in routes), "Auth route missing"
