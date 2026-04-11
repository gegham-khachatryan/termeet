import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./app.tsx"
import { DEFAULT_SERVER_PORT, DEFAULT_CLI_WEBSOCKET_URL, VERSION } from "./protocol.ts"

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

function printHelp() {
  console.log(`
  ╔╦╗╔═╗╦═╗╔╦╗╔═╗╔═╗╔╦╗
   ║ ║╣ ╠╦╝║║║║╣ ║╣  ║
   ╩ ╚═╝╩╚═╩ ╩╚═╝╚═╝ ╩

  Video conferencing in your terminal

  Usage:
    termeet                    Launch the client (connects to a signaling server)
    termeet --room <id>        Join a room immediately
    termeet --version          Show version
    termeet --help             Show this help message

  Environment Variables:
    TERMEET_WS_URL             Full WebSocket URL (default: ${DEFAULT_CLI_WEBSOCKET_URL})
    TERMEET_HOST / TERMEET_PORT  If set, connect to ws://HOST:PORT (local dev; default port ${DEFAULT_SERVER_PORT})
    FFMPEG_PATH / FFPLAY_PATH  Override bundled or PATH binaries (optional)

  In-Meeting Controls:
    [M]       Toggle microphone mute
    [V]       Toggle camera on/off
    [T]       Toggle chat panel
    [I]       Copy room ID to clipboard
    [Tab]     Focus chat input
    [Esc]     Unfocus chat / go back
    [Q]       Leave meeting · Ctrl+Q quit app

  Requirements:
    - A reachable Termeet signaling server (you run it on a host; this binary is client-only)
    - ffmpeg (bundled in npm release, or install for dev from source)
`)
  process.exit(0)
}

async function main() {
  const args = process.argv.slice(2)

  if (args.includes("--version") || args.includes("-v")) {
    console.log(`termeet ${VERSION}`)
    process.exit(0)
  }

  if (args.includes("--help") || args.includes("-h")) {
    printHelp()
  }

  if (args[0] === "server") {
    console.error(
      "This build is client-only. Run the signaling server from the repo: bun run server\n" +
        "(or point the client at your server with TERMEET_WS_URL or TERMEET_HOST / TERMEET_PORT.)",
    )
    process.exit(1)
  }

  // Parse --room flag
  let initialRoomId: string | undefined
  const roomFlagIdx = args.indexOf("--room")
  if (roomFlagIdx !== -1 && args[roomFlagIdx + 1]) {
    initialRoomId = args[roomFlagIdx + 1]
  }

  // Default: Launch client UI
  const renderer = await createCliRenderer()
  const root = createRoot(renderer)
  root.render(<App initialRoomId={initialRoomId} />)
}

main().catch((err) => {
  console.error("Failed to start Termeet:", err)
  process.exit(1)
})
