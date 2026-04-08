// ─── Shared types mirrored from protocol.ts for the web client ──────────────

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
  data: string
  timestamp: number
}

/** One horizontal run of same RGB (matches CLI StyledText chunks). */
export interface AsciiColorRun {
  text: string
  rgb: [number, number, number]
}

export type AsciiColoredLines = AsciiColorRun[][]

/** Local / remote video tile content */
export type AsciiVideoDisplay =
  | { type: "colored"; lines: AsciiColoredLines }
  | { type: "plain"; text: string; dim?: boolean }

// Client → Server
export type ClientMessage =
  | { type: "create-room"; name: string; userName: string }
  | { type: "join-room"; roomId: string; userName: string }
  | { type: "leave-room" }
  | { type: "chat"; content: string }
  | { type: "video-frame"; frame: AsciiFrame }
  | { type: "toggle-mute"; isMuted: boolean }
  | { type: "toggle-camera"; isCameraOn: boolean }
  | { type: "ping" }

// Server → Client
export type ServerMessage =
  | { type: "room-created"; room: Room; participantId: string }
  | { type: "room-joined"; room: Room; participantId: string }
  | { type: "room-not-found" }
  | { type: "participant-joined"; participant: Participant }
  | { type: "participant-left"; participantId: string }
  | { type: "participant-updated"; participant: Participant }
  | { type: "chat-message"; message: ChatMessage }
  | { type: "video-frame"; frame: AsciiFrame }
  | { type: "audio-data"; senderId: string; data: string; timestamp: number }
  | { type: "error"; message: string }
  | { type: "pong" }
