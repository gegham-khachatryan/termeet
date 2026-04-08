import { useCallback, useEffect, useRef, useState } from "react"
import type { ClientMessage, ServerMessage } from "../types"

export type ConnectionState = "disconnected" | "connecting" | "connected"

export function useWebSocket(onMessage: (msg: ServerMessage) => void) {
  const [connState, setConnState] = useState<ConnectionState>("disconnected")
  const [connectEpoch, setConnectEpoch] = useState(0)
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>
    let stopped = false

    function connect() {
      if (stopped) return
      const proto = location.protocol === "https:" ? "wss:" : "ws:"
      const ws = new WebSocket(`${proto}//${location.host}/ws`)
      wsRef.current = ws

      setConnState("connecting")

      ws.onopen = () => {
        setConnState("connected")
        setConnectEpoch((n) => n + 1)
      }

      ws.onmessage = (e) => {
        try {
          onMessageRef.current(JSON.parse(e.data))
        } catch { /* invalid JSON */ }
      }

      ws.onclose = () => {
        wsRef.current = null
        setConnState("disconnected")
        if (!stopped) reconnectTimer = setTimeout(connect, 2000)
      }

      ws.onerror = () => {}
    }

    connect()

    // Ping keep-alive
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }))
      }
    }, 30000)

    return () => {
      stopped = true
      clearTimeout(reconnectTimer)
      clearInterval(pingInterval)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [])

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  return { connState, connectEpoch, send }
}
