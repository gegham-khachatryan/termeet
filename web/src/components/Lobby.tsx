import { useState, type KeyboardEvent } from 'react'
import type { ConnectionState } from '../hooks/useWebSocket'

interface LobbyProps {
  connState: ConnectionState
  error: string | null
  onCreateRoom: (roomName: string, userName: string) => void
  onJoinRoom: (roomId: string, userName: string) => void
}

const STATUS_LABELS: Record<ConnectionState, string> = {
  connected: '\u25cf Connected',
  connecting: '\u25cf Connecting...',
  disconnected: '\u25cf Disconnected'
}

const GITHUB_REPO = 'https://github.com/gegham-khachatryan/termeet'

export function Lobby({ connState, error, onCreateRoom, onJoinRoom }: LobbyProps) {
  const [userName, setUserName] = useState('')
  const [roomName, setRoomName] = useState('')
  const [roomId, setRoomId] = useState('')

  const handleCreate = () => {
    onCreateRoom(roomName.trim() || 'meeting', userName.trim() || 'anonymous')
  }

  const handleJoin = () => {
    if (!roomId.trim()) return
    onJoinRoom(roomId.trim(), userName.trim() || 'anonymous')
  }

  const onEnter = (action: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter') action()
  }

  return (
    <div className='lobby'>
      <div className='lobby-card'>
        <pre className='logo' aria-hidden>
          {` ╔╦╗╔═╗╦═╗╔╦╗╔═╗╔═╗╔╦╗
 ║ ║╣ ╠╦╝║║║║╣ ║╣  ║
 ╩ ╚═╝╩╚═╩ ╩╚═╝╚═╝ ╩`}
        </pre>
        <p className='tagline'>
          <strong className='tagline-lead'>Video conferencing in your terminal</strong>
          <span className='tagline-sub'>ASCII cameras · real-time chat · room codes</span>
        </p>

        <div className='lobby-rule' aria-hidden>
          ───────────────────────────────────────
        </div>

        <div className='status-line'>
          <span className={`conn-status ${connState}`}>{STATUS_LABELS[connState]}</span>
        </div>

        <div className='form-group'>
          <label>Your name</label>
          <div className='input-row'>
            <span className='prompt'>$</span>
            <input
              type='text'
              placeholder='anonymous'
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              autoComplete='off'
              spellCheck={false}
            />
          </div>
        </div>

        <div className='form-group'>
          <label>Create a new room</label>
          <div className='input-row'>
            <span className='prompt'>$</span>
            <input
              type='text'
              placeholder='room name'
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={onEnter(handleCreate)}
              autoComplete='off'
              spellCheck={false}
            />
            <button type='button' onClick={handleCreate}>
              create
            </button>
          </div>
        </div>

        <div className='separator'>── or ──</div>

        <div className='form-group'>
          <label>Join an existing room</label>
          <div className='input-row'>
            <span className='prompt'>$</span>
            <input
              type='text'
              placeholder='room id'
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyDown={onEnter(handleJoin)}
              autoComplete='off'
              spellCheck={false}
            />
            <button type='button' onClick={handleJoin}>
              join
            </button>
          </div>
        </div>

        {error && <div className='error'>{error}</div>}
      </div>

      <section className='lobby-cli-footer' aria-label='Terminal client setup'>
        <h2 className='lobby-cli-heading'>Join from the terminal</h2>
        <p className='lobby-cli-copy'>
          Install the CLI, then point it at the signaling server (same host as this page unless you self-host).
        </p>
        <pre className='lobby-cli-block'>{`npm install -g termeet \nor \nnpx termeet`}</pre>
      </section>

      <p className='lobby-github'>
        <a href={GITHUB_REPO} target='_blank' rel='noreferrer'>
          <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512' width='24' height='24'>
            <path
              d='M173.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3 .3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5 .3-6.2 2.3zm44.2-1.7c-2.9 .7-4.9 2.6-4.6 4.9 .3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM252.8 8c-138.7 0-244.8 105.3-244.8 244 0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1 100-33.2 167.8-128.1 167.8-239 0-138.7-112.5-244-251.2-244zM105.2 352.9c-1.3 1-1 3.3 .7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3 .3 2.9 2.3 3.9 1.6 1 3.6 .7 4.3-.7 .7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3 .7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3 .7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9s4.3 3.3 5.6 2.3c1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z'
              fill='currentColor'
            />
          </svg>
        </a>
      </p>
    </div>
  )
}
