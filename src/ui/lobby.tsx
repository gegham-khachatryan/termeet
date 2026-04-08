import { useState, useCallback } from 'react'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import { inputChrome } from './input-chrome.ts'
import { getSavedUserName, saveUserName } from '../lib/config.ts'

interface LobbyProps {
  onCreateRoom: (roomName: string, userName: string) => void
  onJoinRoom: (roomId: string, userName: string) => void
  onQuit: () => void
  connectionState: string
  error: string | null
}

/** Stylized "TERMEET" wordmark (box-drawing). */
const LOGO_ASCII = `╔╦╗╔═╗╦═╗╔╦╗╔═╗╔═╗╔╦╗
 ║ ║╣ ╠╦╝║║║║╣ ║╣  ║
 ╩ ╚═╝╩╚═╩ ╩╚═╝╚═╝ ╩ `

function LogoMark() {
  return (
    <text fg='cyan'>
      <b>{LOGO_ASCII}</b>
    </text>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'danger'

interface ButtonProps {
  label: string
  onPress: () => void
  focused?: boolean
  variant?: ButtonVariant
  flexGrow?: number
}

function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <box
      border
      borderStyle='rounded'
      borderColor='#884444'
      paddingX={1}
      paddingY={0}
      justifyContent='center'
      alignItems='center'
      minHeight={2}
      onMouseDown={() => onPress()}
    >
      <text fg='#ff6666'>
        <b>✕</b>
      </text>
    </box>
  )
}

function ServerStatusChip({ isConnected }: { isConnected: boolean }) {
  return (
    <box flexGrow={1} flexDirection='row' alignItems='center' gap={1} paddingX={0} paddingY={0} minHeight={2}>
      <text fg={isConnected ? 'cyan' : 'yellow'}>{isConnected ? '●' : '○'}</text>
      <text fg={isConnected ? '#a8d8f0' : '#ffdd88'}>
        <b>{isConnected ? 'Online — server ready' : 'Waiting for server…'}</b>
      </text>
    </box>
  )
}

function Button({ label, onPress, focused, variant = 'primary', flexGrow }: ButtonProps) {
  const colors: Record<ButtonVariant, { border: string; fg: string }> = {
    primary: { border: focused ? 'cyan' : '#2a8a9e', fg: focused ? 'cyan' : '#e0fdff' },
    secondary: { border: focused ? '#aaaaaa' : '#555555', fg: focused ? 'white' : '#cccccc' },
    danger: { border: focused ? 'red' : '#992222', fg: focused ? 'red' : '#ffaaaa' }
  }
  const { border, fg } = colors[variant]

  return (
    <box
      flexGrow={flexGrow}
      border
      borderStyle='rounded'
      borderColor={border}
      paddingX={2}
      paddingY={1}
      justifyContent='center'
      alignItems='center'
      minHeight={3}
      onMouseDown={() => onPress()}
    >
      <text fg={fg}>
        <b>{label}</b>
      </text>
    </box>
  )
}

