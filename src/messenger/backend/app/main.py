from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from messenger import PROJECT_ROOT
from .api_v1.routers import frontend_router
from .api_v1.routers.auth_router import auth_router
from .api_v1.routers.chat_router import chat_router
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

app = FastAPI(
    lifespan=lifespan,
    swagger_ui_parameters={"syntaxHighlight": False}
)

origins = [
    "http://localhost:5173",    # Стандартный порт Vite
    "http://127.0.0.1:5173",
    "http://localhost:8000",    # Docker backend
    "http://127.0.0.1:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_PUBLIC_DIR = PROJECT_ROOT / "src" / "messenger" / "frontend_react" / "dist"
ASSETS_DIR = FRONTEND_PUBLIC_DIR / "assets"

if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")

app.mount("/assets",
        StaticFiles(directory=FRONTEND_PUBLIC_DIR / "assets"),
        name="assets")


app.include_router(ws_router)
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(frontend_router)