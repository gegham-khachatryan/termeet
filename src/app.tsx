import { useState, useEffect, useCallback, useRef } from "react"
import type { StyledText } from "@opentui/core"
import { useTerminalDimensions, useRenderer } from "@opentui/react"
import type { Room, Participant, ChatMessage, AsciiFrame } from "./protocol.ts"
import {
  FRAME_RATE,
  ASCII_RAMP_BLOCKS,
  DEFAULT_SERVER_HOST,
  DEFAULT_SERVER_PORT,
} from "./protocol.ts"
import { TermeetClient, type ConnectionState } from "./network/client.ts"
import { CameraCapture } from "./media/camera.ts"
import { AsciiRenderer, generateTestFrame, downsampleFrame } from "./media/ascii-renderer.ts"
import type { RawFrame } from "./media/camera.ts"
import { AudioCapture, AudioPlayback } from "./media/audio.ts"
import { Lobby } from "./ui/lobby.tsx"
import { MeetingRoom } from "./ui/meeting-room.tsx"
import { asciiStreamDimensions, meetingAsciiDimensions } from "./ui/video-sizes.ts"

type AppView = "lobby" | "meeting"

export function App() {
  const cliRenderer = useRenderer()
  const { width: termW, height: termH } = useTerminalDimensions()

  // ─── Connection state ───────────────────────────────────────────────
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected")
  const [error, setError] = useState<string | null>(null)

  // ─── Room state ─────────────────────────────────────────────────────
  const [view, setView] = useState<AppView>("lobby")
  const [room, setRoom] = useState<Room | null>(null)
  const [selfId, setSelfId] = useState<string>("")

  // ─── Media state ────────────────────────────────────────────────────
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(true)
  const [localFrame, setLocalFrame] = useState<string | StyledText | null>(null)
  const [remoteFrames, setRemoteFrames] = useState<Map<string, string | StyledText>>(new Map())
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatVisible, setChatVisible] = useState(false)
  const [pinnedParticipantId, setPinnedParticipantId] = useState<string | null>(null)

  // ─── Refs ───────────────────────────────────────────────────────────
  const clientRef = useRef<TermeetClient | null>(null)
  const cameraRef = useRef<CameraCapture | null>(null)
  const rendererRef = useRef<AsciiRenderer | null>(null)
  const audioCaptureRef = useRef<AudioCapture | null>(null)
  const audioPlaybackRef = useRef<AudioPlayback | null>(null)
  const testFrameCounter = useRef(0)
  const testFrameInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── ASCII renderer config (must match MeetingRoom tile inner size) ─────
  const chatWidthForVideo = chatVisible ? Math.floor(termW * 0.28) : 0
  const { cols: videoCols, rows: videoRows } =
    room && view === "meeting"
      ? meetingAsciiDimensions(
          termW,
          termH,
          chatWidthForVideo,
          pinnedParticipantId
            ? { layout: "pinned", sidebarTileCount: Math.max(0, room.participants.length - 1) }
            : { layout: "grid", participantCount: room.participants.length },
        )
      : asciiStreamDimensions(termW, termH)

  // ─── Initialize client ─────────────────────────────────────────────
  useEffect(() => {
    const host = process.env["TERMEET_HOST"] ?? DEFAULT_SERVER_HOST
    const port = Number(process.env["TERMEET_PORT"]) || DEFAULT_SERVER_PORT

    const client = new TermeetClient(
      {
        onConnectionChange: (state) => setConnectionState(state),
        onRoomCreated: (room, participantId) => {
          setRoom(room)
          setSelfId(participantId)
          setView("meeting")
          setError(null)
        },
        onRoomJoined: (room, participantId) => {
          setRoom(room)
          setSelfId(participantId)
          setView("meeting")
          setError(null)
        },
        onRoomNotFound: () => {
          setError("Room not found. Check the Room ID and try again.")
        },
        onParticipantJoined: (participant) => {
          setRoom((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              participants: [...prev.participants, participant],
            }
          })
        },
        onParticipantLeft: (participantId) => {
          setRoom((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              participants: prev.participants.filter((p) => p.id !== participantId),
            }
          })
          setRemoteFrames((prev) => {
            const next = new Map(prev)
            next.delete(participantId)
            return next
          })
        },
        onParticipantUpdated: (participant) => {
          setRoom((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              participants: prev.participants.map((p) =>
                p.id === participant.id ? participant : p,
              ),
            }
          })
        },
        onChatMessage: (message) => {
          setChatMessages((prev) => [...prev, message])
        },
        onVideoFrame: (frame) => {
          // Decode raw RGB base64 and render locally with our terminal dimensions
          const renderer = rendererRef.current
          if (!renderer) {
            setRemoteFrames((prev) => {
              const next = new Map(prev)
              next.set(frame.senderId, frame.data)
              return next
            })
            return
          }
          try {
            const buf = Buffer.from(frame.data, "base64")
            const rawFrame: RawFrame = { width: frame.width, height: frame.height, data: buf }
            const ascii = renderer.renderColored(rawFrame)
            setRemoteFrames((prev) => {
              const next = new Map(prev)
              next.set(frame.senderId, ascii)
              return next
            })
          } catch {
            // Fallback: treat data as pre-rendered ASCII (backwards compat)
            setRemoteFrames((prev) => {
              const next = new Map(prev)
              next.set(frame.senderId, frame.data)
              return next
            })
          }
        },
        onAudioData: (senderId, data, timestamp) => {
          // Decode and play audio
          if (audioPlaybackRef.current?.isRunning()) {
            const buf = Buffer.from(data, "base64")
            audioPlaybackRef.current.write(buf)
          }
        },
        onError: (message) => setError(message),
      },
      host,
      port,
    )

    client.connect()
    clientRef.current = client

    return () => {
      client.disconnect()
    }
  }, [])

  // ─── Initialize ASCII renderer ────────────────────────────────────
  useEffect(() => {
    rendererRef.current = new AsciiRenderer({
      outputWidth: videoCols,
      outputHeight: videoRows,
      charset: ASCII_RAMP_BLOCKS,
      // OpenTUI <text> does not interpret inline ANSI; truecolor/ansi256 would show as garbage.
      colorMode: "none",
      contrast: 0.3,
      brightness: 0.1,
    })
  }, [videoCols, videoRows])

  // ─── Camera management ────────────────────────────────────────────
  useEffect(() => {
    if (view !== "meeting") return

    const startCamera = async () => {
      try {
        const camera = new CameraCapture(320, 240, (frame) => {
          if (!rendererRef.current) return

          // Render locally for self-preview
          const ascii = rendererRef.current.renderColored(frame)
          setLocalFrame(ascii)

          // Downsample and send raw RGB as base64 for remote rendering
          const client = clientRef.current
          if (client) {
            const small = downsampleFrame(frame, 160, 120)
            client.sendVideoFrame({
              senderId: selfId,
              width: small.width,
              height: small.height,
              data: small.data.toString("base64"),
              timestamp: Date.now(),
            })
          }
        })

        await camera.start()
        if (camera.isRunning()) {
          cameraRef.current = camera
        } else {
          startTestPattern()
        }
      } catch {
        startTestPattern()
      }
    }

    const startTestPattern = () => {
      testFrameInterval.current = setInterval(() => {
        if (!rendererRef.current || !clientRef.current) return

        testFrameCounter.current++
        const frame = generateTestFrame(160, 120, testFrameCounter.current)

        // Render locally for self-preview
        const ascii = rendererRef.current.renderColored(frame)
        setLocalFrame(ascii)

        // Send raw RGB as base64
        clientRef.current.sendVideoFrame({
          senderId: selfId,
          width: frame.width,
          height: frame.height,
          data: frame.data.toString("base64"),
          timestamp: Date.now(),
        })
      }, 1000 / FRAME_RATE)
    }

    if (isCameraOn) {
      void startCamera()
    }

    return () => {
      cameraRef.current?.stop()
      cameraRef.current = null
      if (testFrameInterval.current) {
        clearInterval(testFrameInterval.current)
        testFrameInterval.current = null
      }
    }
  }, [
    view,
    isCameraOn,
    selfId,
    // Intentionally omit videoCols/videoRows: grid/pinned layout only changes the renderer
    // (separate effect). Restarting ffmpeg when a peer joins breaks capture until camera toggle.
  ])

  // ─── Audio management ─────────────────────────────────────────────
  useEffect(() => {
    if (view !== "meeting") return

    const startAudio = async () => {
      try {
        // Start playback
        const playback = new AudioPlayback()
        await playback.start()
        if (playback.isRunning()) {
          audioPlaybackRef.current = playback
        }

        // Start capture if not muted
        if (!isMuted) {
          const capture = new AudioCapture((data) => {
            clientRef.current?.sendAudioData(data.toString("base64"), Date.now())
          })
          await capture.start()
          if (capture.isRunning()) {
            audioCaptureRef.current = capture
          }
        }
      } catch {
        // Audio pipeline error
      }
    }

    void startAudio()

    return () => {
      audioCaptureRef.current?.stop()
      audioCaptureRef.current = null
      audioPlaybackRef.current?.stop()
      audioPlaybackRef.current = null
    }
  }, [view])

  // ─── Mute/unmute audio ────────────────────────────────────────────
  useEffect(() => {
    if (view !== "meeting") return

    if (isMuted) {
      audioCaptureRef.current?.stop()
      audioCaptureRef.current = null
    } else if (!audioCaptureRef.current) {
      void (async () => {
        const capture = new AudioCapture((data) => {
          clientRef.current?.sendAudioData(data.toString("base64"), Date.now())
        })
        await capture.start()
        if (capture.isRunning()) {
          audioCaptureRef.current = capture
        }
      })()
    }
  }, [isMuted, view])

  // ─── Handlers ─────────────────────────────────────────────────────

  const handleCreateRoom = useCallback((roomName: string, userName: string) => {
    clientRef.current?.createRoom(roomName, userName)
  }, [])

  const handleJoinRoom = useCallback((roomId: string, userName: string) => {
    clientRef.current?.joinRoom(roomId, userName)
  }, [])

  const handleSendChat = useCallback((content: string) => {
    clientRef.current?.sendChat(content)
  }, [])

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev
      clientRef.current?.toggleMute(next)
      return next
    })
  }, [])

  const handleToggleCamera = useCallback(() => {
    setIsCameraOn((prev) => {
      const next = !prev
      clientRef.current?.toggleCamera(next)
      if (!next) {
        setLocalFrame(null)
      }
      return next
    })
  }, [])

  const handleLeave = useCallback(() => {
    clientRef.current?.leaveRoom()
    cameraRef.current?.stop()
    audioCaptureRef.current?.stop()
    audioPlaybackRef.current?.stop()
    setRoom(null)
    setSelfId("")
    setView("lobby")
    setChatMessages([])
    setRemoteFrames(new Map())
    setLocalFrame(null)
    setIsMuted(false)
    setIsCameraOn(true)
    setPinnedParticipantId(null)
    setChatVisible(false)
  }, [])

  /** End process: disconnect WS (stops reconnect loop), release media, tear down OpenTUI. */
  const handleQuitApp = useCallback(() => {
    clientRef.current?.disconnect()
    cameraRef.current?.stop()
    audioCaptureRef.current?.stop()
    audioPlaybackRef.current?.stop()
    if (testFrameInterval.current) {
      clearInterval(testFrameInterval.current)
      testFrameInterval.current = null
    }
    try {
      cliRenderer.destroy()
    } catch {
      // ignore
    }
    process.exit(0)
  }, [cliRenderer])

  // ─── Render ───────────────────────────────────────────────────────

  if (view === "lobby" || !room) {
    return (
      <Lobby
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onQuit={handleQuitApp}
        connectionState={connectionState}
        error={error}
      />
    )
  }

  return (
    <MeetingRoom
      room={room}
      selfId={selfId}
      chatMessages={chatMessages}
      remoteFrames={remoteFrames}
      localFrame={localFrame}
      onSendChat={handleSendChat}
      onToggleMute={handleToggleMute}
      onToggleCamera={handleToggleCamera}
      onLeave={handleLeave}
      onQuitApp={handleQuitApp}
      isMuted={isMuted}
      isCameraOn={isCameraOn}
      chatVisible={chatVisible}
      onToggleChat={() => setChatVisible((v) => !v)}
      pinnedParticipantId={pinnedParticipantId}
      onPinnedChange={setPinnedParticipantId}
    />
  )
}
