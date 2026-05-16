# CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automated pipeline — push to `main` triggers lint → test → Docker build → push to GHCR → SSH deploy to Oracle Cloud Free VPS.

**Architecture:** GitHub Actions runs CI on all branches and full deploy only on `main`. The existing multi-stage Dockerfile builds a single image (React + FastAPI). Production compose on VPS pulls the image from GHCR; MySQL and Redis run as local compose services. Nginx on VPS handles HTTPS termination.

**Tech Stack:** GitHub Actions, Docker, GHCR, Oracle Cloud Free VPS, Nginx, Let's Encrypt (certbot), ruff (Python lint), eslint (JS lint), pytest.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `pyproject.toml` | Modify | Add ruff + pytest dev dependencies and config sections |
| `entrypoint.sh` | Modify | Add `DEBUG` env var check — use `--reload` only in dev |
| `tests/test_smoke.py` | Create | Minimal smoke test — imports the FastAPI app |
| `.github/workflows/ci.yml` | Create | Lint (ruff + eslint) + test on every push and PR |
| `.github/workflows/deploy.yml` | Create | Build image, push to GHCR, SSH deploy — main branch only |
| `docker-compose.prod.yml` | Create | Production compose: image from GHCR, no dev volumes |
| `nginx/wsnox.conf` | Create | Nginx reverse proxy with WebSocket upgrade headers |
| `scripts/setup-vps.sh` | Create | One-time VPS setup: Docker, Nginx, Certbot |
| `DEPLOY.md` | Create | Reference doc: links, runbooks, rollback instructions |

---

## Task 1: Add dev dependencies and ruff config to pyproject.toml

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Add dev dependencies group and tool config**

Open `pyproject.toml` and add these sections after the existing `[build-system]` block:

```toml
[tool.poetry.group.dev.dependencies]
ruff = ">=0.4.0,<1.0.0"
pytest = ">=8.0.0,<9.0.0"
pytest-asyncio = ">=0.23.0,<1.0.0"

[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 2: Install new deps**

```bash
cd C:\Users\benzi\projs\WSNox
poetry install --no-interaction
```

Expected: resolves without error, `ruff` and `pytest` are now available.

- [ ] **Step 3: Verify ruff runs**

```bash
poetry run ruff check src/
```

Expected: either no output (clean) or a list of fixable issues. Fix any `F` (undefined name) or `E` errors if they appear by running `poetry run ruff check src/ --fix`.

- [ ] **Step 4: Commit**

```bash
git add pyproject.toml poetry.lock
git commit -m "chore: add ruff and pytest dev dependencies"
```

---

## Task 2: Add DEBUG flag to entrypoint.sh

**Files:**
- Modify: `entrypoint.sh`

The current entrypoint always passes `--reload` which is a development flag. Production image should not use it.

- [ ] **Step 1: Replace the uvicorn start line**

Current last line of `entrypoint.sh`:
```bash
exec uvicorn messenger.backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

Replace the entire file content with:

```bash
#!/bin/bash

echo "Waiting for database to be ready..."
while ! printf "" 2>>/dev/null >>/dev/tcp/$DB_HOST/$DB_PORT; do
  sleep 1
done
echo "Database is ready!"

echo "Running migrations..."
alembic upgrade head

echo "Starting server..."
if [ "${DEBUG:-false}" = "true" ]; then
  exec uvicorn messenger.backend.app.main:app --host 0.0.0.0 --port 8000 --reload
else
  exec uvicorn messenger.backend.app.main:app --host 0.0.0.0 --port 8000 --workers 2
fi
```

- [ ] **Step 2: Add DEBUG=true to dev docker-compose.yml**

In `docker-compose.yml`, under the `backend` service `environment:` section, add:

```yaml
      - DEBUG=true
```

- [ ] **Step 3: Commit**

```bash
git add entrypoint.sh docker-compose.yml
git commit -m "chore: use DEBUG flag to control uvicorn --reload"
```

---

## Task 3: Create smoke test

**Files:**
- Create: `tests/test_smoke.py`

- [ ] **Step 1: Create the test file**

