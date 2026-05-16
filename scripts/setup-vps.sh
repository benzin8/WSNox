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
