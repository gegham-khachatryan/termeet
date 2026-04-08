import { useCallback, useEffect, useRef, useState } from "react"
import type { AsciiVideoDisplay, Room, ServerMessage } from "./types"
import type { ChatEntry } from "./components/ChatPanel"
import { useWebSocket } from "./hooks/useWebSocket"
import { useCamera } from "./hooks/useCamera"
import { Lobby } from "./components/Lobby"
import { Meeting } from "./components/Meeting"
import { fromBase64, isBase64Frame, renderRgbToColoredLines } from "./ascii"

type View = "lobby" | "meeting"

let chatIdCounter = 0
function nextChatId() {
  return `c-${++chatIdCounter}`
}

export function App() {
  const [view, setView] = useState<View>("lobby")
  const [error, setError] = useState<string | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [remoteDisplays, setRemoteDisplays] = useState<Record<string, AsciiVideoDisplay>>({})
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([])

  const myIdRef = useRef<string | null>(null)

  const addSystem = useCallback((text: string) => {
    setChatMessages((prev) => [...prev, { id: nextChatId(), type: "system", text }])
  }, [])

  const onMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "room-created":
        myIdRef.current = msg.participantId
        setMyId(msg.participantId)
        setRoom(msg.room)
        setView("meeting")
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
        setChatMessages([
          { id: nextChatId(), type: "system", text: `joined room: ${msg.room.name} (${msg.room.id})` },
        ])
        break

      case "room-not-found":
        setError("Room not found. Check the room ID.")
        setTimeout(() => setError(null), 4000)
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

      case "error":
        setError(msg.message)
        setTimeout(() => setError(null), 4000)
        break
    }
  }, [addSystem])

  const { connState, send } = useWebSocket(onMessage)

  const { cameraOn, micOn, localDisplay, startCamera, stopCamera, toggleCamera, toggleMic } =
    useCamera(myId, (frame) => {
      send({ type: "video-frame", frame })
    })

  const handleCreateRoom = useCallback(
    (roomName: string, userName: string) => {
      send({ type: "create-room", name: roomName, userName })
    },
    [send],
  )

  const handleJoinRoom = useCallback(
    (roomId: string, userName: string) => {
      send({ type: "join-room", roomId, userName })
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
    toggleMic()
    send({ type: "toggle-mute", isMuted: micOn })
  }, [toggleMic, send, micOn])

  const handleLeave = useCallback(() => {
    send({ type: "leave-room" })
    stopCamera()
    setView("lobby")
    setMyId(null)
    myIdRef.current = null
    setRoom(null)
    setRemoteDisplays({})
    setChatMessages([])
  }, [send, stopCamera])

  // Auto-start camera when entering meeting
  useEffect(() => {
    if (view === "meeting") {
      startCamera()
    }
  }, [view, startCamera])

  return (
    <div className="app">
      {view === "lobby" && (
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
