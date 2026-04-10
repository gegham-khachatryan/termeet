interface ControlsProps {
  isMuted: boolean
  isCameraOn: boolean
  chatVisible: boolean
  clipboardHint: string | null
  roomId: string
  participantCount: number
  webrtcPeerCount: number
  elapsed: string
  onToggleMute: () => void
  onToggleCamera: () => void
  onToggleChat: () => void
  onCopyRoomId: () => void
  onLeave: () => void
}

function ControlButton({
  hotkey,
  label,
  colorClass,
  onPress,
}: {
  hotkey: string
  label: string
  colorClass: string
  onPress: () => void
}) {
  return (
    <button type="button" className={`ctrl ${colorClass}`} onClick={onPress}>
      <span className="ctrl-hotkey">[{hotkey}]</span> {label}
    </button>
  )
}

export function Controls({
  isMuted,
  isCameraOn,
  chatVisible,
  clipboardHint,
  roomId,
  participantCount,
  webrtcPeerCount,
  elapsed,
  onToggleMute,
  onToggleCamera,
  onToggleChat,
  onCopyRoomId,
  onLeave,
}: ControlsProps) {
  return (
    <footer className="controls-bar">
      <div className="controls-bar__left">
        <button type="button" className="room-id-btn" onClick={onCopyRoomId} title="Copy room ID">
          <span className="room-id-btn__label">Room:</span>{" "}
          <span className="room-id-btn__id">{roomId}</span>
          {clipboardHint ? (
            <span className="room-id-btn__hint room-id-btn__hint--ok">{clipboardHint}</span>
          ) : (
            <span className="room-id-btn__hint">click</span>
          )}
        </button>
        <span className="controls-meta">
          {participantCount} participant{participantCount !== 1 ? "s" : ""}
          {webrtcPeerCount > 0 && (
            <span className="controls-conn"> ({webrtcPeerCount} p2p)</span>
          )}
        </span>
        <span className="controls-elapsed">{elapsed}</span>
      </div>

      <div className="controls-bar__center">
        <ControlButton
          hotkey="M"
          label={isMuted ? "Unmute" : "Mute"}
          colorClass={isMuted ? "ctrl-off" : "ctrl-on"}
          onPress={onToggleMute}
        />
        <ControlButton
          hotkey="V"
          label={isCameraOn ? "Cam Off" : "Cam On"}
          colorClass={isCameraOn ? "ctrl-on" : "ctrl-off"}
          onPress={onToggleCamera}
        />
        <ControlButton
          hotkey="T"
          label="Chat"
          colorClass={chatVisible ? "ctrl-chat-on" : "ctrl-chat-off"}
          onPress={onToggleChat}
        />
        <ControlButton hotkey="I" label="Copy ID" colorClass="ctrl-copy" onPress={onCopyRoomId} />
        <ControlButton hotkey="Q" label="Leave" colorClass="ctrl-leave" onPress={onLeave} />
      </div>

      <div className="controls-bar__right">
        Tab: chat · I: copy · Ctrl+Q: quit
      </div>
    </footer>
  )
}
