import { RTCPeerConnection, type RTCDataChannel } from "werift"
import type { ClientMessage, ServerMessage } from "../protocol.ts"

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
}

interface PeerState {
  pc: RTCPeerConnection
  audioChannel: RTCDataChannel | null
  videoChannel: RTCDataChannel | null
  isOfferer: boolean
  connected: boolean
}

export interface WebRTCManagerEvents {
  onAudioData: (senderId: string, pcmData: Buffer) => void
  onVideoFrame: (senderId: string, width: number, height: number, rgbData: Buffer) => void
  onPeersChanged?: (connectedPeers: Set<string>) => void
}

/**
 * Manages WebRTC peer connections for CLI clients using DataChannels.
 * Audio and video data flow as binary over DataChannels (same format as WebSocket).
 */
export class WebRTCManager {
  private peers = new Map<string, PeerState>()
  private sendSignaling: (msg: ClientMessage) => void
  private events: WebRTCManagerEvents

  constructor(sendSignaling: (msg: ClientMessage) => void, events: WebRTCManagerEvents) {
    this.sendSignaling = sendSignaling
    this.events = events
  }

  /** Set of peer IDs with active WebRTC DataChannel connections (audio channel must be open) */
  get connectedPeers(): Set<string> {
    const set = new Set<string>()
    for (const [id, state] of this.peers) {
      if (state.connected && state.audioChannel?.readyState === "open") set.add(id)
    }
    return set
  }

  /** Check if a specific peer has an active WebRTC connection with open audio channel */
  isConnected(peerId: string): boolean {
    const peer = this.peers.get(peerId)
    return (peer?.connected && peer.audioChannel?.readyState === "open") ?? false
  }

  /** Send raw PCM audio buffer to a specific peer via DataChannel (binary, no base64) */
  sendAudio(peerId: string, pcmData: Buffer): boolean {
    const peer = this.peers.get(peerId)
    if (!peer?.audioChannel || peer.audioChannel.readyState !== "open") return false
    try {
      peer.audioChannel.send(pcmData)
      return true
    } catch {
      return false
    }
  }

  /** Send raw RGB video frame to a specific peer via DataChannel (binary with 4-byte header: u16 width, u16 height). Drops frame if channel is congested. */
  sendVideo(peerId: string, width: number, height: number, rgbData: Buffer): boolean {
    const peer = this.peers.get(peerId)
    if (!peer?.videoChannel || peer.videoChannel.readyState !== "open") return false
    // Drop frame if send buffer is backed up (> 128KB)
    if ((peer.videoChannel as any).bufferedAmount > 128 * 1024) return false
    try {
      // 4-byte header: width(u16) + height(u16), then raw RGB bytes
      const header = Buffer.alloc(4)
      header.writeUInt16BE(width, 0)
      header.writeUInt16BE(height, 2)
      const packet = Buffer.concat([header, rgbData])
      peer.videoChannel.send(packet)
      return true
    } catch {
      return false
    }
  }

  // ── Peer connection lifecycle ──

  /** Called when a new participant joins — existing participant creates offer */
  async handlePeerJoined(peerId: string): Promise<void> {
    const peerState = this.createPeerConnection(peerId, true)
    // DataChannels must be created before the offer (offerer creates them)
    this.setupDataChannels(peerId, peerState)
    try {
      const offer = await peerState.pc.createOffer()
      await peerState.pc.setLocalDescription(offer)
      if (peerState.pc.localDescription) {
        this.sendSignaling({
          type: "webrtc-offer",
          targetId: peerId,
          sdp: peerState.pc.localDescription.sdp,
        })
      }
    } catch {
      // Offer creation failed
    }
  }

  /** Called when a participant leaves */
  handlePeerLeft(peerId: string): void {
    const peerState = this.peers.get(peerId)
    if (peerState) {
      const wasConnected = peerState.connected
      peerState.pc.close()
      this.peers.delete(peerId)
      if (wasConnected) {
        this.events.onPeersChanged?.(this.connectedPeers)
      }
    }
  }

