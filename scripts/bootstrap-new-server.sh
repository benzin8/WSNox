#!/bin/bash
# Bootstrap a fresh Ubuntu/Debian VPS for WSNox (dockerized nginx + certbot flow).
#
# Usage (as a sudo-capable user on the NEW server):
#   DOMAIN=example.com EMAIL=you@example.com bash scripts/bootstrap-new-server.sh
#
# Prereqs before running:
#   1. DNS A-record for $DOMAIN already points to this server's IP
#   2. ~/WSNox/.env exists (copy prod.env from the migration backup)
#   3. Optional: ~/wsnox_YYYYMMDD.dump present to restore the old database
set -euo pipefail

: "${DOMAIN:?Set DOMAIN=your.domain}"
: "${EMAIL:?Set EMAIL=your@email (for Let's Encrypt)}"

APP_DIR="$HOME/WSNox"
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml"

echo "=== 1/7 Installing Docker ==="
if ! command -v docker >/dev/null; then
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "$USER"
fi

echo "=== 2/7 Cloning repo ==="
if [ ! -d "$APP_DIR/.git" ]; then
    git clone https://github.com/benzin8/WSNox.git "$APP_DIR"
fi
cd "$APP_DIR"

[ -f .env ] || { echo "ERROR: $APP_DIR/.env missing — copy prod.env from the migration backup first"; exit 1; }

echo "=== 3/7 Patching nginx config for $DOMAIN ==="
sed -i "s/wsnox\.urldot\.ru/$DOMAIN/g" nginx/wsnox.conf

echo "=== 4/7 Obtaining Let's Encrypt certificate (two-phase) ==="
# Phase 1: HTTP-only nginx so certbot's webroot challenge can pass —
# the full config references certs that don't exist yet and nginx would refuse to start.
mkdir -p certbot/www certbot/conf
if [ ! -d "certbot/conf/live/$DOMAIN" ]; then
    cat > /tmp/wsnox-http-only.conf <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'bootstrap'; add_header Content-Type text/plain; }
}
EOF
    sudo docker run -d --name bootstrap_nginx -p 80:80 \
        -v /tmp/wsnox-http-only.conf:/etc/nginx/conf.d/default.conf:ro \
        -v "$APP_DIR/certbot/www:/var/www/certbot" nginx:alpine
    sudo docker run --rm \
        -v "$APP_DIR/certbot/www:/var/www/certbot" \
        -v "$APP_DIR/certbot/conf:/etc/letsencrypt" \
        certbot/certbot certonly --webroot -w /var/www/certbot \
        -d "$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email
    sudo docker rm -f bootstrap_nginx
    rm /tmp/wsnox-http-only.conf
fi

echo "=== 5/7 Starting the stack ==="
sudo $COMPOSE pull
sudo $COMPOSE up -d

echo "=== 6/7 Restoring database (if a dump is present) ==="
DUMP=$(ls -t "$HOME"/wsnox_*.dump 2>/dev/null | head -1 || true)
if [ -n "$DUMP" ]; then
    echo "Restoring $DUMP ..."
    # Wait for Postgres to accept connections
    until sudo docker exec messenger_db pg_isready -q; do sleep 2; done
    set -a; . ./.env; set +a
    sudo docker cp "$DUMP" messenger_db:/tmp/restore.dump
    # --clean --if-exists: the backend has already run migrations on the empty DB;
    # drop those objects and replace them with the real data from the old server.
    sudo docker exec messenger_db pg_restore -U "$DB_USER" -d "$DB_NAME" \
        --clean --if-exists --no-owner /tmp/restore.dump
    sudo docker exec messenger_db rm /tmp/restore.dump
    sudo $COMPOSE restart backend
else
    echo "No dump found in \$HOME — starting with an empty database."
fi

echo "=== 7/7 Smoke test ==="
sleep 5
curl -sk -o /dev/null -w "https://$DOMAIN -> HTTP %{http_code}\n" "https://localhost/" -H "Host: $DOMAIN"

echo ""
echo "Done. Remaining manual steps:"
echo "  - Update GitHub Actions secrets: SERVER_HOST, SERVER_USER, SERVER_SSH_KEY"
echo "  - Add FRONTEND_BASE_URL=https://$DOMAIN to .env and GitHub secrets"
echo "  - Push to main (or run the Deploy workflow) to verify CI deploys here"
