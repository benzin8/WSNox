from pathlib import Path

PACKAGE_ROOT = Path(__file__).parent # src/messenger
PROJECT_ROOT = PACKAGE_ROOT.parent.parent # messenger
FRONTEND_PUBLIC_DIR = PROJECT_ROOT / "src" / "messenger" / "frontend_react" / "dist"