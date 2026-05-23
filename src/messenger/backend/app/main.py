from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from messenger import PROJECT_ROOT
from messenger.backend.core.redis import close_redis, init_redis

from .api_v1.routers import frontend_router
from .api_v1.routers.auth_router import auth_router
from .api_v1.routers.chat_router import chat_router
from .api_v1.routers.profile_router import profile_router
from .api_v1.routers.push_router import push_router
from .ws.router import ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_redis()

    import asyncio

    from .ws.presence import presence_listener, sweep_forever
    from .ws.profile_events import profile_listener
    from .ws.router import manager

    chat_listener_task = asyncio.create_task(manager.pubsub_listener())
    presence_listener_task = asyncio.create_task(presence_listener(manager))
    profile_listener_task = asyncio.create_task(profile_listener(manager))
    sweeper_task = asyncio.create_task(sweep_forever(manager))

    try:
        yield
    finally:
        chat_listener_task.cancel()
        presence_listener_task.cancel()
        profile_listener_task.cancel()
        sweeper_task.cancel()
        await close_redis()

app = FastAPI(
    lifespan=lifespan,
    swagger_ui_parameters={"syntaxHighlight": False}
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_PUBLIC_DIR = PROJECT_ROOT / "src" / "messenger" / "frontend_react" / "dist"
ASSETS_DIR = FRONTEND_PUBLIC_DIR / "assets"

if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")


app.include_router(ws_router)
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(profile_router)
app.include_router(push_router)
app.include_router(frontend_router)