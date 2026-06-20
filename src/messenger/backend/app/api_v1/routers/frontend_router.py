
from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse

from messenger import FRONTEND_PUBLIC_DIR

frontend_router = APIRouter()

# index.html and the service worker must never be cached: index.html is rebuilt
# every deploy with new content-hashed asset names, and a stale SW shadows new
# code. A browser sitting on a cached index.html after a deploy requests an old
# /assets/index-XXXX.js that no longer exists -> 404 -> blank screen. The hashed
# files under /assets/ stay cacheable (served by the StaticFiles mount). This
# mirrors nginx/wsnox.conf and is a guaranteed fallback — it rides the backend
# image on every deploy, so it applies even if the reverse proxy's cache headers
# don't (e.g. its config wasn't reloaded). See docs/troubleshooting/cache-headers.md.
_NO_CACHE = {"Cache-Control": "no-cache"}


@frontend_router.get("/{rest_of_path:path}")
async def serve_react_app(rest_of_path: str):
    file_path = FRONTEND_PUBLIC_DIR / rest_of_path

    if rest_of_path != "" and file_path.exists() and file_path.is_file():
        headers = _NO_CACHE if rest_of_path == "sw.js" else None
        return FileResponse(file_path, headers=headers)

    index_file = FRONTEND_PUBLIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file, headers=_NO_CACHE)

    return HTMLResponse("Frontend build not found. Run 'npm run build'.", status_code=404)