```python
# tests/test_smoke.py
def test_app_imports_and_has_routes():
    from messenger.backend.app.main import app
    routes = [r.path for r in app.routes]
    assert "/ws/{chat_id}" in routes or any("/ws" in r for r in routes) or len(routes) > 0
```

- [ ] **Step 2: Run the test locally**

The test requires these env vars to be set so pydantic-settings can initialise. Run:

```bash
$env:DB_USER="test"; $env:DB_PASS="test"; $env:DB_HOST="127.0.0.1"; $env:DB_PORT="3306"; $env:DB_NAME="testdb"; $env:SECRET_KEY="test-secret-key-ci"; $env:ALGORITHM="HS256"; $env:REDIS_URL="redis://localhost:6379/0"
poetry run pytest tests/test_smoke.py -v
```

Expected output:
```
tests/test_smoke.py::test_app_imports_and_has_routes PASSED
1 passed in Xs
```

- [ ] **Step 3: Commit**

```bash
git add tests/test_smoke.py
git commit -m "test: add app smoke test"
```

---

## Task 4: Create GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflows directory and file**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:
    branches: ["**"]

jobs:
  lint-python:
    name: Lint Python (ruff)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install ruff
      - run: ruff check src/

  lint-js:
    name: Lint JS (eslint)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: src/messenger/frontend_react/package-lock.json
      - run: npm ci
        working-directory: src/messenger/frontend_react
      - run: npm run lint
        working-directory: src/messenger/frontend_react

  test:
    name: Test (pytest)
    runs-on: ubuntu-latest
    env:
      DB_USER: testuser
      DB_PASS: testpass
      DB_HOST: "127.0.0.1"
      DB_PORT: "3306"
      DB_NAME: testdb
      SECRET_KEY: test-secret-key-for-ci-only
      ALGORITHM: HS256
      REDIS_URL: redis://localhost:6379/0
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: "pip"
      - run: pip install poetry
      - run: poetry install --no-interaction
      - run: poetry run pytest tests/ -v
```

- [ ] **Step 2: Commit and push to trigger the workflow**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint and test workflow"
git push origin feature/user-profiles
```

- [ ] **Step 3: Check GitHub Actions tab**

Open `https://github.com/benzin8/WSNox/actions` — the CI workflow should appear and pass all three jobs.

---

## Task 5: Create GitHub Actions Deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create the deploy workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  build-and-push:
    name: Build & Push to GHCR
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image_tag: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata for Docker
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/wsnox
          tags: |
            type=raw,value=latest
            type=sha,prefix=sha-

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    name: Deploy to VPS
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Write .env to VPS and redeploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            set -e
            cd /opt/wsnox
            printf '%s' '${{ secrets.ENV_FILE }}' > .env
            docker compose -f docker-compose.prod.yml pull backend
            docker compose -f docker-compose.prod.yml up -d backend
            sleep 5
            docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head
            echo "Deploy complete"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add deploy workflow for main branch"
```

---

## Task 6: Create production docker-compose

**Files:**
- Create: `docker-compose.prod.yml`

- [ ] **Step 1: Create the file**

```yaml
services:
  db:
    image: mysql:8.0
    container_name: messenger_db
    restart: always
    env_file: .env
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: ${DB_NAME}
      MYSQL_USER: ${DB_USER}
      MYSQL_PASSWORD: ${DB_PASS}
    volumes:
      - db_data:/var/lib/mysql

  redis:
    image: redis:7-alpine
    container_name: messenger_redis
    restart: always
    volumes:
      - redis_data:/data

  backend:
    image: ghcr.io/benzin8/wsnox:latest
    container_name: messenger_backend
    restart: always
    env_file: .env
    ports:
      - "8000:8000"
    environment:
      - DOCKER_MODE=true
      - DEBUG=false
      - DB_USER=${DB_USER}
      - DB_PASS=${DB_PASS}
      - DB_HOST=db
      - DB_PORT=${DB_PORT}
      - DB_NAME=${DB_NAME}
      - REDIS_URL=${REDIS_URL}
      - SECRET_KEY=${SECRET_KEY}
      - ALGORITHM=${ALGORITHM}
    depends_on:
      - db
      - redis

