# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Install dependencies first (for docker cache optimization)
COPY src/messenger/frontend_react/package*.json ./
RUN npm install

# Build the frontend
COPY src/messenger/frontend_react/ ./
RUN npm run build

# Stage 2: Build Python dependencies into an isolated venv
FROM python:3.12-slim AS backend-builder

ENV POETRY_VERSION=2.1.1 \
    POETRY_VIRTUALENVS_CREATE=false \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# gcc only needed to build wheels here, never shipped to runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# poetry lives in the base interpreter; app deps go into /opt/venv
RUN pip install --upgrade pip && pip install "poetry==$POETRY_VERSION"
RUN python -m venv /opt/venv

# Copy dependency files and install only runtime (main) deps into /opt/venv
COPY pyproject.toml poetry.lock* ./
RUN poetry install --no-root --only main --no-interaction --no-ansi

# Stage 3: Minimal runtime — only the app and its runtime deps
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Bring in the resolved runtime deps (no poetry, no dev tooling, no gcc)
COPY --from=backend-builder /opt/venv /opt/venv

# Copy the entire backend project
COPY . .

# Copy the built React frontend from the builder stage
COPY --from=frontend-builder /app/frontend/dist /app/src/messenger/frontend_react/dist

# Expose the API port
EXPOSE 8000

# Start Uvicorn
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
