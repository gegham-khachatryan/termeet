import { useCallback, useEffect, useRef } from "react"
import type { ClientMessage } from "../types"

const SAMPLE_RATE = 16000
const CHUNK_INTERVAL_MS = 100

/**
 * Web client audio hook — captures mic via Web Audio API,
 * encodes PCM s16le chunks, and plays back received audio.
 */
export function useAudio(
  active: boolean,
  micOn: boolean,
  send: (msg: ClientMessage) => void,
) {
  const ctxRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const playbackCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)

  // ── Capture: mic → PCM s16le → base64 → WebSocket ──────────────
  useEffect(() => {
    if (!active || !micOn) {
      // Stop capture when inactive or muted
      workletNodeRef.current?.disconnect()
      workletNodeRef.current = null
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

        // Register a simple processor worklet inline via Blob
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
        const workletNode = new AudioWorkletNode(ctx, "pcm-capture-processor")
        workletNodeRef.current = workletNode

        workletNode.port.onmessage = (e: MessageEvent) => {
          const buffer = e.data as ArrayBuffer
          const bytes = new Uint8Array(buffer)
          // Convert to base64
          let binary = ""
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i])
          }
          const base64 = btoa(binary)
          send({ type: "audio-data", data: base64, timestamp: Date.now() })
        }

        source.connect(workletNode)
        workletNode.connect(ctx.destination) // needed to keep the graph alive
      } catch {
        // Mic unavailable or permission denied
      }
    }

    startCapture()

    return () => {
      cancelled = true
      workletNodeRef.current?.disconnect()
      workletNodeRef.current = null
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (ctxRef.current) {
        ctxRef.current.close()
        ctxRef.current = null
      }
    }
  }, [active, micOn, send])

  // ── Playback: receive PCM s16le base64 → Web Audio API ──────────
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

  const playAudio = useCallback((data: string) => {
    const ctx = playbackCtxRef.current
    if (!ctx) return

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === "suspended") {
      ctx.resume()
    }

    // Decode base64 → Int16 → Float32
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

    // Schedule chunks sequentially to avoid gaps/overlaps
    const now = ctx.currentTime
    const startTime = Math.max(now, nextPlayTimeRef.current)
    source.start(startTime)
    nextPlayTimeRef.current = startTime + audioBuffer.duration
  }, [])

  return { playAudio }
}
