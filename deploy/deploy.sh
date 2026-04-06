#!/bin/bash
# ─── Termeet Deploy Script ───────────────────────────────────────────────────
# Deploy Termeet to a Digital Ocean droplet.
#
# Usage:
#   bash deploy/deploy.sh <droplet-ip> [ssh-port]
#
# Examples:
#   bash deploy/deploy.sh 164.90.xxx.xxx
#   bash deploy/deploy.sh 164.90.xxx.xxx 2200
#   bash deploy/deploy.sh termeet.app

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

# ─── 1. Sync files ──────────────────────────────────────────────────────────

echo "→ Syncing project files..."
rsync -avz --delete \
  -e "ssh $SSH_OPTS" \
  --exclude node_modules \
  --exclude .git \
  --exclude .env \
  --exclude .DS_Store \
  ./ "root@${HOST}:${APP_DIR}/"

# ─── 2. Install dependencies on server ──────────────────────────────────────

echo "→ Installing dependencies on server..."
ssh $SSH_OPTS "root@${HOST}" << 'REMOTE'
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  cd /opt/termeet
  bun install --production
  chown -R termeet:termeet /opt/termeet
REMOTE

# ─── 3. Restart service ─────────────────────────────────────────────────────

echo "→ Restarting Termeet service..."
ssh $SSH_OPTS "root@${HOST}" "systemctl restart termeet"

# ─── 4. Verify ──────────────────────────────────────────────────────────────

echo "→ Checking service status..."
sleep 2
ssh $SSH_OPTS "root@${HOST}" "systemctl is-active termeet && curl -sf http://localhost:3483/health | head -1"

echo ""
echo "✅ Deployed successfully!"
echo ""
echo "Clients: TERMEET_HOST=${HOST} bun run dev   (or set in .env)"
echo ""
echo "View logs on server:"
echo "  ssh root@${HOST} 'journalctl -u termeet -f'"
