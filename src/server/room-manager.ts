import { nanoid } from 'nanoid'
import type { Room, Participant } from '../protocol.ts'

/** Keep empty rooms alive this long so a lone user can reload or re-open a shared link. */
const EMPTY_ROOM_GRACE_MS = 30 * 1000

export class RoomManager {
  private rooms = new Map<string, Room>()
  private participantRooms = new Map<string, string>() // participantId -> roomId
  private emptyRoomTimers = new Map<string, ReturnType<typeof setTimeout>>()

  createRoom(name: string): Room {
    const room: Room = {
      id: nanoid(8),
      name,
      createdAt: Date.now(),
      participants: []
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

    this.cancelEmptyRoomDeletion(roomId)

    const participant: Participant = {
      id: nanoid(12),
      name: userName,
      isMuted: false,
      isCameraOn: true,
      joinedAt: Date.now()
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

    if (room.participants.length === 0) {
      this.scheduleEmptyRoomDeletion(roomId)
    }

    return { room, participant: participant! }
  }

  private cancelEmptyRoomDeletion(roomId: string) {
    const t = this.emptyRoomTimers.get(roomId)
    if (t !== undefined) {
      clearTimeout(t)
      this.emptyRoomTimers.delete(roomId)
    }
  }

  private scheduleEmptyRoomDeletion(roomId: string) {
    this.cancelEmptyRoomDeletion(roomId)
    const timer = setTimeout(() => {
      this.emptyRoomTimers.delete(roomId)
      const r = this.rooms.get(roomId)
      if (r && r.participants.length === 0) {
        this.rooms.delete(roomId)
      }
    }, EMPTY_ROOM_GRACE_MS)
    this.emptyRoomTimers.set(roomId, timer)
  }

  updateParticipant(
    participantId: string,
    update: Partial<Pick<Participant, 'isMuted' | 'isCameraOn'>>
  ): Participant | null {
    const roomId = this.participantRooms.get(participantId)
    if (!roomId) return null

    const room = this.rooms.get(roomId)
    if (!room) return null

    const participant = room.participants.find((p) => p.id === participantId)
    if (!participant) return null

    Object.assign(participant, update)
    return participant
  }

  getParticipant(participantId: string): Participant | undefined {
    const roomId = this.participantRooms.get(participantId)
    if (!roomId) return undefined
    const room = this.rooms.get(roomId)
    return room?.participants.find((p) => p.id === participantId)
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
