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

## GitHub Secrets Required

| Secret | Value |
|--------|-------|
| `VPS_HOST` | Oracle VPS public IP |
| `VPS_USER` | SSH user (`ubuntu`) |
| `VPS_SSH_KEY` | Private SSH key content |
| `ENV_FILE` | Full contents of production `.env` |

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
