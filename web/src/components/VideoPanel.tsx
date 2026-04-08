import type { CSSProperties } from 'react'

type VideoGridCssVars = CSSProperties & {
  '--vg-cols'?: number
  '--vg-rows'?: number
}
import type { AsciiVideoDisplay, Participant } from '../types'
import { gridLayout } from '../video-grid'
import { ColoredAscii } from './ColoredAscii'
import { VideoAsciiFit } from './VideoAsciiFit'

interface VideoPanelProps {
  roomName: string
  participants: Participant[]
  myId: string
  localDisplay: AsciiVideoDisplay | null
  remoteDisplays: Record<string, AsciiVideoDisplay | undefined>
}

function renderTile(display: AsciiVideoDisplay | null | undefined, emptyLabel: string) {
  if (!display) {
    return <pre className='video-feed video-feed--empty'>{emptyLabel}</pre>
  }
  if (display.type === 'plain') {
    return (
      <VideoAsciiFit>
        <pre className={`video-feed active video-feed--plain${display.dim ? ' dim' : ''}`}>{display.text}</pre>
      </VideoAsciiFit>
    )
  }
  return (
    <VideoAsciiFit>
      <ColoredAscii lines={display.lines} />
    </VideoAsciiFit>
  )
}

function orderedParticipants(participants: Participant[], myId: string): Participant[] {
  const self = participants.find((p) => p.id === myId)
  const others = participants.filter((p) => p.id !== myId)
  return self ? [self, ...others] : [...participants]
}

export function VideoPanel({ roomName, participants, myId, localDisplay, remoteDisplays }: VideoPanelProps) {
  const ordered = orderedParticipants(participants, myId)
  const n = ordered.length
  const solo = n <= 1
  const { gridCols, gridRows } = gridLayout(n)

  const gridStyle: VideoGridCssVars | undefined = solo
    ? undefined
    : {
        '--vg-cols': gridCols,
        '--vg-rows': gridRows
      }

  return (
    <div className={`video-area${solo ? ' video-area--solo' : ''}`} style={gridStyle}>
      {ordered.map((p, i) => {
        const isSelf = p.id === myId
        const display = isSelf ? localDisplay : remoteDisplays[p.id]
        const emptyLabel = isSelf ? 'Camera off' : p.isCameraOn ? 'no signal' : 'Camera off'
        const title = isSelf ? `${roomName} (You)` : p.name
        const muteIcon = p.isMuted ? '🔇' : '🎤'
        const camIcon = p.isCameraOn ? '📹' : '📷'
        const orphanClass = n === 3 && gridCols === 2 && i === 2 ? ' video-box--orphan' : ''
        return (
          <div key={p.id} className={`video-box ${isSelf ? 'video-box--self' : 'video-box--remote'}${orphanClass}`}>
            <div className='video-label video-label--center'>{title}</div>
            <div className='video-inner'>{renderTile(display ?? null, emptyLabel)}</div>
            <div className='video-status' aria-hidden>
              {muteIcon} {camIcon}
            </div>
          </div>
        )
      })}
    </div>
  )
}
