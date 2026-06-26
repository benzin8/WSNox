from contextlib import asynccontextmanager

import aioboto3
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from messenger import PROJECT_ROOT
from messenger.backend.core.config import settings
from messenger.backend.core.redis import close_redis, init_redis
from messenger.backend.services.storage import S3Storage

from .api_v1.routers import frontend_router
from .api_v1.routers.admin_router import admin_router
from .api_v1.routers.auth_router import auth_router
from .api_v1.routers.webauthn_router import webauthn_router
from .api_v1.routers.chat_router import chat_router
from .api_v1.routers.notification_router import notification_router
from .api_v1.routers.profile_router import profile_router
from .api_v1.routers.push_router import push_router
from .ws.router import ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_redis()

    if settings.s3_bucket and settings.s3_access_key_id and settings.s3_secret_access_key:
        session = aioboto3.Session(
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
        )
        app.state.storage = S3Storage(
            session,
            endpoint_url=settings.s3_endpoint_url,
            region=settings.s3_region,
            bucket=settings.s3_bucket,
            prefix=settings.s3_prefix,
        )
    else:
        app.state.storage = None

    import asyncio

    from .ws import ephemeral
    from .ws.presence import presence_listener, sweep_forever
    from .ws.profile_events import profile_listener
    from .ws.router import manager

    chat_listener_task = asyncio.create_task(manager.pubsub_listener())
    read_receipts_task = asyncio.create_task(manager.read_receipts_listener())
    deletions_task = asyncio.create_task(manager.deletions_listener())
    edits_task = asyncio.create_task(manager.edits_listener())
    reactions_task = asyncio.create_task(manager.reactions_listener())
    chat_events_task = asyncio.create_task(manager.chat_events_listener())
    presence_listener_task = asyncio.create_task(presence_listener(manager))
    profile_listener_task = asyncio.create_task(profile_listener(manager))
    sweeper_task = asyncio.create_task(sweep_forever(manager))
    ephemeral_task = asyncio.create_task(ephemeral.ephemeral_listener(manager))

    try:
        yield
    finally:
        chat_listener_task.cancel()
        read_receipts_task.cancel()
        deletions_task.cancel()
        edits_task.cancel()
        reactions_task.cancel()
        chat_events_task.cancel()
        presence_listener_task.cancel()
        profile_listener_task.cancel()
        sweeper_task.cancel()
        ephemeral_task.cancel()
        await close_redis()

app = FastAPI(
    lifespan=lifespan,
    # API docs are an endpoint map for attackers — only expose them in debug.
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
    swagger_ui_parameters={"syntaxHighlight": False},
)

# Same-origin app, so CORS isn't hit in normal use; restrict it to our own
# frontend so a random site can't script authenticated cross-origin calls.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_base_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_PUBLIC_DIR = PROJECT_ROOT / "src" / "messenger" / "frontend_react" / "dist"
ASSETS_DIR = FRONTEND_PUBLIC_DIR / "assets"

if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")


app.include_router(ws_router)
app.include_router(auth_router)
app.include_router(webauthn_router)
app.include_router(chat_router)
app.include_router(profile_router)
app.include_router(push_router)
app.include_router(notification_router)
app.include_router(admin_router)
app.include_router(frontend_router)