export function Lobby({ onCreateRoom, onJoinRoom, onQuit, connectionState, error }: LobbyProps) {
  const { width: termW } = useTerminalDimensions()
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu')
  const [userName, setUserName] = useState(() => getSavedUserName())
  const [roomName, setRoomName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [focusedField, setFocusedField] = useState<'name' | 'room' | 'submit' | 'back'>('name')

  const cardWidth = Math.min(Math.max(termW - 8, 52), 82)

  const handleSubmit = useCallback(() => {
    if (mode === 'create' && userName && roomName) {
      saveUserName(userName)
      onCreateRoom(roomName, userName)
    } else if (mode === 'join' && userName && roomId) {
      saveUserName(userName)
      onJoinRoom(roomId, userName)
    }
  }, [mode, userName, roomName, roomId, onCreateRoom, onJoinRoom])

  useKeyboard((key) => {
    const letter = key.name.length === 1 ? key.name.toLowerCase() : key.name
    if (key.name === 'escape') {
      if (mode !== 'menu') {
        setMode('menu')
        setFocusedField('name')
      } else {
        onQuit()
      }
    }
    if (mode === 'menu') {
      if (letter === 'c') setMode('create')
      if (letter === 'j') setMode('join')
      if (letter === 'q') onQuit()
    }
    if (key.name === 'tab' && (mode === 'create' || mode === 'join')) {
      if (focusedField === 'name') setFocusedField('room')
      else if (focusedField === 'room') setFocusedField('submit')
      else if (focusedField === 'submit') setFocusedField('back')
      else setFocusedField('name')
    }
    if (key.name === 'return' && (mode === 'create' || mode === 'join')) {
      if (focusedField === 'back') {
        setMode('menu')
        setFocusedField('name')
      } else {
        handleSubmit()
      }
    }
  })

  const isConnected = connectionState === 'connected'

  if (mode === 'menu') {
    const frameColor = isConnected ? '#2a4558' : '#5a4a38'
    const frameAccent = isConnected ? 'cyan' : 'yellow'

    return (
      <box flexDirection='column' alignItems='center' justifyContent='center' width='100%' height='100%' padding={2}>
        <box
          flexDirection='column'
          // border
          // borderStyle='rounded'
          // borderColor={frameAccent}
          gap={1}
          paddingX={2}
          paddingY={1}
          width={cardWidth}
        >
          <box
            flexDirection='column'
            border
            borderStyle='rounded'
            borderColor={frameColor}
            paddingX={2}
            paddingY={2}
            gap={1}
          >
            <box flexDirection='column' alignItems='center' gap={0}>
              <LogoMark />
              <text fg='white' marginTop={1}>
                <b>Video conferencing in your terminal</b>
              </text>
              <text fg='#99aabb'>ASCII cameras · real-time chat · room codes</text>
            </box>

            <text fg='#445566' marginTop={1} alignSelf='center'>
              ───────────────────────────────────────
            </text>

            {error && (
              <box paddingX={2} paddingY={1} border borderStyle='rounded' borderColor='#aa3333'>
                <text fg='#ffaaaa'>
                  <b>!</b> {error}
                </text>
              </box>
            )}

            <box flexDirection='row' gap={2} marginTop={0} width='100%'>
              <Button label='  Create room  ' variant='primary' flexGrow={1} onPress={() => setMode('create')} />
              <Button label='  Join room  ' variant='primary' flexGrow={1} onPress={() => setMode('join')} />
            </box>

            <text fg='#556677' marginTop={1} alignSelf='center'>
              Keys: <b>C</b> create · <b>J</b> join · <b>Q</b> / <b>Esc</b> quit
            </text>
          </box>
          <box flexDirection='row' alignItems='center' width='100%' gap={1}>
            <ServerStatusChip isConnected={isConnected} />
            {/* <CloseButton onPress={onQuit} /> */}
          </box>
        </box>
      </box>
    )
  }

  const isCreate = mode === 'create'

  return (
    <box flexDirection='column' alignItems='center' justifyContent='center' width='100%' height='100%' padding={2}>
      <box flexDirection='column' paddingX={2} gap={1} paddingY={1} width={cardWidth}>
        <box
          flexDirection='column'
          border
          borderStyle='rounded'
          borderColor='#2a4a5a'
          paddingX={3}
          paddingY={2}
          title={isCreate ? ' New room ' : ' Join room '}
          titleAlignment='center'
          gap={1}
        >
          <box flexDirection='column' alignItems='center' gap={0} marginBottom={1}>
            <LogoMark />
          </box>

          <box
            border
            borderStyle='rounded'
            borderColor={focusedField === 'name' ? 'cyan' : '#3d5268'}
            title=' Display name '
            titleAlignment='left'
            paddingX={1}
            paddingY={0}
            width='100%'
            onMouseDown={() => setFocusedField('name')}
          >
            <input
              focused={focusedField === 'name'}
              placeholder='Your name'
              value={userName}
              onInput={(val: string) => setUserName(val)}
              style={inputChrome}
            />
          </box>

          <box
            border
            borderStyle='rounded'
            borderColor={focusedField === 'room' ? 'cyan' : '#3d5268'}
            title={isCreate ? ' Room name ' : ' Room ID '}
            titleAlignment='left'
            paddingX={1}
            paddingY={0}
            marginTop={1}
            width='100%'
            onMouseDown={() => setFocusedField('room')}
          >
            <input
              focused={focusedField === 'room'}
              placeholder={isCreate ? 'e.g. standup' : 'Paste or type room id'}
              value={isCreate ? roomName : roomId}
              onInput={(val: string) => (isCreate ? setRoomName(val) : setRoomId(val))}
              style={inputChrome}
            />
          </box>

          {error && (
            <box paddingX={2} paddingY={1} border borderStyle='rounded' borderColor='#aa3333' marginTop={1}>
              <text fg='#ffaaaa'>
                <b>!</b> {error}
              </text>
            </box>
          )}

          <box flexDirection='row' justifyContent='space-between' marginTop={2} gap={2} width='100%'>
            <Button
              label={isCreate ? '  Create  ' : '  Join  '}
              variant='primary'
              flexGrow={1}
              focused={focusedField === 'submit'}
              onPress={handleSubmit}
            />
            <Button
              label='  Back  '
              variant='secondary'
              flexGrow={1}
              focused={focusedField === 'back'}
              onPress={() => {
                setMode('menu')
                setFocusedField('name')
              }}
            />
          </box>

          <text fg='#556677' marginTop={1} alignSelf='center'>
            Keys: <b>Tab</b> fields & buttons · <b>Enter</b> activate · <b>Esc</b> back
          </text>
        </box>
        <box flexDirection='row' alignItems='center' width='100%' gap={1}>
          <ServerStatusChip isConnected={isConnected} />
          {/* <CloseButton onPress={onQuit} /> */}
        </box>
      </box>
    </box>
  )
}
