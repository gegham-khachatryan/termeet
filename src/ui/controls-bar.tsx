interface ControlsBarProps {
  isMuted: boolean
  isCameraOn: boolean
  onToggleMute: () => void
  onToggleCamera: () => void
  onToggleChat: () => void
  onLeave: () => void
  onCopyRoomId: () => void
  clipboardHint: string | null
  chatVisible: boolean
  roomId: string
  participantCount: number
  elapsed: string
}

interface ControlButtonProps {
  label: string
  hotkey: string
  color: string
  onPress: () => void
}

function ControlButton({ label, hotkey, color, onPress }: ControlButtonProps) {
  return (
    <box
      border
      borderStyle="rounded"
      borderColor={color}
      paddingX={1}
      onMouseDown={() => onPress()}
    >
      <text fg={color}>
        <b>[{hotkey}] {label}</b>
      </text>
    </box>
  )
}

export function ControlsBar({
  isMuted,
  isCameraOn,
  onToggleMute,
  onToggleCamera,
  onToggleChat,
  onLeave,
  onCopyRoomId,
  clipboardHint,
  chatVisible,
  roomId,
  participantCount,
  elapsed,
}: ControlsBarProps) {
  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      paddingX={2}
      height={3}
    >
      <box flexDirection="row" gap={2} alignItems="center">
        <box
          flexDirection="row"
          gap={1}
          alignItems="center"
          onMouseDown={() => onCopyRoomId()}
        >
          <text fg="#888888">
            Room: <b fg="cyan">{roomId}</b>
          </text>
          {clipboardHint ? (
            <text fg="green">
              <b>{clipboardHint}</b>
            </text>
          ) : (
            <text fg="#555555">click</text>
          )}
        </box>
        <text fg="#888888">
          {`${participantCount} participant${participantCount !== 1 ? "s" : ""}`}
        </text>
        <text fg="#666666">{elapsed}</text>
      </box>

      <box flexDirection="row" gap={1}>
        <ControlButton
          hotkey="M"
          label={isMuted ? "Unmute" : "Mute"}
          color={isMuted ? "red" : "green"}
          onPress={onToggleMute}
        />
        <ControlButton
          hotkey="V"
          label={isCameraOn ? "Cam Off" : "Cam On"}
          color={isCameraOn ? "green" : "red"}
          onPress={onToggleCamera}
        />
        <ControlButton
          hotkey="T"
          label="Chat"
          color={chatVisible ? "cyan" : "#666666"}
          onPress={onToggleChat}
        />
        <ControlButton
          hotkey="I"
          label="Copy ID"
          color="#aaaa00"
          onPress={onCopyRoomId}
        />
        <ControlButton
          hotkey="Q"
          label="Leave"
          color="red"
          onPress={onLeave}
        />
      </box>

      <text fg="#555555">
        Tab: chat · I: copy · Ctrl+Q: quit
      </text>
    </box>
  )
}
