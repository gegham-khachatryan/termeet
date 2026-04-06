# Deploying Termeet to Digital Ocean

This guide covers deploying the **WebSocket signaling server** so clients can connect from their own machines with the Termeet CLI (`bun run dev` or `termeet`), using `TERMEET_HOST` / `TERMEET_PORT` to point at your droplet.

## Prerequisites

- A [Digital Ocean](https://digitalocean.com) account
- A domain (e.g. `termeet.app`) — optional but recommended
- Local machine with `ssh` and `rsync` (for deploy script)

## 1. Create a Droplet

1. Go to **Digital Ocean → Create → Droplets**
2. Choose **Ubuntu 24.04 LTS**
3. Select a plan — **$6/mo (Regular, 1 GB RAM)** is enough to start
4. Choose a datacenter region close to your users
5. Add your SSH key for root access
6. Click **Create Droplet**

Note your droplet's IP address (e.g. `164.90.xxx.xxx`).

## 2. Setup the Server

SSH into your droplet and run the setup script:

```bash
ssh root@YOUR_DROPLET_IP

# Clone the repo
git clone https://github.com/YOUR_USERNAME/termeet.git /opt/termeet
cd /opt/termeet

# Run setup (installs Bun, ffmpeg, configures firewall + systemd)
bash deploy/setup.sh
```

The setup script will:

- Install system packages (Bun, ffmpeg, ufw)
- Create a `termeet` system user
- Open firewall ports (22 for admin SSH, 3483 for WebSocket)
- Create and enable a systemd service that runs `bun run server` (signaling server only; clients use the Termeet CLI elsewhere)

## 3. Deploy from Your Local Machine

From your project directory on your local machine:

```bash
bash deploy/deploy.sh YOUR_DROPLET_IP
```

This will:

1. `rsync` the project files to `/opt/termeet` on the server
2. Run `bun install --production` on the server
3. Restart the `termeet` systemd service
4. Verify the service is running

Run this command every time you want to deploy changes.

## 4. Test It

On your **local** machine (with Bun and the repo):

```bash
TERMEET_HOST=YOUR_DROPLET_IP bun run dev
```

You should reach the lobby and connect to the signaling server.

## 5. Point Your Domain (Optional)

If you have a domain like `termeet.app`:

1. Go to your DNS provider
2. Add an **A record**: `termeet.app` → `YOUR_DROPLET_IP`
3. Wait for DNS propagation (usually a few minutes)

```bash
TERMEET_HOST=termeet.app bun run dev
```

## Managing the Service

```bash
# Check status
systemctl status termeet

# View live logs
journalctl -u termeet -f

# Restart
systemctl restart termeet

# Stop
systemctl stop termeet
```

## Environment Variables

Configure in `/etc/systemd/system/termeet.service`:

| Variable | Default | Description |
|----------|---------|-------------|
| `TERMEET_PORT` | `3483` | WebSocket signaling server port |

After changing, reload and restart:

```bash
systemctl daemon-reload
systemctl restart termeet
```

## Scaling

For handling more concurrent users:

- **Vertical**: Upgrade to a larger droplet (2 GB+ RAM)
- **Horizontal**: Run multiple droplets behind a TCP/WebSocket load balancer
- **Audio relay**: Audio data is the heaviest traffic — consider offloading to a dedicated media relay server

## Troubleshooting

**Service not listening:**

```bash
systemctl status termeet
ss -tlnp | grep 3483
ufw status
```

**Service crashes on startup:**

```bash
journalctl -u termeet -n 50 --no-pager
```

Common issues: Bun not found in `ExecStart` PATH for the `termeet` user, or port already in use.

**Users see "Connecting..." but can't join rooms:**

```bash
curl -sf http://localhost:3483/health
```
