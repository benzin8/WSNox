from fastapi import APIRouter
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from messenger import PROJECT_ROOT

frontend_router = APIRouter()

FRONTEND_PUBLIC_DIR = PROJECT_ROOT / "src" / "messenger" / "frontend_react" / "dist"

@frontend_router.get("/")
async def root():
    return FileResponse(FRONTEND_PUBLIC_DIR / "index.html")