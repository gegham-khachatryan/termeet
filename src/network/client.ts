import type { ClientMessage, ServerMessage, Room, Participant, ChatMessage, AsciiFrame } from '../protocol.ts'
import { DEFAULT_CLI_WEBSOCKET_URL } from '../protocol.ts'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected'

export interface TermeetClientEvents {
  onConnectionChange: (state: ConnectionState) => void
  onRoomCreated: (room: Room, participantId: string) => void
  onRoomJoined: (room: Room, participantId: string) => void
  onRoomNotFound: () => void
  onParticipantJoined: (participant: Participant) => void
  onParticipantLeft: (participantId: string) => void
  onParticipantUpdated: (participant: Participant) => void
  onChatMessage: (message: ChatMessage) => void
  onVideoFrame: (frame: AsciiFrame) => void
  onAudioData: (senderId: string, data: string, timestamp: number) => void
  onWebRTCSignaling: (msg: ServerMessage) => void
  onError: (message: string) => void
}

export class TermeetClient {
  private ws: WebSocket | null = null
  private events: TermeetClientEvents
  private wsUrl: string
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _state: ConnectionState = 'disconnected'

  constructor(events: TermeetClientEvents, wsUrl?: string) {
    this.events = events
    this.wsUrl = wsUrl ?? DEFAULT_CLI_WEBSOCKET_URL
  }

  get state(): ConnectionState {
    return this._state
  }

  connect(): void {
    if (this.ws) return

    this._state = 'connecting'
    this.events.onConnectionChange('connecting')

    this.ws = new WebSocket(this.wsUrl)

    this.ws.onopen = () => {
      this._state = 'connected'
      this.events.onConnectionChange('connected')
    }

    this.ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data as string)
        this.handleMessage(msg)
      } catch {
        // Invalid message
      }
    }

    this.ws.onclose = () => {
      this.ws = null
      this._state = 'disconnected'
      this.events.onConnectionChange('disconnected')

      // Auto-reconnect after 2s
      this.reconnectTimer = setTimeout(() => this.connect(), 2000)
    }

    this.ws.onerror = () => {
      // Error will trigger onclose
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const ws = this.ws
    this.ws = null
    this._state = 'disconnected'
    this.events.onConnectionChange('disconnected')
    if (ws) {
      // Prevent onclose from scheduling reconnect (keeps process alive after quit)
      ws.onclose = () => {}
      ws.onerror = () => {}
      ws.close()
    }
  }

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private ensureConnectedForLobbyAction(): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) return true
    this.events.onError(
      'Not connected to server. Wait for ● Connected, or set TERMEET_WS_URL (or TERMEET_HOST / TERMEET_PORT for local ws://).'
    )
    return false
  }

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'room-created':
        this.events.onRoomCreated(msg.room, msg.participantId)
        break
      case 'room-joined':
        this.events.onRoomJoined(msg.room, msg.participantId)
        break
      case 'room-not-found':
        this.events.onRoomNotFound()
        break
      case 'participant-joined':
        this.events.onParticipantJoined(msg.participant)
        break
      case 'participant-left':
        this.events.onParticipantLeft(msg.participantId)
        break
      case 'participant-updated':
        this.events.onParticipantUpdated(msg.participant)
        break
      case 'chat-message':
        this.events.onChatMessage(msg.message)
        break
      case 'video-frame':
        this.events.onVideoFrame(msg.frame)
        break
      case 'audio-data':
        this.events.onAudioData(msg.senderId, msg.data, msg.timestamp)
        break
      case 'webrtc-offer':
      case 'webrtc-answer':
      case 'webrtc-ice-candidate':
        this.events.onWebRTCSignaling(msg)
        break
      case 'error':
        this.events.onError(msg.message)
        break
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────

  createRoom(name: string, userName: string): void {
    if (!this.ensureConnectedForLobbyAction()) return
    this.send({ type: 'create-room', name, userName })
  }

  joinRoom(roomId: string, userName: string): void {
    if (!this.ensureConnectedForLobbyAction()) return
    this.send({ type: 'join-room', roomId, userName })
  }

  leaveRoom(): void {
    this.send({ type: 'leave-room' })
  }

  sendChat(content: string): void {
    this.send({ type: 'chat', content })
  }

  sendVideoFrame(frame: AsciiFrame): void {
    this.send({ type: 'video-frame', frame })
  }

  sendAudioData(data: string, timestamp: number): void {
    this.send({ type: 'audio-data', data, timestamp })
  }

  toggleMute(isMuted: boolean): void {
    this.send({ type: 'toggle-mute', isMuted })
  }

  toggleCamera(isCameraOn: boolean): void {
    this.send({ type: 'toggle-camera', isCameraOn })
  }

  sendWebRTCSignaling(msg: ClientMessage): void {
    this.send(msg)
  }
}
