import { DEFAULT_SERVER_PORT } from "../protocol.ts"
import { handleOpen, handleMessage, handleClose } from "./ws-handler.ts"

const port = Number(process.env["TERMEET_PORT"]) || DEFAULT_SERVER_PORT

let server
try {
  server = Bun.serve({
    port,
    fetch(req, server) {
    const url = new URL(req.url)

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", uptime: process.uptime() }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    // Upgrade WebSocket connections
    if (server.upgrade(req, { data: { participantId: null, roomId: null } })) {
      return undefined
    }

    return new Response("Termeet Signaling Server", { status: 200 })
  },
  websocket: {
    open: handleOpen,
    message: handleMessage,
    close: handleClose,
    perMessageDeflate: true,
    maxPayloadLength: 1024 * 1024, // 1MB max for ASCII frames
  },
  })
} catch (err: unknown) {
  const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : ""
  if (code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use (another Termeet server or app may be running).`)
    console.error(`  See what’s listening:  ss -tlnp | grep ${port}   or   lsof -iTCP:${port} -sTCP:LISTEN`)
    console.error(`  Stop that process, or set TERMEET_PORT in the systemd unit.`)
    process.exit(1)
  }
  console.error("Termeet server failed to start:", err)
  process.exit(1)
}

console.log(`🖥  Termeet server running on ws://localhost:${server.port}`)