  /** Handle incoming WebRTC signaling messages */
  async handleSignalingMessage(msg: ServerMessage): Promise<void> {
    if (msg.type === "webrtc-offer") {
      // We received an offer — create answerer peer connection
      const peerState = this.createPeerConnection(msg.senderId, false)
      try {
        await peerState.pc.setRemoteDescription({ type: "offer", sdp: msg.sdp } as any)
        const answer = await peerState.pc.createAnswer()
        await peerState.pc.setLocalDescription(answer)
        if (peerState.pc.localDescription) {
          this.sendSignaling({
            type: "webrtc-answer",
            targetId: msg.senderId,
            sdp: peerState.pc.localDescription.sdp,
          })
        }
      } catch {
        // Answer creation failed
      }
    } else if (msg.type === "webrtc-answer") {
      const peerState = this.peers.get(msg.senderId)
      if (!peerState) return
      try {
        await peerState.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp } as any)
      } catch {
        // setRemoteDescription failed
      }
    } else if (msg.type === "webrtc-ice-candidate") {
      const peerState = this.peers.get(msg.senderId)
      if (!peerState) return
      try {
        await peerState.pc.addIceCandidate({
          candidate: msg.candidate,
          sdpMLineIndex: msg.sdpMLineIndex ?? undefined,
          sdpMid: msg.sdpMid ?? undefined,
        } as any)
      } catch {
        // addIceCandidate failed
      }
    }
  }

  /** Tear down all connections */
  cleanup(): void {
    const hadPeers = this.peers.size > 0
    for (const [, peerState] of this.peers) {
      peerState.pc.close()
    }
    this.peers.clear()
    if (hadPeers) {
      this.events.onPeersChanged?.(new Set())
    }
  }

  // ── Internal ──

  private createPeerConnection(peerId: string, isOfferer: boolean): PeerState {
    // Close existing connection if any
    const existing = this.peers.get(peerId)
    if (existing) {
      existing.pc.close()
    }

    const pc = new RTCPeerConnection(RTC_CONFIG as any)
    const peerState: PeerState = {
      pc,
      audioChannel: null,
      videoChannel: null,
      isOfferer,
      connected: false,
    }
    this.peers.set(peerId, peerState)

    // Send ICE candidates
    pc.onIceCandidate.subscribe((candidate) => {
      if (!candidate) return
      this.sendSignaling({
        type: "webrtc-ice-candidate",
        targetId: peerId,
        candidate: candidate.candidate ?? "",
        sdpMLineIndex: candidate.sdpMLineIndex ?? null,
        sdpMid: candidate.sdpMid ?? null,
      })
    })

    // Track connection state
    pc.iceConnectionStateChange.subscribe((state) => {
      const wasBefore = peerState.connected
      if (state === "connected" || state === "completed") {
        peerState.connected = true
      } else if (state === "failed" || state === "closed" || state === "disconnected") {
        peerState.connected = false
      }
      if (peerState.connected !== wasBefore) {
        this.events.onPeersChanged?.(this.connectedPeers)
      }
    })

    // Handle incoming DataChannels (answerer receives them)
    if (!isOfferer) {
      pc.onDataChannel.subscribe((channel) => {
        if (channel.label === "audio") {
          peerState.audioChannel = channel
          this.setupAudioChannelHandlers(peerId, channel)
        } else if (channel.label === "video") {
          peerState.videoChannel = channel
          this.setupVideoChannelHandlers(peerId, channel)
        }
      })
    }

    return peerState
  }

  private setupDataChannels(peerId: string, peerState: PeerState): void {
    const audioChannel = peerState.pc.createDataChannel("audio", { ordered: true })
    const videoChannel = peerState.pc.createDataChannel("video", { ordered: false, maxRetransmits: 0 })

    peerState.audioChannel = audioChannel
    peerState.videoChannel = videoChannel

    this.setupAudioChannelHandlers(peerId, audioChannel)
    this.setupVideoChannelHandlers(peerId, videoChannel)
  }

  private setupAudioChannelHandlers(peerId: string, channel: RTCDataChannel): void {
    channel.stateChanged.subscribe((state) => {
      if (state === "open" || state === "closed") {
        this.events.onPeersChanged?.(this.connectedPeers)
      }
    })
    channel.onMessage.subscribe((raw) => {
      try {
        const buf = typeof raw === "string" ? Buffer.from(raw, "binary") : Buffer.from(raw)
        this.events.onAudioData(peerId, buf)
      } catch {
        // Invalid data
      }
    })
    // Channel may already be open (answerer receives it after negotiation)
    if (channel.readyState === "open") {
      this.events.onPeersChanged?.(this.connectedPeers)
    }
  }

  private setupVideoChannelHandlers(peerId: string, channel: RTCDataChannel): void {
    channel.onMessage.subscribe((raw) => {
      try {
        const buf = typeof raw === "string" ? Buffer.from(raw, "binary") : Buffer.from(raw)
        if (buf.length < 4) return
        const width = buf.readUInt16BE(0)
        const height = buf.readUInt16BE(2)
        const rgbData = buf.subarray(4)
        this.events.onVideoFrame(peerId, width, height, rgbData)
      } catch {
        // Invalid data
      }
    })
  }
}
