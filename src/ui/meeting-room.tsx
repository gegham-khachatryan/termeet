import { useState, useEffect, useRef, useCallback } from 'react'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import type { StyledText } from '@opentui/core'
import type { Room, Participant, ChatMessage } from '../protocol.ts'
import { VideoPanel } from './video-panel.tsx'
import { ChatPanel } from './chat-panel.tsx'
import { ControlsBar } from './controls-bar.tsx'
import { ParticipantsBar } from './participants-bar.tsx'
import { adaptivePanelInArea, adaptiveSidebarThumbs, adaptiveVideoPanelSize, videoContentArea } from './video-sizes.ts'
import { copyToClipboard } from '../lib/clipboard.ts'

interface MeetingRoomProps {
  room: Room
  selfId: string
  chatMessages: ChatMessage[]
  remoteFrames: Map<string, string | StyledText>
  localFrame: string | StyledText | null
  onSendChat: (content: string) => void
  onToggleMute: () => void
  onToggleCamera: () => void
  onLeave: () => void
  /** Full exit (lobby Quit). Default: Ctrl+Q from meeting. */
  onQuitApp: () => void
  isMuted: boolean
  isCameraOn: boolean
  chatVisible: boolean
  onToggleChat: () => void
  pinnedParticipantId: string | null
  onPinnedChange: (id: string | null) => void
}

