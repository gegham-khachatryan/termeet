import { useCallback, useEffect, useRef, useState } from "react"
import { Route, Routes, useNavigate, useParams } from "react-router-dom"
import type { AsciiVideoDisplay, Room, ServerMessage } from "./types"
import type { ChatEntry } from "./components/ChatPanel"
import { useWebSocket } from "./hooks/useWebSocket"
import { useCamera } from "./hooks/useCamera"
import { useAudio } from "./hooks/useAudio"
import { useWebRTC } from "./hooks/useWebRTC"
import { Lobby } from "./components/Lobby"
import { Meeting } from "./components/Meeting"
import { fromBase64, isBase64Frame, renderRgbToColoredLines } from "./ascii"

type View = "lobby" | "meeting"

const DISPLAY_NAME_KEY = "termeet_display_name"

let chatIdCounter = 0
function nextChatId() {
  return `c-${++chatIdCounter}`
}

function AppShell() {
  const navigate = useNavigate()
  const { roomId: roomIdFromRoute } = useParams()

  const roomIdFromRouteRef = useRef<string | undefined>(undefined)
  roomIdFromRouteRef.current = roomIdFromRoute

  const [view, setView] = useState<View>("lobby")
  const [error, setError] = useState<string | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [remoteDisplays, setRemoteDisplays] = useState<Record<string, AsciiVideoDisplay>>({})
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([])

  const myIdRef = useRef<string | null>(null)
  const roomRef = useRef<Room | null>(null)
  const lastRejoinKey = useRef("")
  const leavingRef = useRef(false)

  roomRef.current = room

  // Stable send wrapper — ref is updated after useWebSocket initializes
  const wsSendRef = useRef<(msg: import("./types").ClientMessage) => void>(() => {})
  const stableSend = useCallback((msg: import("./types").ClientMessage) => {
    wsSendRef.current(msg)
  }, [])

  // Send wrapper that skips media messages when all remote peers use WebRTC
  const mediaFallbackSend = useCallback((msg: import("./types").ClientMessage) => {
    const r = roomRef.current
    if (r) {
      const remoteCount = r.participants.filter((p) => p.id !== myIdRef.current).length
      if (remoteCount > 0 && webrtcPeersRef.current.size >= remoteCount) return
    }
    wsSendRef.current(msg)
  }, [])

  const addSystem = useCallback((text: string) => {
    setChatMessages((prev) => [...prev, { id: nextChatId(), type: "system", text }])
  }, [])

  // ── WebRTC hook (DataChannel-based, compatible with both web + CLI peers) ──

  const {
    webrtcPeers,
    sendAudio: rtcSendAudio,
    sendVideo: rtcSendVideo,
    handlePeerJoined,
    handlePeerLeft,
    handleSignalingMessage,
    cleanup: cleanupWebRTC,
  } = useWebRTC({
    myId,
    send: stableSend,
    onAudioData: (_peerId, pcmData) => {
      playRawAudioRef.current?.(pcmData)
    },
    onVideoFrame: (peerId, width, height, rgbData) => {
      try {
        const lines = renderRgbToColoredLines(rgbData, width, height, 100, 40)
        setRemoteDisplays((prev) => ({ ...prev, [peerId]: { type: "colored", lines } }))
      } catch {
        // Invalid frame
      }
    },
    onPeerConnected: (_peerId) => {},
    onPeerDisconnected: (_peerId) => {},
  })

  const webrtcPeersRef = useRef(webrtcPeers)
  webrtcPeersRef.current = webrtcPeers
  const handlePeerJoinedRef = useRef(handlePeerJoined)
  handlePeerJoinedRef.current = handlePeerJoined
  const handlePeerLeftRef = useRef(handlePeerLeft)
  handlePeerLeftRef.current = handlePeerLeft
  const handleSignalingMessageRef = useRef(handleSignalingMessage)
  handleSignalingMessageRef.current = handleSignalingMessage
  const rtcSendAudioRef = useRef(rtcSendAudio)
  rtcSendAudioRef.current = rtcSendAudio
  const rtcSendVideoRef = useRef(rtcSendVideo)
  rtcSendVideoRef.current = rtcSendVideo

  // ── WebSocket message handler ──

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case "room-created":
          myIdRef.current = msg.participantId
          setMyId(msg.participantId)
          setRoom(msg.room)
          setView("meeting")
          navigate(`/r/${msg.room.id}`, { replace: true })
          setChatMessages([
            { id: nextChatId(), type: "system", text: `joined room: ${msg.room.name} (${msg.room.id})` },
            { id: nextChatId(), type: "system", text: "share the room ID with your peer to connect" },
          ])
          break

        case "room-joined":
          myIdRef.current = msg.participantId
          setMyId(msg.participantId)
          setRoom(msg.room)
          setView("meeting")
          navigate(`/r/${msg.room.id}`, { replace: true })
          setChatMessages([
            { id: nextChatId(), type: "system", text: `joined room: ${msg.room.name} (${msg.room.id})` },
          ])
          break

        case "room-not-found":
          setError("Room not found. Check the room ID.")
          setTimeout(() => setError(null), 4000)
          if (roomIdFromRouteRef.current) {
            navigate("/", { replace: true })
          }
          break

        case "participant-joined":
          setRoom((prev) => {
            if (!prev) return prev
            if (prev.participants.some((p) => p.id === msg.participant.id)) return prev
            return { ...prev, participants: [...prev.participants, msg.participant] }
          })
          addSystem(`${msg.participant.name} joined`)
          handlePeerJoinedRef.current(msg.participant.id)
          break

        case "participant-left":
          setRoom((prev) => {
            if (!prev) return prev
            const left = prev.participants.find((p) => p.id === msg.participantId)
            if (left) queueMicrotask(() => addSystem(`${left.name} disconnected`))
            return {
              ...prev,
              participants: prev.participants.filter((p) => p.id !== msg.participantId),
            }
          })
          setRemoteDisplays((prev) => {
            const next = { ...prev }
            delete next[msg.participantId]
            return next
          })
          handlePeerLeftRef.current(msg.participantId)
          break

        case "participant-updated":
          setRoom((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              participants: prev.participants.map((p) =>
                p.id === msg.participant.id ? msg.participant : p,
              ),
            }
          })
          if (msg.participant.id !== myIdRef.current && !msg.participant.isCameraOn) {
            setRemoteDisplays((prev) => {
              const next = { ...prev }
              delete next[msg.participant.id]
              return next
            })
          }
          break

        case "chat-message":
          setChatMessages((prev) => [
            ...prev,
            { id: nextChatId(), type: "chat", message: msg.message },
          ])
          break

        case "video-frame": {
          const sid = msg.frame.senderId
          if (sid === myIdRef.current) break
          // Skip WebSocket video from peers with active WebRTC connections
          if (webrtcPeersRef.current.has(sid)) break
          const { data, width, height } = msg.frame
          let display: AsciiVideoDisplay
          if (isBase64Frame(data, width, height)) {
            try {
              const rgb = fromBase64(data)
              const lines = renderRgbToColoredLines(rgb, width, height, 100, 40)
              display = { type: "colored", lines }
            } catch {
              display = { type: "plain", text: data }
            }
          } else {
            display = { type: "plain", text: data }
          }
          setRemoteDisplays((prev) => ({ ...prev, [sid]: display }))
          break
        }

        case "audio-data":
          if (msg.senderId !== myIdRef.current) {
            // Skip WebSocket audio from peers with active WebRTC connections
            if (webrtcPeersRef.current.has(msg.senderId)) break
            playAudioRef.current?.(msg.data)
          }
          break

        case "webrtc-offer":
        case "webrtc-answer":
        case "webrtc-ice-candidate":
          handleSignalingMessageRef.current(msg)
          break

        case "error":
          setError(msg.message)
          setTimeout(() => setError(null), 4000)
          break
      }
    },
    [addSystem, navigate],
  )

  const { connState, connectEpoch, send } = useWebSocket(onMessage)
  wsSendRef.current = send

  const [micOn, setMicOn] = useState(true)

  // Camera: send raw RGB via WebRTC DataChannels, base64 via WS only when needed
  const { cameraOn, localDisplay, startCamera, stopCamera, toggleCamera } =
    useCamera(
      myId,
      (frame) => {
        mediaFallbackSend({ type: "video-frame", frame })
      },
      (width, height, rgbData) => {
        // Send raw RGB to all WebRTC-connected peers
        for (const peerId of webrtcPeersRef.current) {
          rtcSendVideoRef.current(peerId, width, height, rgbData)
        }
      },
    )

  // Audio: send raw PCM via WebRTC DataChannels, base64 via WS only when needed
  const { playAudio, playRawAudio } = useAudio(
    view === "meeting",
    micOn,
    mediaFallbackSend,
    (pcmData) => {
      // Send raw PCM to all WebRTC-connected peers
      for (const peerId of webrtcPeersRef.current) {
        rtcSendAudioRef.current(peerId, pcmData)
      }
    },
  )
  const playAudioRef = useRef(playAudio)
  playAudioRef.current = playAudio
  const playRawAudioRef = useRef(playRawAudio)
  playRawAudioRef.current = playRawAudio

  useEffect(() => {
    if (connState !== "connected" || !roomIdFromRoute || room || leavingRef.current) return
    const key = `${connectEpoch}:${roomIdFromRoute}`
    if (lastRejoinKey.current === key) return
    lastRejoinKey.current = key
    const userName = localStorage.getItem(DISPLAY_NAME_KEY) ?? "anonymous"
    send({ type: "join-room", roomId: roomIdFromRoute, userName })
  }, [connState, connectEpoch, roomIdFromRoute, room, send])

  const handleCreateRoom = useCallback(
    (roomName: string, userName: string) => {
      leavingRef.current = false
      const n = userName.trim() || "anonymous"
      localStorage.setItem(DISPLAY_NAME_KEY, n)
      send({ type: "create-room", name: roomName, userName: n })
    },
    [send],
  )

  const handleJoinRoom = useCallback(
    (roomId: string, userName: string) => {
      leavingRef.current = false
      const n = userName.trim() || "anonymous"
      localStorage.setItem(DISPLAY_NAME_KEY, n)
      send({ type: "join-room", roomId, userName: n })
    },
    [send],
  )

  const handleSendChat = useCallback(
    (content: string) => {
      send({ type: "chat", content })
    },
    [send],
  )

  const handleToggleCamera = useCallback(() => {
    toggleCamera()
    send({ type: "toggle-camera", isCameraOn: !cameraOn })
  }, [toggleCamera, send, cameraOn])

  const handleToggleMic = useCallback(() => {
    setMicOn((prev) => {
      const next = !prev
      send({ type: "toggle-mute", isMuted: next })
      return next
    })
  }, [send])

  const handleLeave = useCallback(() => {
    leavingRef.current = true
    send({ type: "leave-room" })
    stopCamera()
    cleanupWebRTC()
    navigate("/", { replace: true })
    setView("lobby")
    setMyId(null)
    myIdRef.current = null
    setRoom(null)
    setRemoteDisplays({})
    setChatMessages([])
  }, [send, stopCamera, navigate, cleanupWebRTC])

  useEffect(() => {
    if (view === "meeting") {
      startCamera()
    }
  }, [view, startCamera])

  const rejoining = Boolean(roomIdFromRoute && !room)

  return (
    <div className="app">
      {view === "lobby" && rejoining && (
        <div className="lobby">
          <div className="lobby-card rejoin-card">
            <p className="rejoin-title">Reconnecting to room…</p>
            <p className="rejoin-room-id" title="Room ID">
              {roomIdFromRoute}
            </p>
            <p className="rejoin-status">
              {connState === "connected"
                ? "Joining…"
                : connState === "connecting"
                  ? "Connecting to server…"
                  : "Waiting for connection…"}
            </p>
            {error && <div className="error">{error}</div>}
          </div>
        </div>
      )}
      {view === "lobby" && !rejoining && (
        <Lobby
          connState={connState}
          error={error}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
        />
      )}
      {view === "meeting" && room && myId && (
        <Meeting
          room={room}
          myId={myId}
          localDisplay={localDisplay}
          remoteDisplays={remoteDisplays}
          chatMessages={chatMessages}
          cameraOn={cameraOn}
          micOn={micOn}
          webrtcPeers={webrtcPeers}
          onSendChat={handleSendChat}
          onToggleCamera={handleToggleCamera}
          onToggleMic={handleToggleMic}
          onLeave={handleLeave}
        />
      )}
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />} />
      <Route path="/r/:roomId" element={<AppShell />} />
    </Routes>
  )
}
