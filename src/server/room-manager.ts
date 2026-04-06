import { nanoid } from "nanoid"
import type { Room, Participant, ChatMessage } from "../protocol.ts"

export class RoomManager {
  private rooms = new Map<string, Room>()
  private participantRooms = new Map<string, string>() // participantId -> roomId

  createRoom(name: string): Room {
    const room: Room = {
      id: nanoid(8),
      name,
      createdAt: Date.now(),
      participants: [],
    }
    this.rooms.set(room.id, room)
    return room
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId)
  }

  addParticipant(roomId: string, userName: string): Participant | null {
    const room = this.rooms.get(roomId)
    if (!room) return null

    const participant: Participant = {
      id: nanoid(12),
      name: userName,
      isMuted: false,
      isCameraOn: true,
      joinedAt: Date.now(),
    }

    room.participants.push(participant)
    this.participantRooms.set(participant.id, roomId)
    return participant
  }

  removeParticipant(participantId: string): { room: Room; participant: Participant } | null {
    const roomId = this.participantRooms.get(participantId)
    if (!roomId) return null

    const room = this.rooms.get(roomId)
    if (!room) return null

    const idx = room.participants.findIndex((p) => p.id === participantId)
    if (idx === -1) return null

    const [participant] = room.participants.splice(idx, 1)
    this.participantRooms.delete(participantId)

    // Clean up empty rooms
    if (room.participants.length === 0) {
      this.rooms.delete(roomId)
    }

    return { room, participant: participant! }
  }

  updateParticipant(participantId: string, update: Partial<Pick<Participant, "isMuted" | "isCameraOn">>): Participant | null {
    const roomId = this.participantRooms.get(participantId)
    if (!roomId) return null

    const room = this.rooms.get(roomId)
    if (!room) return null

    const participant = room.participants.find((p) => p.id === participantId)
    if (!participant) return null

    Object.assign(participant, update)
    return participant
  }

  getRoomForParticipant(participantId: string): Room | undefined {
    const roomId = this.participantRooms.get(participantId)
    if (!roomId) return undefined
    return this.rooms.get(roomId)
  }

  getRoomParticipants(roomId: string): Participant[] {
    return this.rooms.get(roomId)?.participants ?? []
  }
}
