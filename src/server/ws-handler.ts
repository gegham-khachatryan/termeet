import type { ServerWebSocket } from "bun"
import type { ClientMessage, ServerMessage } from "../protocol.ts"
import { RoomManager } from "./room-manager.ts"

interface ClientState {
  participantId: string | null
  roomId: string | null
}

const roomManager = new RoomManager()
const clients = new Map<ServerWebSocket<ClientState>, ClientState>()

function broadcast(roomId: string, message: ServerMessage, excludeWs?: ServerWebSocket<ClientState>) {
  const room = roomManager.getRoom(roomId)
  if (!room) return

  const payload = JSON.stringify(message)
  for (const [ws, state] of clients) {
    if (state.roomId === roomId && ws !== excludeWs && ws.readyState === 1) {
      ws.send(payload)
    }
  }
}

function sendToParticipant(roomId: string, participantId: string, message: ServerMessage) {
  const payload = JSON.stringify(message)
  for (const [ws, state] of clients) {
    if (state.roomId === roomId && state.participantId === participantId && ws.readyState === 1) {
      ws.send(payload)
      return
    }
  }
}

function send(ws: ServerWebSocket<ClientState>, message: ServerMessage) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message))
  }
}

export function handleOpen(ws: ServerWebSocket<ClientState>) {
  const state: ClientState = { participantId: null, roomId: null }
  clients.set(ws, state)
  ws.data = state
}

export function handleMessage(ws: ServerWebSocket<ClientState>, raw: string | Buffer) {
  const state = clients.get(ws)
  if (!state) return

  let msg: ClientMessage
  try {
    msg = JSON.parse(typeof raw === "string" ? raw : raw.toString())
  } catch {
    send(ws, { type: "error", message: "Invalid JSON" })
    return
  }

  switch (msg.type) {
    case "create-room": {
      const room = roomManager.createRoom(msg.name)
      const participant = roomManager.addParticipant(room.id, msg.userName)
      if (!participant) {
        send(ws, { type: "error", message: "Failed to create room" })
        return
      }
      state.participantId = participant.id
      state.roomId = room.id
      ws.data = state
      send(ws, {
        type: "room-created",
        room: roomManager.getRoom(room.id)!,
        participantId: participant.id,
      })
      break
    }

    case "join-room": {
      const room = roomManager.getRoom(msg.roomId)
      if (!room) {
        send(ws, { type: "room-not-found" })
        return
      }
      const participant = roomManager.addParticipant(msg.roomId, msg.userName)
      if (!participant) {
        send(ws, { type: "error", message: "Failed to join room" })
        return
      }
      state.participantId = participant.id
      state.roomId = msg.roomId
      ws.data = state

      // Notify existing participants
      broadcast(msg.roomId, { type: "participant-joined", participant }, ws)

      // Send full room state to the joiner
      send(ws, {
        type: "room-joined",
        room: roomManager.getRoom(msg.roomId)!,
        participantId: participant.id,
      })
      break
    }

    case "leave-room": {
      handleLeave(ws, state)
      break
    }

    case "chat": {
      if (!state.roomId || !state.participantId) return
      const room = roomManager.getRoomForParticipant(state.participantId)
      if (!room) return
      const sender = room.participants.find((p) => p.id === state.participantId)
      if (!sender) return

      broadcast(state.roomId, {
        type: "chat-message",
        message: {
          id: crypto.randomUUID(),
          senderId: state.participantId,
          senderName: sender.name,
          content: msg.content,
          timestamp: Date.now(),
        },
      })
      break
    }

    case "video-frame": {
      if (!state.roomId) return
      broadcast(state.roomId, { type: "video-frame", frame: msg.frame }, ws)
      break
    }

    case "audio-data": {
      if (!state.roomId || !state.participantId) return
      broadcast(
        state.roomId,
        {
          type: "audio-data",
          senderId: state.participantId,
          data: msg.data,
          timestamp: msg.timestamp,
        },
        ws,
      )
      break
    }

    case "toggle-mute": {
      if (!state.participantId || !state.roomId) return
      const updated = roomManager.updateParticipant(state.participantId, { isMuted: msg.isMuted })
      if (updated) {
        broadcast(state.roomId, { type: "participant-updated", participant: updated })
      }
      break
    }

    case "toggle-camera": {
      if (!state.participantId || !state.roomId) return
      const updated = roomManager.updateParticipant(state.participantId, { isCameraOn: msg.isCameraOn })
      if (updated) {
        broadcast(state.roomId, { type: "participant-updated", participant: updated })
      }
      break
    }

    case "webrtc-offer": {
      if (!state.roomId || !state.participantId) return
      sendToParticipant(state.roomId, msg.targetId, {
        type: "webrtc-offer",
        senderId: state.participantId,
        sdp: msg.sdp,
      })
      break
    }

    case "webrtc-answer": {
      if (!state.roomId || !state.participantId) return
      sendToParticipant(state.roomId, msg.targetId, {
        type: "webrtc-answer",
        senderId: state.participantId,
        sdp: msg.sdp,
      })
      break
    }

    case "webrtc-ice-candidate": {
      if (!state.roomId || !state.participantId) return
      sendToParticipant(state.roomId, msg.targetId, {
        type: "webrtc-ice-candidate",
        senderId: state.participantId,
        candidate: msg.candidate,
        sdpMLineIndex: msg.sdpMLineIndex,
        sdpMid: msg.sdpMid,
      })
      break
    }

    case "ping": {
      send(ws, { type: "pong" })
      break
    }
  }
}

function handleLeave(ws: ServerWebSocket<ClientState>, state: ClientState) {
  if (state.participantId) {
    const result = roomManager.removeParticipant(state.participantId)
    if (result && state.roomId) {
      broadcast(state.roomId, { type: "participant-left", participantId: state.participantId })
    }
  }
  state.participantId = null
  state.roomId = null
  ws.data = state
}

export function handleClose(ws: ServerWebSocket<ClientState>) {
  const state = clients.get(ws)
  if (state) {
    handleLeave(ws, state)
    clients.delete(ws)
  }
}
