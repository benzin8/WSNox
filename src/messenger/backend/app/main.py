from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from messenger import PROJECT_ROOT
from .api_v1.routers import frontend_router
from .ws.router import ws_router
from messenger.backend.core.redis import init_redis, close_redis

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Инициализация Redis
    await init_redis()
    
    # Старт Pub/Sub слушателя для WebSockets
    from .ws.router import manager
    import asyncio
    listener_task = asyncio.create_task(manager.pubsub_listener())
    
    yield
    
    # Завершение работы
    listener_task.cancel()
    await close_redis()

app = FastAPI(lifespan=lifespan)

FRONTEND_PUBLIC_DIR = PROJECT_ROOT / "src" / "messenger" / "frontend_react" / "dist"

app.mount("/assets",
        StaticFiles(directory=FRONTEND_PUBLIC_DIR / "assets"),
        name="assets")

app.include_router(frontend_router)
app.include_router(ws_router)
