import type { Participant } from "../protocol.ts"

interface ParticipantsBarProps {
  participants: Participant[]
  selfId: string
  onPinParticipant?: (id: string) => void
}

export function ParticipantsBar({ participants, selfId, onPinParticipant }: ParticipantsBarProps) {
  return (
    <box
      flexDirection="row"
      paddingX={2}
      height={1}
      gap={2}
    >
      {participants.map((p) => {
        const isSelf = p.id === selfId
        const muteIcon = p.isMuted ? "🔇" : "🎤"
        const camIcon = p.isCameraOn ? "📹" : "📷"

        return (
          <box
            key={p.id}
            onMouseDown={() => onPinParticipant?.(p.id)}
          >
            <text fg={isSelf ? "cyan" : "#aaaaaa"}>
              {muteIcon} {camIcon} {p.name}{isSelf ? " (You)" : ""}
            </text>
          </box>
        )
      })}
    </box>
  )
}
