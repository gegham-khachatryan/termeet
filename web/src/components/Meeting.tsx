import { useCallback, useEffect, useRef, useState } from "react"
import type { AsciiVideoDisplay, Room } from "../types"
import type { ChatEntry } from "./ChatPanel"
import { VideoPanel } from "./VideoPanel"
import { ChatPanel } from "./ChatPanel"
import { Controls } from "./Controls"
import { ParticipantsBar } from "./ParticipantsBar"

interface MeetingProps {
  room: Room
  myId: string
  localDisplay: AsciiVideoDisplay | null
  remoteDisplays: Record<string, AsciiVideoDisplay | undefined>
  chatMessages: ChatEntry[]
  cameraOn: boolean
  micOn: boolean
  onSendChat: (content: string) => void
  onToggleCamera: () => void
  onToggleMic: () => void
  onLeave: () => void
}

export function Meeting({
  room,
  myId,
  localDisplay,
  remoteDisplays,
  chatMessages,
  cameraOn,
  micOn,
  onSendChat,
  onToggleCamera,
  onToggleMic,
  onLeave,
}: MeetingProps) {
  const [chatVisible, setChatVisible] = useState(false)
  const [elapsed, setElapsed] = useState("00:00")
  const [clipboardHint, setClipboardHint] = useState<string | null>(null)
  const startTime = useRef(Date.now())
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  const flashClipboardHint = useCallback((message: string) => {
    if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current)
    setClipboardHint(message)
    clipboardTimerRef.current = setTimeout(() => {
      setClipboardHint(null)
      clipboardTimerRef.current = null
    }, 2500)
  }, [])

  const copyRoomId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(room.id)
      flashClipboardHint("Copied")
    } catch {
      flashClipboardHint("Copy failed")
    }
  }, [room.id, flashClipboardHint])

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - startTime.current) / 1000)
      const mins = String(Math.floor(diff / 60)).padStart(2, "0")
      const secs = String(diff % 60).padStart(2, "0")
      setElapsed(`${mins}:${secs}`)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    return () => {
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === "INPUT" || tag === "TEXTAREA"

      if (typing) {
        if (e.key === "Escape") {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        }
        return
      }

      if (e.ctrlKey && e.key.toLowerCase() === "q") {
        e.preventDefault()
        onLeave()
        return
      }

      if (e.metaKey || e.altKey) return

      const letter = e.key.length === 1 ? e.key.toLowerCase() : ""

      if (letter === "m") {
        e.preventDefault()
        onToggleMic()
      } else if (letter === "v") {
        e.preventDefault()
        onToggleCamera()
      } else if (letter === "t") {
        e.preventDefault()
        setChatVisible((v) => !v)
      } else if (letter === "q") {
        e.preventDefault()
        onLeave()
      } else if (letter === "i") {
        e.preventDefault()
        void copyRoomId()
      } else if (e.key === "Tab") {
        e.preventDefault()
        if (!chatVisible) return
        const input = chatInputRef.current
        if (!input) return
        if (document.activeElement === input) input.blur()
        else input.focus()
      }
    }

    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [chatVisible, onLeave, onToggleCamera, onToggleMic, copyRoomId])

  return (
    <div className="meeting">
      <ParticipantsBar participants={room.participants} selfId={myId} />

      <div className="meeting-body">
        <VideoPanel
          roomName={room.name}
          participants={room.participants}
          myId={myId}
          localDisplay={localDisplay}
          remoteDisplays={remoteDisplays}
        />
        {chatVisible && (
          <ChatPanel messages={chatMessages} onSend={onSendChat} inputRef={chatInputRef} />
        )}
      </div>

      <Controls
        isMuted={!micOn}
        isCameraOn={cameraOn}
        chatVisible={chatVisible}
        clipboardHint={clipboardHint}
        roomId={room.id}
        participantCount={room.participants.length}
        elapsed={elapsed}
        onToggleMute={onToggleMic}
        onToggleCamera={onToggleCamera}
        onToggleChat={() => setChatVisible((v) => !v)}
        onCopyRoomId={() => void copyRoomId()}
        onLeave={onLeave}
      />
    </div>
  )
}
