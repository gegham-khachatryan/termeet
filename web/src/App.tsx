import { useCallback, useEffect, useRef, useState } from "react"
import { Route, Routes, useNavigate, useParams } from "react-router-dom"
import type { AsciiVideoDisplay, Room, ServerMessage } from "./types"
import type { ChatEntry } from "./components/ChatPanel"
import { useWebSocket } from "./hooks/useWebSocket"
import { useCamera } from "./hooks/useCamera"
import { useAudio } from "./hooks/useAudio"
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
  const lastRejoinKey = useRef("")
  const leavingRef = useRef(false)

  const addSystem = useCallback((text: string) => {
    setChatMessages((prev) => [...prev, { id: nextChatId(), type: "system", text }])
  }, [])

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
            playAudioRef.current?.(msg.data)
          }
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

  const [micOn, setMicOn] = useState(true)

  const { cameraOn, localDisplay, startCamera, stopCamera, toggleCamera } =
    useCamera(myId, (frame) => {
      send({ type: "video-frame", frame })
    })

  const { playAudio } = useAudio(view === "meeting", micOn, send)
  const playAudioRef = useRef(playAudio)
  playAudioRef.current = playAudio

  useEffect(() => {
    if (connState !== "connected" || !roomIdFromRoute || room || leavingRef.current) return
    const key = `${connectEpoch}:${roomIdFromRoute}`
    if (lastRejoinKey.current === key) return
    lastRejoinKey.current = key
    const userName = sessionStorage.getItem(DISPLAY_NAME_KEY) ?? "anonymous"
    send({ type: "join-room", roomId: roomIdFromRoute, userName })
  }, [connState, connectEpoch, roomIdFromRoute, room, send])

  const handleCreateRoom = useCallback(
    (roomName: string, userName: string) => {
      const n = userName.trim() || "anonymous"
      sessionStorage.setItem(DISPLAY_NAME_KEY, n)
      send({ type: "create-room", name: roomName, userName: n })
    },
    [send],
  )

  const handleJoinRoom = useCallback(
    (roomId: string, userName: string) => {
      const n = userName.trim() || "anonymous"
      sessionStorage.setItem(DISPLAY_NAME_KEY, n)
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
    send({ type: "leave-room" })
    stopCamera()
    navigate("/", { replace: true })
    setView("lobby")
    setMyId(null)
    myIdRef.current = null
    setRoom(null)
    setRemoteDisplays({})
    setChatMessages([])
  }, [send, stopCamera, navigate])

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
