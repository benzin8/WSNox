"""Shared test helpers."""


def iter_route_paths(routes):
    """Recursively collect route paths from an app/router.

    FastAPI 0.137+ wraps routes registered via ``include_router`` in an
    ``_IncludedRouter`` object that has no ``.path``; the real sub-routes live
    under its ``original_router``. Walk into those so route-registration checks
    keep working across the starlette 1.x upgrade.
    """
    paths = []
    for route in routes:
        if hasattr(route, "path"):
            paths.append(route.path)
        original_router = getattr(route, "original_router", None)
        if original_router is not None:
            paths += iter_route_paths(getattr(original_router, "routes", []))
    return paths
