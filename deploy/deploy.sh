#!/bin/bash
# ─── Termeet Deploy Script ───────────────────────────────────────────────────
# Deploy Termeet to a Digital Ocean droplet.
#
# Usage:
#   bash deploy/deploy.sh <droplet-ip> [ssh-port]
#
# Examples:
#   bash deploy/deploy.sh 165.227.133.246
#   bash deploy/deploy.sh termeet.app
#   bash deploy/deploy.sh termeet.app 2200

set -euo pipefail

HOST="${1:?Usage: deploy.sh <droplet-ip> [ssh-port]}"
SSH_PORT="${2:-22}"
APP_DIR="/opt/termeet"
SSH_OPTS="-o StrictHostKeyChecking=no -p $SSH_PORT"

echo "╔╦╗╔═╗╦═╗╔╦╗╔═╗╔═╗╔╦╗"
echo " ║ ║╣ ╠╦╝║║║║╣ ║╣  ║ "
echo " ╩ ╚═╝╩╚═╩ ╩╚═╝╚═╝ ╩ "
echo ""
echo "Deploying to $HOST..."
echo ""

# ─── 1. Build web frontend locally ──────────────────────────────────────────

echo "→ Building web frontend..."
(cd web && bun install && bun run build)

# ─── 2. Sync files ──────────────────────────────────────────────────────────

echo "→ Syncing project files..."
# /dist anchors to repo root only — do not exclude web/dist (Vite output must reach the server).
rsync -avz --delete \
  -e "ssh $SSH_OPTS" \
  --exclude node_modules \
  --exclude .git \
  --exclude .env \
  --exclude .DS_Store \
  --exclude /dist \
  --exclude web/node_modules \
  --exclude web/src \
  ./ "root@${HOST}:${APP_DIR}/"

# ─── 3. Install dependencies on server ──────────────────────────────────────

echo "→ Installing dependencies on server..."
ssh $SSH_OPTS "root@${HOST}" << 'REMOTE'
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  cd /opt/termeet
  # --omit=optional: termeet-cli-* optional deps are for npm installs and may 404 until published.
  # --frozen-lockfile: same dependency tree as bun.lock (avoids half-empty node_modules).
  bun install --production --omit=optional --frozen-lockfile
  chown -R termeet:termeet /opt/termeet
REMOTE

# ─── 4. Restart services ───────────────────────────────────────────────────

echo "→ Restarting services..."
ssh $SSH_OPTS "root@${HOST}" << 'REMOTE'
  systemctl restart termeet
  # Reload nginx in case config changed
  nginx -t && systemctl reload nginx
REMOTE

# ─── 5. Verify ──────────────────────────────────────────────────────────────

echo "→ Checking service status..."
sleep 2
ssh $SSH_OPTS "root@${HOST}" "systemctl is-active termeet && systemctl is-active nginx && curl -sf http://localhost:3483/health | head -1"

echo ""
echo "✅ Deployed successfully!"
echo ""
echo "Web UI:  https://termeet.app"
echo "WS:     wss://termeet.app/ws"
echo ""
echo "View logs:"
echo "  ssh root@${HOST} 'journalctl -u termeet -f'"
echo "  ssh root@${HOST} 'journalctl -u nginx -f'"
