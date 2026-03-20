from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from messenger import PROJECT_ROOT
from .api_v1.routers import frontend_router
from .ws.router import ws_router

app = FastAPI()


FRONTEND_PUBLIC_DIR = PROJECT_ROOT / "src" / "messenger" / "frontend_react" / "dist"

app.mount("/assets",
        StaticFiles(directory=FRONTEND_PUBLIC_DIR / "assets"),
        name="assets")

app.include_router(frontend_router)
app.include_router(ws_router)
