import type { Participant } from "../types"

interface ParticipantsBarProps {
  participants: Participant[]
  selfId: string
}

export function ParticipantsBar({ participants, selfId }: ParticipantsBarProps) {
  return (
    <div className="participants-bar" aria-label="Participants">
      {participants.map((p) => {
        const isSelf = p.id === selfId
        const muteIcon = p.isMuted ? "🔇" : "🎤"
        const camIcon = p.isCameraOn ? "📹" : "📷"
        return (
          <span
            key={p.id}
            className={`participant-chip${isSelf ? " participant-chip--self" : ""}`}
          >
            {muteIcon} {camIcon} {p.name}
            {isSelf ? " (You)" : ""}
          </span>
        )
      })}
    </div>
  )
}
