#!/bin/bash
# ─── Termeet VPS Setup Script ────────────────────────────────────────────────
# Run this on a fresh Digital Ocean Ubuntu droplet:
#   curl -sSL https://raw.githubusercontent.com/YOUR_REPO/termeet/main/deploy/setup.sh | bash
#
# Or SSH in and run:
#   bash deploy/setup.sh

set -euo pipefail

echo "╔╦╗╔═╗╦═╗╔╦╗╔═╗╔═╗╔╦╗"
echo " ║ ║╣ ╠╦╝║║║║╣ ║╣  ║ "
echo " ╩ ╚═╝╩╚═╩ ╩╚═╝╚═╝ ╩ "
echo ""
echo "Setting up Termeet server..."
echo ""

# ─── 1. System packages ─────────────────────────────────────────────────────

echo "→ Updating system packages..."
apt-get update -qq
apt-get install -y -qq curl unzip git ffmpeg ufw nginx > /dev/null

# ─── 2. Install Bun ─────────────────────────────────────────────────────────

if ! command -v bun &> /dev/null; then
  echo "→ Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
  echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
  echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
else
  echo "→ Bun already installed: $(bun --version)"
fi

# Systemd runs as user `termeet`, which cannot execute binaries under /root — use a global path.
if [[ ! -x /usr/local/bin/bun ]]; then
  if [[ -x "${BUN_INSTALL:-$HOME/.bun}/bin/bun" ]]; then
    install -m 755 "${BUN_INSTALL:-$HOME/.bun}/bin/bun" /usr/local/bin/bun
  elif command -v bun &>/dev/null; then
    install -m 755 "$(command -v bun)" /usr/local/bin/bun
  fi
  echo "→ bun available at /usr/local/bin/bun (for termeet service user)"
fi

# ─── 3. Create termeet user ─────────────────────────────────────────────────

if ! id "termeet" &>/dev/null; then
  echo "→ Creating termeet system user..."
  useradd --system --create-home --shell /bin/bash termeet
fi

# ─── 4. App directory ───────────────────────────────────────────────────────

APP_DIR="/opt/termeet"
echo "→ Setting up app directory at $APP_DIR..."
mkdir -p "$APP_DIR"

# ─── 5. Firewall ────────────────────────────────────────────────────────────

echo "→ Configuring firewall..."
ufw allow 22/tcp     comment "SSH admin"      > /dev/null 2>&1 || true
ufw allow 80/tcp     comment "HTTP"           > /dev/null 2>&1 || true
ufw allow 443/tcp    comment "HTTPS"          > /dev/null 2>&1 || true
ufw allow 3483/tcp   comment "Termeet WS"     > /dev/null 2>&1 || true

# Enable ufw if not already
if ! ufw status | grep -q "Status: active"; then
  echo "y" | ufw enable > /dev/null 2>&1
fi

echo "  Firewall rules:"
ufw status numbered 2>/dev/null | grep -E "22|80|443|3483" || true

# ─── 6. Nginx reverse proxy ────────────────────────────────────────────────
# Cloudflare handles SSL (Flexible/Full mode). Nginx proxies HTTP → Bun.

echo "→ Configuring Nginx reverse proxy..."

cat > /etc/nginx/sites-available/termeet << 'EOF'
# ─── Termeet Nginx Config ────────────────────────────────────────────────
# Cloudflare terminates SSL. This proxies HTTP/WS to the Bun server.

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name termeet.app www.termeet.app;

    # Cloudflare real IP
    set_real_ip_from 173.245.48.0/20;
    set_real_ip_from 103.21.244.0/22;
    set_real_ip_from 103.22.200.0/22;
    set_real_ip_from 103.31.4.0/22;
    set_real_ip_from 141.101.64.0/18;
    set_real_ip_from 108.162.192.0/18;
    set_real_ip_from 190.93.240.0/20;
    set_real_ip_from 188.114.96.0/20;
    set_real_ip_from 197.234.240.0/22;
    set_real_ip_from 198.41.128.0/17;
    set_real_ip_from 162.158.0.0/15;
    set_real_ip_from 104.16.0.0/13;
    set_real_ip_from 104.24.0.0/14;
    set_real_ip_from 172.64.0.0/13;
    set_real_ip_from 131.0.72.0/22;
    real_ip_header CF-Connecting-IP;

    # WebSocket endpoint
    location /ws {
        proxy_pass http://127.0.0.1:3483;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Everything else → Bun (static files + health)
    location / {
        proxy_pass http://127.0.0.1:3483;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable site, remove default
ln -sf /etc/nginx/sites-available/termeet /etc/nginx/sites-enabled/termeet
rm -f /etc/nginx/sites-enabled/default

# Test & reload
nginx -t
systemctl enable nginx
systemctl reload nginx

# ─── 7. Systemd service ─────────────────────────────────────────────────────

echo "→ Creating systemd service..."
cat > /etc/systemd/system/termeet.service << 'EOF'
[Unit]
Description=Termeet — Terminal Video Conferencing
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=termeet
Group=termeet
WorkingDirectory=/opt/termeet
# Inline env so a minimal unit edit fixes ProtectHome=true (hides /home/termeet) without relying on extra Environment= lines.
ExecStart=/usr/bin/env HOME=/opt/termeet XDG_CACHE_HOME=/opt/termeet/.cache /usr/local/bin/bun run server
Restart=always
RestartSec=5

# Environment — HOME must live under ReadWritePaths; ProtectHome=true hides /home/termeet
# and Bun will fail fast if it cannot use a writable home/cache.
Environment=NODE_ENV=production
Environment=TERMEET_PORT=3483
Environment=HOME=/opt/termeet
Environment=XDG_CACHE_HOME=/opt/termeet/.cache

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/termeet
ProtectHome=true
PrivateTmp=true

# Allow binding to ports < 1024 if needed
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable termeet

# ─── 8. Permissions ─────────────────────────────────────────────────────────

chown -R termeet:termeet "$APP_DIR"

# ─── Done ────────────────────────────────────────────────────────────────────

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Deploy the code:  bash deploy/deploy.sh termeet.app"
echo "  2. Start the server: ssh root@termeet.app 'systemctl start termeet'"
echo "  3. Check status:     ssh root@termeet.app 'systemctl status termeet'"
echo "  4. Open https://termeet.app in your browser"
echo ""
