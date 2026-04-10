import { useCallback, useEffect, useRef, useState } from "react"
import type { ClientMessage, ServerMessage } from "../types"

const RTC_CONFIG: RTCConfiguration = {
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
}

interface UseWebRTCOptions {
  myId: string | null
  send: (msg: ClientMessage) => void
  onAudioData: (peerId: string, pcmData: ArrayBuffer) => void
  onVideoFrame: (peerId: string, width: number, height: number, rgbData: Uint8Array) => void
  onPeerConnected: (peerId: string) => void
  onPeerDisconnected: (peerId: string) => void
}

/**
 * WebRTC hook using DataChannels for audio/video.
 * Compatible with both web and CLI peers (same binary protocol).
 *
 * Audio channel: raw PCM s16le binary (ordered, reliable)
 * Video channel: 4-byte header (u16 width, u16 height) + raw RGB binary (unordered, fire-and-forget)
 */
export function useWebRTC({
  myId,
  send,
  onAudioData,
  onVideoFrame,
  onPeerConnected,
  onPeerDisconnected,
}: UseWebRTCOptions) {
  const peersRef = useRef<Map<string, PeerState>>(new Map())
  const sendRef = useRef(send)
  sendRef.current = send
  const onAudioDataRef = useRef(onAudioData)
  onAudioDataRef.current = onAudioData
  const onVideoFrameRef = useRef(onVideoFrame)
  onVideoFrameRef.current = onVideoFrame
  const onPeerConnectedRef = useRef(onPeerConnected)
  onPeerConnectedRef.current = onPeerConnected
  const onPeerDisconnectedRef = useRef(onPeerDisconnected)
  onPeerDisconnectedRef.current = onPeerDisconnected

  const [webrtcPeers, setWebrtcPeers] = useState<Set<string>>(new Set())

  function addConnectedPeer(peerId: string) {
    setWebrtcPeers((prev) => {
      if (prev.has(peerId)) return prev
      const next = new Set(prev)
      next.add(peerId)
      return next
    })
    onPeerConnectedRef.current(peerId)
  }

  function removeConnectedPeer(peerId: string) {
    setWebrtcPeers((prev) => {
      if (!prev.has(peerId)) return prev
      const next = new Set(prev)
      next.delete(peerId)
      return next
    })
    onPeerDisconnectedRef.current(peerId)
  }

  // ── DataChannel handlers ──

  function setupAudioChannel(peerId: string, channel: RTCDataChannel) {
    channel.binaryType = "arraybuffer"
    channel.onopen = () => addConnectedPeer(peerId)
    channel.onclose = () => removeConnectedPeer(peerId)
    channel.onmessage = (e) => {
      onAudioDataRef.current(peerId, e.data as ArrayBuffer)
    }
    // Channel may already be open (answerer receives it after negotiation)
    if (channel.readyState === "open") addConnectedPeer(peerId)
  }

  function setupVideoChannel(peerId: string, channel: RTCDataChannel) {
    channel.binaryType = "arraybuffer"
    channel.onmessage = (e) => {
      const buf = new DataView(e.data as ArrayBuffer)
      if (buf.byteLength < 4) return
      const width = buf.getUint16(0)
      const height = buf.getUint16(2)
      const rgbData = new Uint8Array(e.data as ArrayBuffer, 4)
      onVideoFrameRef.current(peerId, width, height, rgbData)
    }
  }

  // ── Peer connection ──

  function createPeerConnection(peerId: string, isOfferer: boolean): PeerState {
    const existing = peersRef.current.get(peerId)
    if (existing) {
      existing.pc.close()
      removeConnectedPeer(peerId)
    }

    const pc = new RTCPeerConnection(RTC_CONFIG)
    const peerState: PeerState = {
      pc,
      audioChannel: null,
      videoChannel: null,
      isOfferer,
    }
    peersRef.current.set(peerId, peerState)

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendRef.current({
          type: "webrtc-ice-candidate",
          targetId: peerId,
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid,
        })
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        removeConnectedPeer(peerId)
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed" && peerState.isOfferer) {
        pc.restartIce()
        pc.createOffer({ iceRestart: true }).then((offer) => {
          pc.setLocalDescription(offer).then(() => {
            if (pc.localDescription) {
              sendRef.current({
                type: "webrtc-offer",
                targetId: peerId,
                sdp: pc.localDescription.sdp,
              })
            }
          })
        })
      }
    }

    if (isOfferer) {
      // Offerer creates DataChannels
      const audioChannel = pc.createDataChannel("audio", { ordered: true })
      const videoChannel = pc.createDataChannel("video", { ordered: false, maxRetransmits: 0 })
      peerState.audioChannel = audioChannel
      peerState.videoChannel = videoChannel
      setupAudioChannel(peerId, audioChannel)
      setupVideoChannel(peerId, videoChannel)
    } else {
      // Answerer receives DataChannels
      pc.ondatachannel = (event) => {
        const channel = event.channel
        if (channel.label === "audio") {
          peerState.audioChannel = channel
          setupAudioChannel(peerId, channel)
        } else if (channel.label === "video") {
          peerState.videoChannel = channel
          setupVideoChannel(peerId, channel)
        }
      }
    }

    return peerState
  }

  // ── Public API ──

  /** Send raw PCM audio to a specific peer */
  const sendAudio = useCallback((peerId: string, pcmData: ArrayBuffer) => {
    const peer = peersRef.current.get(peerId)
    if (!peer?.audioChannel || peer.audioChannel.readyState !== "open") return
    if (peer.audioChannel.bufferedAmount > 64 * 1024) return
    try { peer.audioChannel.send(pcmData) } catch {}
  }, [])

  /** Send raw RGB video to a specific peer (adds 4-byte header). Drops frame if channel is congested. */
  const sendVideo = useCallback((peerId: string, width: number, height: number, rgbData: Uint8Array) => {
    const peer = peersRef.current.get(peerId)
    if (!peer?.videoChannel || peer.videoChannel.readyState !== "open") return
    // Drop frame if send buffer is backed up (> 128KB)
    if (peer.videoChannel.bufferedAmount > 128 * 1024) return
    try {
      const header = new ArrayBuffer(4)
      const view = new DataView(header)
      view.setUint16(0, width)
      view.setUint16(2, height)
      const packet = new Uint8Array(4 + rgbData.byteLength)
      packet.set(new Uint8Array(header), 0)
      packet.set(rgbData, 4)
      peer.videoChannel.send(packet.buffer)
    } catch {}
  }, [])

  const handlePeerJoined = useCallback(async (peerId: string) => {
    const peerState = createPeerConnection(peerId, true)
    try {
      const offer = await peerState.pc.createOffer()
      await peerState.pc.setLocalDescription(offer)
      if (peerState.pc.localDescription) {
        sendRef.current({
          type: "webrtc-offer",
          targetId: peerId,
          sdp: peerState.pc.localDescription.sdp,
        })
      }
    } catch {}
  }, [])

  const handlePeerLeft = useCallback((peerId: string) => {
    const peerState = peersRef.current.get(peerId)
    if (peerState) {
      peerState.pc.close()
      peersRef.current.delete(peerId)
      removeConnectedPeer(peerId)
    }
  }, [])

  const handleSignalingMessage = useCallback(async (msg: ServerMessage) => {
    if (msg.type === "webrtc-offer") {
      const peerState = createPeerConnection(msg.senderId, false)
      try {
        await peerState.pc.setRemoteDescription({ type: "offer", sdp: msg.sdp })
        const answer = await peerState.pc.createAnswer()
        await peerState.pc.setLocalDescription(answer)
        if (peerState.pc.localDescription) {
          sendRef.current({
            type: "webrtc-answer",
            targetId: msg.senderId,
            sdp: peerState.pc.localDescription.sdp,
          })
        }
      } catch {}
    } else if (msg.type === "webrtc-answer") {
      const peerState = peersRef.current.get(msg.senderId)
      if (!peerState) return
      try {
        await peerState.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp })
      } catch {}
    } else if (msg.type === "webrtc-ice-candidate") {
      const peerState = peersRef.current.get(msg.senderId)
      if (!peerState) return
      try {
        await peerState.pc.addIceCandidate({
          candidate: msg.candidate,
          sdpMLineIndex: msg.sdpMLineIndex,
          sdpMid: msg.sdpMid,
        })
      } catch {}
    }
  }, [])

  const cleanup = useCallback(() => {
    for (const [peerId, peerState] of peersRef.current) {
      peerState.pc.close()
      removeConnectedPeer(peerId)
    }
    peersRef.current.clear()
    setWebrtcPeers(new Set())
  }, [])

  useEffect(() => {
    return () => {
      for (const [, peerState] of peersRef.current) {
        peerState.pc.close()
      }
      peersRef.current.clear()
    }
  }, [])

  return {
    webrtcPeers,
    sendAudio,
    sendVideo,
    handlePeerJoined,
    handlePeerLeft,
    handleSignalingMessage,
    cleanup,
  }
}
