import type { StyledText } from '@opentui/core'

interface VideoPanelProps {
  name: string
  /** Plain string or OpenTUI StyledText (true-color glyphs). */
  asciiFrame: string | StyledText | null
  isMuted: boolean
  isCameraOn: boolean
  isSelf?: boolean
  isPinned?: boolean
  width?: number
  height?: number
  onPin?: () => void
}

export function VideoPanel({
  name,
  asciiFrame,
  isMuted,
  isCameraOn,
  isSelf = false,
  isPinned = false,
  width,
  height,
  onPin
}: VideoPanelProps) {
  const borderColor = isPinned ? 'yellow' : isSelf ? 'cyan' : '#888888'

  const statusIcons = [isMuted ? '🔇' : '🎤', isCameraOn ? '📹' : '📷', isPinned ? '📌' : ''].filter(Boolean).join(' ')

  const displayName = isSelf ? `${name} (You)` : name

  return (
    <box
      flexDirection='column'
      justifyContent='center'
      flexShrink={0}
      border
      borderStyle="rounded"
      borderColor={borderColor}
      title={` ${displayName} `}
      titleAlignment='center'
      bottomTitle={` ${statusIcons} `}
      bottomTitleAlignment='center'
      width={width}
      height={height}
      overflow='hidden'
      paddingX={1}
      onMouseDown={() => onPin?.()}
    >
      {isCameraOn && asciiFrame ? (
        <text wrapMode='none' content={asciiFrame} />
      ) : (
        <box flexGrow={1} alignItems='center' justifyContent='center'>
          <text fg='#666666'>
            <b>{isCameraOn ? 'No signal' : 'Camera off'}</b>
          </text>
          <text fg='#444444' style={{ marginTop: 1 }}>
            {!isCameraOn ? `${name}'s camera is turned off` : 'Waiting for video...'}
          </text>
        </box>
      )}
    </box>
  )
}