volumes:
  db_data:
  redis_data:
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "chore: add production docker-compose using GHCR image"
```

---

## Task 7: Create Nginx config

**Files:**
- Create: `nginx/wsnox.conf`

- [ ] **Step 1: Create the config**

Create `nginx/wsnox.conf`:

```nginx
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name YOUR_DOMAIN_OR_IP;

    ssl_certificate     /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem;

    client_max_body_size 10M;

    location / {
        proxy_pass         http://localhost:8000;
        proxy_http_version 1.1;

        # Required for WebSocket (messenger uses ws://)
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

> Replace `YOUR_DOMAIN` and `YOUR_DOMAIN_OR_IP` after certbot issues the certificate.

- [ ] **Step 2: Commit**

```bash
git add nginx/wsnox.conf
git commit -m "chore: add nginx reverse proxy config with WebSocket support"
```

---

## Task 8: Create VPS setup script

**Files:**
- Create: `scripts/setup-vps.sh`

- [ ] **Step 1: Create the script**

```bash
#!/bin/bash
# One-time setup for Oracle Cloud Ubuntu 22.04 VPS.
# Run as root: sudo bash scripts/setup-vps.sh
set -e

echo "=== Installing Docker ==="
curl -fsSL https://get.docker.com | sh
usermod -aG docker ubuntu

echo "=== Installing Nginx and Certbot ==="
apt-get update -q
apt-get install -y nginx certbot python3-certbot-nginx

echo "=== Creating app directory ==="
mkdir -p /opt/wsnox
chown ubuntu:ubuntu /opt/wsnox

echo ""
echo "=== Setup complete. Manual steps remaining: ==="
echo ""
echo "1. Copy docker-compose.prod.yml to /opt/wsnox/"
echo "   scp docker-compose.prod.yml ubuntu@YOUR_VPS_IP:/opt/wsnox/"
echo ""
echo "2. Create /opt/wsnox/.env with your production secrets"
echo "   (copy from your local .env and update values)"
echo ""
echo "3. Copy nginx config and enable it:"
echo "   scp nginx/wsnox.conf ubuntu@YOUR_VPS_IP:/tmp/"
echo "   sudo cp /tmp/wsnox.conf /etc/nginx/sites-available/wsnox"
echo "   sudo ln -s /etc/nginx/sites-available/wsnox /etc/nginx/sites-enabled/wsnox"
echo "   sudo rm /etc/nginx/sites-enabled/default"
echo "   sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "4. Issue SSL certificate (replace with your domain):"
echo "   sudo certbot --nginx -d yourdomain.com"
echo ""
echo "5. Log in to GHCR on the VPS:"
echo "   echo YOUR_GITHUB_PAT | docker login ghcr.io -u benzin8 --password-stdin"
echo ""
echo "6. Start services:"
echo "   cd /opt/wsnox && docker compose -f docker-compose.prod.yml up -d"
```

- [ ] **Step 2: Make executable and commit**

```bash
git add scripts/setup-vps.sh
git commit -m "chore: add VPS one-time setup script"
```

---

## Task 9: Configure GitHub Secrets

This task has no code — it's done in the GitHub web UI.

- [ ] **Step 1: Open repo secrets**

Go to `https://github.com/benzin8/WSNox/settings/secrets/actions`

- [ ] **Step 2: Add each secret**

Click "New repository secret" for each:

| Name | Value |
|------|-------|
| `VPS_HOST` | Public IP of your Oracle Cloud VM (e.g. `140.238.x.x`) |
| `VPS_USER` | `ubuntu` |
| `VPS_SSH_KEY` | Contents of your private SSH key (`~/.ssh/id_ed25519` or similar). Must be the key whose public key is in `~/.ssh/authorized_keys` on the VPS. |
| `ENV_FILE` | Full contents of your production `.env` file (all variables: DB_USER, DB_PASS, DB_NAME, SECRET_KEY, ALGORITHM, REDIS_URL, DB_PORT) |

- [ ] **Step 3: Make GHCR package public (optional but recommended)**

After the first deploy push runs and creates the package, go to:
`https://github.com/users/benzin8/packages/container/wsnox/settings`
→ Change visibility to **Public** (so VPS can pull without auth).

---

## Task 10: Create DEPLOY.md

**Files:**
- Create: `DEPLOY.md`

- [ ] **Step 1: Create the file**

```markdown
# WSNox Deployment Reference

## Quick Links

| Resource | URL |
|----------|-----|
| GitHub Actions (CI/CD runs) | https://github.com/benzin8/WSNox/actions |
| Docker image (GHCR) | https://ghcr.io/benzin8/wsnox |
| Repo secrets settings | https://github.com/benzin8/WSNox/settings/secrets/actions |

---

## How the Pipeline Works

```
Push to main
    │
    ├── ci.yml   — lint-python (ruff) + lint-js (eslint) + test (pytest)
    └── deploy.yml
            ├── build-and-push  — Docker image → ghcr.io/benzin8/wsnox:latest + :sha-XXXXXXX
            └── deploy          — SSH → pull image → docker compose up -d → alembic upgrade head
```

Push to any other branch runs only `ci.yml` (lint + test). No deploy.

---

## VPS Connection

```bash
ssh ubuntu@YOUR_VPS_IP
```

App lives in `/opt/wsnox/`. Compose file: `docker-compose.prod.yml`.

---

## View Logs

```bash
ssh ubuntu@YOUR_VPS_IP
cd /opt/wsnox

# Backend logs (live)
docker compose -f docker-compose.prod.yml logs -f backend

# All services
docker compose -f docker-compose.prod.yml logs -f
```

---

## Manual Deploy (without pushing to main)

```bash
ssh ubuntu@YOUR_VPS_IP
cd /opt/wsnox
docker compose -f docker-compose.prod.yml pull backend
docker compose -f docker-compose.prod.yml up -d backend
docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head
```

---

## Roll Back to a Previous Version

Every deploy pushes two tags: `latest` and `sha-XXXXXXX` (the Git commit SHA).

1. Find the SHA of the working commit on the [Actions page](https://github.com/benzin8/WSNox/actions) or in git log.
2. On the VPS, edit `docker-compose.prod.yml` — change the image tag:

```yaml
backend:
  image: ghcr.io/benzin8/wsnox:sha-XXXXXXX   # replace with actual SHA
```

3. Restart:

```bash
docker compose -f docker-compose.prod.yml up -d backend
```

4. After fixing the issue, revert the tag back to `latest` and redeploy.

---

## Update .env Secrets on VPS

```bash
nano /opt/wsnox/.env
# edit values, save
docker compose -f docker-compose.prod.yml up -d backend   # restarts with new env
```

Also update the `ENV_FILE` secret in GitHub:
https://github.com/benzin8/WSNox/settings/secrets/actions

---

## First-Time VPS Setup

See `scripts/setup-vps.sh` — run once as root on a fresh Ubuntu 22.04 VM.

---

## Future: Split Monolith

When traffic grows or you want Vercel for the frontend:

1. Remove the `COPY --from=frontend-builder` block from `Dockerfile`
2. Add CORS to FastAPI: `app.add_middleware(CORSMiddleware, allow_origins=[...])`
3. Deploy React to Vercel (auto-detects Vite, connect the same GitHub repo)
4. Set `VITE_API_URL` env var in Vercel to your backend domain
```

- [ ] **Step 2: Commit**

```bash
git add DEPLOY.md
git commit -m "docs: add deployment reference with links and runbooks"
```

---

## Task 11: Merge to main and trigger first deploy

- [ ] **Step 1: Push all changes and open PR**

```bash
git push origin feature/user-profiles
```

Go to `https://github.com/benzin8/WSNox/compare/feature/user-profiles` → open a PR → merge to `main`.

- [ ] **Step 2: Watch the deploy run**

Open `https://github.com/benzin8/WSNox/actions` — you should see the `Deploy` workflow running with three jobs: `build-and-push` then `deploy`.

- [ ] **Step 3: Verify on VPS**

```bash
ssh ubuntu@YOUR_VPS_IP
cd /opt/wsnox
docker compose -f docker-compose.prod.yml ps
```

Expected: `messenger_backend`, `messenger_db`, `messenger_redis` all showing `Up`.

- [ ] **Step 4: Smoke test the live app**

```bash
curl -k https://YOUR_DOMAIN/api/docs
```

Expected: 200 response with FastAPI Swagger HTML.
