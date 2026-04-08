// ─── Termeet Protocol ───────────────────────────────────────────────────────
// Shared types and message definitions for client-server communication

export interface Participant {
  id: string
  name: string
  isMuted: boolean
  isCameraOn: boolean
  joinedAt: number
}

export interface Room {
  id: string
  name: string
  createdAt: number
  participants: Participant[]
}

export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  content: string
  timestamp: number
}

export interface AsciiFrame {
  senderId: string
  width: number
  height: number
  data: string // ASCII art string
  timestamp: number
}

// ─── Client → Server Messages ───────────────────────────────────────────────

export type ClientMessage =
  | { type: 'create-room'; name: string; userName: string }
  | { type: 'join-room'; roomId: string; userName: string }
  | { type: 'leave-room' }
  | { type: 'chat'; content: string }
  | { type: 'video-frame'; frame: AsciiFrame }
  | { type: 'audio-data'; data: string; timestamp: number } // base64 opus
  | { type: 'toggle-mute'; isMuted: boolean }
  | { type: 'toggle-camera'; isCameraOn: boolean }
  | { type: 'ping' }

// ─── Server → Client Messages ───────────────────────────────────────────────

export type ServerMessage =
  | { type: 'room-created'; room: Room; participantId: string }
  | { type: 'room-joined'; room: Room; participantId: string }
  | { type: 'room-not-found' }
  | { type: 'participant-joined'; participant: Participant }
  | { type: 'participant-left'; participantId: string }
  | { type: 'participant-updated'; participant: Participant }
  | { type: 'chat-message'; message: ChatMessage }
  | { type: 'video-frame'; frame: AsciiFrame }
  | { type: 'audio-data'; senderId: string; data: string; timestamp: number }
  | { type: 'error'; message: string }
  | { type: 'pong' }

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_SERVER_PORT = 3483
/** Public signaling URL (nginx → Bun); matches the web client. */
export const DEFAULT_CLI_WEBSOCKET_URL = 'wss://termeet.app/ws'
export const FRAME_RATE = 15 // Target FPS for ASCII video
export const AUDIO_SAMPLE_RATE = 16000
export const AUDIO_CHANNELS = 1

// ASCII character ramp from dark to light
export const ASCII_RAMP = ' .:-=+*#%@'
export const ASCII_RAMP_DETAILED = ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'

// Unicode block/shade ramp for deeper, richer visualization
// export const ASCII_RAMP_BLOCKS = ' ·∙:░▒▓█'
export const ASCII_RAMP_BLOCKS = '▓▓▓▓████'
