#!/bin/bash

# Wait for database to be ready
echo "Waiting for database to be ready..."
while ! printf "" 2>>/dev/null >>/dev/tcp/$DB_HOST/$DB_PORT; do
  sleep 1
done
echo "Database is ready!"

echo "Running migrations..."
alembic upgrade head

echo "Starting server..."
exec uvicorn messenger.backend.app.main:app --host 0.0.0.0 --port 8000 --reload