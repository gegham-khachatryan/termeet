import { useCallback, useEffect, useRef } from "react"
import type { ClientMessage } from "../types"

const SAMPLE_RATE = 16000
const CHUNK_INTERVAL_MS = 100

/**
 * Web client audio hook — captures mic via Web Audio API,
 * sends raw PCM via onRawPcm callback (for WebRTC DataChannels),
 * and sends base64-encoded PCM via WebSocket (for CLI fallback).
 */
export function useAudio(
  active: boolean,
  micOn: boolean,
  send: (msg: ClientMessage) => void,
  onRawPcm?: (pcmData: ArrayBuffer) => void,
) {
  const ctxRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const playbackCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)
  const onRawPcmRef = useRef(onRawPcm)
  onRawPcmRef.current = onRawPcm
  const micOnRef = useRef(micOn)
  micOnRef.current = micOn

  // ── Capture: acquire mic once when active, keep alive across mute toggles ──
  useEffect(() => {
    if (!active) {
      workletNodeRef.current?.disconnect()
      workletNodeRef.current = null
      sourceRef.current?.disconnect()
      sourceRef.current = null
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (ctxRef.current) {
        ctxRef.current.close()
        ctxRef.current = null
      }
      return
    }

    let cancelled = false

    async function startCapture() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
        ctxRef.current = ctx

        const workletCode = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._samplesNeeded = ${Math.floor(SAMPLE_RATE * CHUNK_INTERVAL_MS / 1000)};
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const samples = input[0];
    for (let i = 0; i < samples.length; i++) {
      this._buffer.push(samples[i]);
    }
    while (this._buffer.length >= this._samplesNeeded) {
      const chunk = this._buffer.splice(0, this._samplesNeeded);
      const int16 = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      this.port.postMessage(int16.buffer, [int16.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
`
        const blob = new Blob([workletCode], { type: "application/javascript" })
        const url = URL.createObjectURL(blob)
        await ctx.audioWorklet.addModule(url)
        URL.revokeObjectURL(url)

        if (cancelled) {
          ctx.close()
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        const source = ctx.createMediaStreamSource(stream)
        sourceRef.current = source
        const workletNode = new AudioWorkletNode(ctx, "pcm-capture-processor")
        workletNodeRef.current = workletNode

        workletNode.port.onmessage = (e: MessageEvent) => {
          if (!micOnRef.current) return

          const buffer = e.data as ArrayBuffer

          // Send raw PCM to WebRTC DataChannels
          onRawPcmRef.current?.(buffer)

          // Send base64-encoded PCM via WebSocket (for CLI fallback)
          const bytes = new Uint8Array(buffer)
          let binary = ""
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i])
          }
          const base64 = btoa(binary)
          send({ type: "audio-data", data: base64, timestamp: Date.now() })
        }

        source.connect(workletNode)
        // Connect through a silent gain node to keep the graph alive
        // without playing captured audio back through the speakers
        const silentGain = ctx.createGain()
        silentGain.gain.value = 0
        workletNode.connect(silentGain)
        silentGain.connect(ctx.destination)
      } catch {
        // Mic unavailable or permission denied
      }
    }

    startCapture()

    return () => {
      cancelled = true
      workletNodeRef.current?.disconnect()
      workletNodeRef.current = null
      sourceRef.current?.disconnect()
      sourceRef.current = null
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (ctxRef.current) {
        ctxRef.current.close()
        ctxRef.current = null
      }
    }
  }, [active, send])

  // ── Mute/unmute: toggle track.enabled instead of destroying stream ──
  useEffect(() => {
    const stream = streamRef.current
    if (!stream) return
    stream.getAudioTracks().forEach((t) => {
      t.enabled = micOn
    })
  }, [micOn])

  // ── Playback: receive PCM s16le base64 → Web Audio API (for WebSocket fallback) ──
  useEffect(() => {
    if (!active) {
      if (playbackCtxRef.current) {
        playbackCtxRef.current.close()
        playbackCtxRef.current = null
      }
      nextPlayTimeRef.current = 0
      return
    }

    playbackCtxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE })
    nextPlayTimeRef.current = 0

    return () => {
      if (playbackCtxRef.current) {
        playbackCtxRef.current.close()
        playbackCtxRef.current = null
      }
      nextPlayTimeRef.current = 0
    }
  }, [active])

  /** Play base64-encoded PCM audio (WebSocket fallback path) */
  const playAudio = useCallback((data: string) => {
    const ctx = playbackCtxRef.current
    if (!ctx) return

    if (ctx.state === "suspended") {
      ctx.resume()
    }

    const binary = atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const int16 = new Int16Array(bytes.buffer)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 0x8000
    }

    const audioBuffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE)
    audioBuffer.copyToChannel(float32, 0)

    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)

    const now = ctx.currentTime
    const startTime = Math.max(now, nextPlayTimeRef.current)
    source.start(startTime)
    nextPlayTimeRef.current = startTime + audioBuffer.duration
  }, [])

  /** Play raw PCM ArrayBuffer (WebRTC DataChannel path) */
  const playRawAudio = useCallback((pcmData: ArrayBuffer) => {
    const ctx = playbackCtxRef.current
    if (!ctx) return

    if (ctx.state === "suspended") {
      ctx.resume()
    }

    const int16 = new Int16Array(pcmData)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 0x8000
    }

    const audioBuffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE)
    audioBuffer.copyToChannel(float32, 0)

    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)

    const now = ctx.currentTime
    const startTime = Math.max(now, nextPlayTimeRef.current)
    source.start(startTime)
    nextPlayTimeRef.current = startTime + audioBuffer.duration
  }, [])

  return { playAudio, playRawAudio }
}
