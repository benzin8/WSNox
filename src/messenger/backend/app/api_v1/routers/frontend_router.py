
from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse

from messenger import FRONTEND_PUBLIC_DIR

frontend_router = APIRouter()

@frontend_router.get("/{rest_of_path:path}")
async def serve_react_app(rest_of_path: str):
    file_path = FRONTEND_PUBLIC_DIR / rest_of_path

    if rest_of_path != "" and file_path.exists() and file_path.is_file():
        return FileResponse(file_path)
    
    index_file = FRONTEND_PUBLIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)

    return HTMLResponse("Frontend build not found. Run 'npm run build'.", status_code=404)