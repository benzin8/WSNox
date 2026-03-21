# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Install dependencies first (for docker cache optimization)
COPY src/messenger/frontend_react/package*.json ./
RUN npm install

# Build the frontend
COPY src/messenger/frontend_react/ ./
RUN npm run build

# Stage 2: Runtime and Backend environment
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VERSION=2.1.1 \
    POETRY_VIRTUALENVS_CREATE=false \
    PYTHONPATH=/app/src

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

RUN pip install "poetry==$POETRY_VERSION"

# Copy dependency files
COPY pyproject.toml poetry.lock* ./

# Install project dependencies
RUN poetry install --no-root --no-interaction --no-ansi

# Copy the entire backend project
COPY . .

# Copy the built React frontend from the builder stage
COPY --from=frontend-builder /app/frontend/dist /app/src/messenger/frontend_react/dist

# Expose the API port
EXPOSE 8000

# Start Uvicorn
CMD ["uvicorn", "src.messenger.backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