export function MeetingRoom({
  room,
  selfId,
  chatMessages,
  remoteFrames,
  localFrame,
  onSendChat,
  onToggleMute,
  onToggleCamera,
  onLeave,
  onQuitApp,
  isMuted,
  isCameraOn,
  chatVisible,
  onToggleChat,
  pinnedParticipantId,
  onPinnedChange
}: MeetingRoomProps) {
  const [chatFocused, setChatFocused] = useState(false)
  const [elapsed, setElapsed] = useState('00:00')
  const [clipboardHint, setClipboardHint] = useState<string | null>(null)
  const { width: termW, height: termH } = useTerminalDimensions()
  const startTime = useRef(Date.now())
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashClipboardHint = useCallback((message: string) => {
    if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current)
    setClipboardHint(message)
    clipboardTimerRef.current = setTimeout(() => {
      setClipboardHint(null)
      clipboardTimerRef.current = null
    }, 2500)
  }, [])

  const copyRoomId = useCallback(async () => {
    const ok = await copyToClipboard(room.id)
    flashClipboardHint(ok ? 'Copied' : 'Copy failed (pbcopy / wl-copy / xclip / clip)')
  }, [room.id, flashClipboardHint])

  // Update elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - startTime.current) / 1000)
      const mins = String(Math.floor(diff / 60)).padStart(2, '0')
      const secs = String(diff % 60).padStart(2, '0')
      setElapsed(`${mins}:${secs}`)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Clear pin if participant leaves
  useEffect(() => {
    if (pinnedParticipantId && !room.participants.find((p) => p.id === pinnedParticipantId)) {
      onPinnedChange(null)
    }
  }, [room.participants, pinnedParticipantId, onPinnedChange])

  useEffect(() => {
    return () => {
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current)
    }
  }, [])

  useKeyboard((key) => {
    if (chatFocused && key.name === 'escape') {
      setChatFocused(false)
      return
    }
    if (chatFocused) return // Don't capture keys when typing in chat

    if (key.ctrl && key.name === 'q') {
      onQuitApp()
      return
    }

    const letter = key.name.length === 1 ? key.name.toLowerCase() : key.name

    if (key.name === 'm') onToggleMute()
    if (key.name === 'v') onToggleCamera()
    if (key.name === 't') onToggleChat()
    if (key.name === 'tab') setChatFocused((f) => !f)
    if (key.name === 'q') onLeave()
    if (key.name === 'p') onPinnedChange(null) // Unpin
    if (letter === 'i') void copyRoomId()
  })

  // ─── Layout calculation ─────────────────────────────────────────────

  const others = room.participants.filter((p) => p.id !== selfId)
  const self = room.participants.find((p) => p.id === selfId)
  const totalVideos = room.participants.length

  const chatWidth = chatVisible ? Math.floor(termW * 0.28) : 0
  const { w: videoAreaWidth, h: videoAreaHeight } = videoContentArea(termW, termH, chatWidth)

  const hasPinned = pinnedParticipantId !== null
  const pinnedParticipant = hasPinned ? room.participants.find((p) => p.id === pinnedParticipantId) : null

  /** Everyone except the pinned tile (sidebar when pinned). */
  const gridParticipants: Participant[] = []
  if (self && self.id !== pinnedParticipantId) gridParticipants.push(self)
  others.forEach((p) => {
    if (p.id !== pinnedParticipantId) gridParticipants.push(p)
  })

  /** Main stage order: you first, then others (used when not pinned). */
  const stageParticipants: Participant[] = []
  if (self) stageParticipants.push(self)
  stageParticipants.push(...others)

  const pad = 2

  const { panelWidth, panelHeight } = hasPinned
    ? { panelWidth: 0, panelHeight: 0 }
    : adaptiveVideoPanelSize(termW, termH, totalVideos, chatWidth)

  const pinnedStripW = hasPinned ? Math.floor(videoAreaWidth * 0.67) : 0
  const stageW = hasPinned ? Math.max(12, videoAreaWidth - pinnedStripW - 1) : videoAreaWidth
  const pinnedSize = hasPinned ? adaptivePanelInArea(pinnedStripW, videoAreaHeight, 1) : null
  const thumbSize = hasPinned ? adaptiveSidebarThumbs(stageW, videoAreaHeight, gridParticipants.length) : null

  const handlePin = (participantId: string) => {
    onPinnedChange(pinnedParticipantId === participantId ? null : participantId)
  }

  const renderPanel = (p: Participant, w: number, h: number, pinFlag: boolean) => {
    const isSelf = p.id === selfId
    const frame = isSelf ? localFrame : (remoteFrames.get(p.id) ?? null)
    return (
      <VideoPanel
        key={p.id}
        name={p.name}
        asciiFrame={frame}
        isMuted={p.isMuted}
        isCameraOn={p.isCameraOn}
        isSelf={isSelf}
        isPinned={pinFlag}
        width={w}
        height={h}
        onPin={() => handlePin(p.id)}
      />
    )
  }

  return (
    <box flexDirection='column' width={termW} height={termH}>
      {/* Participants bar */}
      <ParticipantsBar participants={room.participants} selfId={selfId} />

      {/* Main content area */}
      <box flexDirection='row' flexGrow={1}>
        {/* Video area — centered flex cards; pinned = large stage + sidebar thumbnails */}
        <box flexDirection='row' flexGrow={1} minHeight={videoAreaHeight} height={videoAreaHeight}>
          {hasPinned && pinnedParticipant && pinnedSize && (
            <box
              flexDirection='column'
              justifyContent='center'
              alignItems='center'
              width={pinnedStripW}
              paddingLeft={1}
            >
              {renderPanel(pinnedParticipant, pinnedSize.panelWidth, pinnedSize.panelHeight, true)}
            </box>
          )}

          <box
            flexDirection='column'
            flexGrow={1}
            justifyContent='center'
            alignItems='center'
            padding={pad}
            minHeight={videoAreaHeight}
            height={videoAreaHeight}
          >
            {hasPinned && thumbSize ? (
              <box flexDirection='column' flexGrow={1} justifyContent='center' alignItems='center' gap={2}>
                {gridParticipants.map((p) => renderPanel(p, thumbSize.panelWidth, thumbSize.panelHeight, false))}
              </box>
            ) : (
              <box flexDirection='column' alignItems='center' flexShrink={0} flexGrow={0}>
                <box
                  flexDirection='row'
                  flexWrap='wrap'
                  justifyContent='center'
                  alignItems='center'
                  gap={2}
                  flexShrink={0}
                >
                  {stageParticipants.map((p) => renderPanel(p, panelWidth, panelHeight, false))}
                </box>
              </box>
            )}
          </box>
        </box>

        {/* Chat panel */}
        {chatVisible && (
          <box width={chatWidth} height='100%'>
            <ChatPanel
              messages={chatMessages}
              onSendMessage={onSendChat}
              focused={chatFocused}
              selfId={selfId}
              onFocus={() => setChatFocused(true)}
            />
          </box>
        )}
      </box>

      {/* Controls bar */}
      <ControlsBar
        isMuted={isMuted}
        isCameraOn={isCameraOn}
        onToggleMute={onToggleMute}
        onToggleCamera={onToggleCamera}
        onToggleChat={onToggleChat}
        onLeave={onLeave}
        onCopyRoomId={() => void copyRoomId()}
        clipboardHint={clipboardHint}
        chatVisible={chatVisible}
        roomId={room.id}
        participantCount={room.participants.length}
        elapsed={elapsed}
      />
    </box>
  )
}
