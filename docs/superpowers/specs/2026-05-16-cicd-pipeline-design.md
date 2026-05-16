# CI/CD Pipeline — WSNox Design Spec

**Date:** 2026-05-16  
**Stack:** FastAPI + React + MySQL + Redis  
**Target:** Oracle Cloud Free Tier VPS  
**Scale:** up to 1 000 users

---

## Overview

Automated pipeline: push to `main` → lint → test → build Docker image → push to GHCR → SSH deploy to VPS.

Single production environment. No staging. Monolith deployment (FastAPI serves React static files from the same container).

---

## Pipeline Stages

```
Push to main
    │
    ├── 1. Lint          — ruff (Python) + eslint (JS)
    ├── 2. Test          — pytest
    ├── 3. Build & Push  — Docker image → GHCR (ghcr.io/benzin8/wsnox:latest)
    └── 4. Deploy        — SSH → docker-compose pull → up -d → alembic upgrade head
```

**Trigger rules:**
- All branches: lint + test only
- `main` branch only: full pipeline including build and deploy

Deploy is blocked if lint or tests fail.

---

## GitHub Actions Files

```
.github/
└── workflows/
    ├── ci.yml      — lint + test (all branches, on push + PR)
    └── deploy.yml  — build + push to GHCR + SSH deploy (main only)
```

---

## VPS Infrastructure (Oracle Cloud Free Tier)

**VM:** Ubuntu 22.04, 1 OCPU, 1 GB RAM — permanently free.

**One-time manual setup:**
1. Install Docker + docker-compose
2. Install Nginx + Certbot (Let's Encrypt SSL)
3. Place `.env` file with secrets in `/opt/wsnox/`
4. Clone repo or copy `docker-compose.prod.yml` to `/opt/wsnox/`

**Traffic flow:**
```
Internet → Nginx :443 (HTTPS) → FastAPI :8000
                                     ├── MySQL  :3306  (docker-compose service)
                                     └── Redis  :6379  (docker-compose service)
```

---

## Docker Image

Built in GitHub Actions, pushed to GHCR:

```
ghcr.io/benzin8/wsnox:latest
```

`docker-compose.prod.yml` on the VPS references the GHCR image instead of building locally:

```yaml
backend:
  image: ghcr.io/benzin8/wsnox:latest
```

MySQL and Redis continue to run as local compose services — no external managed database needed.

---

## GitHub Secrets

| Secret | Value |
|--------|-------|
| `VPS_HOST` | Oracle VPS public IP |
| `VPS_USER` | SSH user (e.g. `ubuntu`) |
| `VPS_SSH_KEY` | Private SSH key (RSA/ED25519) |
| `ENV_FILE` | Full contents of `.env` (DB creds, SECRET_KEY, etc.) |

`GITHUB_TOKEN` for GHCR push is built into GitHub Actions — no manual setup needed.

---

## Deploy Step Detail

```bash
ssh ubuntu@$VPS_HOST "
  cd /opt/wsnox &&
  docker-compose -f docker-compose.prod.yml pull backend &&
  docker-compose -f docker-compose.prod.yml up -d backend &&
  docker-compose -f docker-compose.prod.yml exec -T backend alembic upgrade head
"
```

Migrations run automatically on every deploy for zero-downtime schema updates.

---

## Deliverables

After the pipeline is set up, a `DEPLOY.md` file will be committed to the repo root with:
- Links to GitHub Actions runs
- Link to GHCR image page
- VPS connection instructions
- How to roll back to a previous image
- How to view logs

---

## Future Split (when needed)

When the project outgrows the monolith:
1. Remove `COPY --from=frontend-builder` from `Dockerfile` — backend only
2. Add CORS config to FastAPI
3. Deploy React separately to Vercel (connect same GitHub repo, Vercel auto-detects Vite)
4. Update `VITE_API_URL` env var in Vercel to point to backend

Estimated migration effort: ~2–3 hours.
