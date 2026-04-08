import { DEFAULT_SERVER_PORT } from '../protocol.ts'
import { handleOpen, handleMessage, handleClose } from './ws-handler.ts'
import { join } from 'path'

const port = Number(process.env['TERMEET_PORT']) || DEFAULT_SERVER_PORT
const WEB_DIR = join(import.meta.dir, '../../web/dist')

// MIME types for static file serving
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

function getMime(path: string): string {
  const ext = path.slice(path.lastIndexOf('.'))
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

let server
try {
  server = Bun.serve({
    port,
    fetch(req, server) {
      const url = new URL(req.url)

      // Health check endpoint
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', uptime: process.uptime() }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // WebSocket upgrade — accept on /ws or any upgrade request
      if (url.pathname === '/ws' || req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
        if (server.upgrade(req, { data: { participantId: null, roomId: null } })) {
          return undefined
        }
        return new Response('WebSocket upgrade failed', { status: 400 })
      }

      // Serve static web files
      let filePath = url.pathname === '/' ? '/index.html' : url.pathname
      // Prevent directory traversal
      filePath = filePath.replace(/\.\./g, '')
      const fullPath = join(WEB_DIR, filePath)

      const file = Bun.file(fullPath)
      return file.exists().then((exists) => {
        if (exists) {
          return new Response(file, {
            headers: { 'Content-Type': getMime(fullPath) }
          })
        }
        // Fallback: serve index.html for SPA-like routing
        return new Response(Bun.file(join(WEB_DIR, 'index.html')), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      })
    },
    websocket: {
      open: handleOpen,
      message: handleMessage,
      close: handleClose,
      perMessageDeflate: true,
      maxPayloadLength: 1024 * 1024 // 1MB max for ASCII frames
    }
  })
} catch (err: unknown) {
  const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : ''
  if (code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use (another Termeet server or app may be running).`)
    console.error(`  See what's listening:  ss -tlnp | grep ${port}   or   lsof -iTCP:${port} -sTCP:LISTEN`)
    console.error(`  Stop that process, or set TERMEET_PORT in the systemd unit.`)
    process.exit(1)
  }
  console.error('Termeet server failed to start:', err)
  process.exit(1)
}

console.log(`🖥  Termeet server running on ws://localhost:${server.port}`)
console.log(`🌐 Web UI available at http://localhost:${server.port}`)
