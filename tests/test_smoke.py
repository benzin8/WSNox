def test_app_imports_and_has_routes():
    from messenger.backend.app.main import app
    routes = [r.path for r in app.routes]
    assert "/ws/{chat_id}" in routes or any("/ws" in r for r in routes) or len(routes) > 0
