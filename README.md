# Termeet

> Google Meet for the terminal — video conferencing with ASCII art

Termeet is a real-time video conferencing CLI app that renders camera feeds as ASCII art directly in your terminal. Built with [OpenTUI](https://opentui.com) for a rich terminal UI experience.

## Features

- **ASCII Video** — Camera streams rendered as real-time ASCII art
- **Multi-participant** — Grid layout adapts to number of participants
- **Live Chat** — In-meeting text chat with timestamps
- **Audio Streaming** — Microphone capture and playback via ffmpeg
- **Room Management** — Create or join rooms with shareable room IDs
- **Controls** — Mute/unmute, camera toggle, chat toggle
- **Test Pattern** — Animated gradient pattern when no camera is available

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────────────┐
│  Client CLI  │◄──────────────────►│  Signaling      │
│  (OpenTUI)   │  ASCII frames,    │  Server (Bun)   │
│              │  audio, chat,     │                 │
│  ┌─────────┐ │  signaling        │  ┌───────────┐  │
│  │ Camera  │ │                   │  │   Room    │  │
│  │ (ffmpeg)│ │                   │  │  Manager  │  │
│  └────┬────┘ │                   │  └───────────┘  │
│       ▼      │                   └─────────────────┘
│  ┌─────────┐ │
│  │  ASCII  │ │
│  │Renderer │ │
│  └─────────┘ │
└──────────────┘
```

**Tech Stack:**

- **Runtime**: [Bun](https://bun.sh)
- **Terminal UI**: [@opentui/react](https://opentui.com) (Zig-powered, React renderer)
- **Camera/Audio**: ffmpeg subprocess (cross-platform)
- **ASCII Rendering**: p5.js-inspired brightness mapping with edge detection
- **Networking**: WebSocket with JSON protocol
- **Server**: Bun built-in HTTP/WebSocket server

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- [ffmpeg](https://ffmpeg.org) (for camera and audio)

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install ffmpeg (macOS)
brew install ffmpeg

# Install ffmpeg (Ubuntu/Debian)
sudo apt install ffmpeg
```

On **macOS**, grant **Camera** and **Microphone** to your terminal (Terminal.app, iTerm, etc.) under **System Settings → Privacy & Security**, or capture will stay on “No signal”.

## Quick Start

```bash
# Install dependencies
bun install

# Terminal 1: Start the server
bun run server

# Terminal 2: Start the client
bun run dev
```

Or run both together:

```bash
bun run start
```

## Standalone CLI (no Bun or ffmpeg in PATH)

### npm (same pattern as multiplayer-debugger)

The published **`termeet` command is client-only** — it connects to your signaling server via `TERMEET_HOST` / `TERMEET_PORT`. Host the WebSocket server separately (`bun run server` from this repo on a VPS, etc.).

A small **Node wrapper** (`bin/termeet.js`) plus **optional** packages `termeet-cli-<platform>-<arch>` that ship the compiled Bun binary and bundled ffmpeg.

```bash
npm install -g termeet
termeet --help
```

Set `repository.url` in `package.json` to your real GitHub remote (needed for provenance). Add **`NPM_TOKEN`** to repo secrets, then push a tag `v1.2.3` or run **Publish Packages** manually from the Actions tab (see `.github/workflows/publish-packages.yml`).

### Maintainer builds

```bash
bun install
bun run build:cli       # this machine only (+ ffplay if on PATH)
bun run build:cli:all   # all platforms (CI)
```

Each `dist/<platform-arch>/bin/` contains `termeet`, downloaded `ffmpeg` (see [eugeneware/ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)), and optionally `ffplay`. You can zip a single `dist/<slug>/` folder for sidecar distribution.

Use `FFMPEG_PATH`, `FFPLAY_PATH`, or `TERMEET_BIN_PATH` when needed.

## Usage

### Server

```bash
# Start with default port (3483)
bun run server

# Custom port
TERMEET_PORT=8080 bun run server
```

### Client

```bash
# Connect to local server
bun run dev

# Connect to remote server
TERMEET_HOST=192.168.1.100 TERMEET_PORT=3483 bun run dev
```

### In-Meeting Controls

| Key   | Action             |
| ----- | ------------------ |
| `M`   | Toggle mute        |
| `V`   | Toggle camera      |
| `T`   | Toggle chat panel  |
| `I`   | Copy room ID to clipboard (or click **Room** in the bar) |
| `Tab` | Focus/unfocus chat |
| `Esc` | Unfocus / go back  |
| `Q`   | Leave meeting      |

## How It Works

1. **Camera Capture**: ffmpeg captures raw RGB frames from your camera
2. **ASCII Rendering**: Each frame is processed using a p5.js-inspired pipeline:
   - Pixel brightness calculation (luminance formula)
   - Contrast and brightness adjustments
   - Optional Sobel edge detection
   - Brightness-to-ASCII character mapping using a 68-character ramp
3. **Streaming**: ASCII frames are sent as lightweight text over WebSocket
4. **Display**: OpenTUI renders the ASCII art in a responsive grid layout

## Project Structure

```
src/
├── index.tsx              # CLI entry point with arg parsing
├── app.tsx                # Main App component (state management)
├── protocol.ts            # Shared types and message definitions
├── ui/
│   ├── lobby.tsx          # Create/join room screen
│   ├── meeting-room.tsx   # Main meeting view with video grid
│   ├── video-panel.tsx    # Individual ASCII video panel
│   ├── chat-panel.tsx     # Chat sidebar with message input
│   ├── controls-bar.tsx   # Bottom controls bar
│   └── participants-bar.tsx # Participant status bar
├── media/
│   ├── camera.ts          # Camera capture via ffmpeg
│   ├── ascii-renderer.ts  # Frame-to-ASCII conversion engine
│   └── audio.ts           # Audio capture and playback
├── network/
│   └── client.ts          # WebSocket client with event system
└── server/
    ├── index.ts           # Server entry point
    ├── room-manager.ts    # Room lifecycle and participant tracking
    └── ws-handler.ts      # WebSocket message handling and broadcast
```

## License

MIT
