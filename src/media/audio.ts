import { spawn, type Subprocess } from "bun"
import { resolveFfmpegPath, resolveFfplayPath } from "../lib/media-binaries.ts"
import { AUDIO_SAMPLE_RATE, AUDIO_CHANNELS } from "../protocol.ts"

export type AudioDataCallback = (data: Buffer) => void

export class AudioCapture {
  private process: Subprocess | null = null
  private running = false
  private onData: AudioDataCallback

  constructor(onData: AudioDataCallback) {
    this.onData = onData
  }

  async start(): Promise<void> {
    if (this.running) return

    const platform = process.platform
    let inputFormat: string
    let inputDevice: string

    if (platform === "darwin") {
      inputFormat = "avfoundation"
      // ":0" is often a virtual device (e.g. ZoomAudioDevice). Use default mic instead.
      inputDevice = process.env["AUDIO_INPUT_DEVICE"] ?? ":default"
    } else if (platform === "linux") {
      inputFormat = "pulse"
      inputDevice = "default"
    } else {
      inputFormat = "dshow"
      inputDevice = "audio=Microphone"
    }

    const ffmpeg = resolveFfmpegPath()

    try {
      this.process = spawn({
        cmd: [
          ffmpeg,
          "-f", inputFormat,
          "-i", inputDevice,
          "-f", "s16le", // Raw PCM 16-bit little-endian
          "-ar", String(AUDIO_SAMPLE_RATE),
          "-ac", String(AUDIO_CHANNELS),
          "-v", "quiet",
          "pipe:1",
        ],
        stdout: "pipe",
        stderr: "ignore",
      })
    } catch {
      // ffmpeg not in PATH or spawn failed — meeting continues without mic capture
      return
    }

    this.running = true
    // Monitor subprocess exit
    this.process.exited.then(() => {
      if (this.running) {
        this.running = false
        this.process = null
      }
    })
    this.readAudio()
  }

  private async readAudio() {
    if (!this.process?.stdout) return

    const stdout = this.process.stdout as ReadableStream<Uint8Array>
    const reader = stdout.getReader()
    const chunkSize = AUDIO_SAMPLE_RATE * 2 * AUDIO_CHANNELS / 10 // 100ms chunks

    let buffer = Buffer.alloc(0)

    try {
      while (this.running) {
        const { done, value } = await reader.read()
        if (done) break

        buffer = Buffer.concat([buffer, Buffer.from(value)])

        while (buffer.length >= chunkSize) {
          const chunk = buffer.subarray(0, chunkSize)
          buffer = buffer.subarray(chunkSize)
          this.onData(Buffer.from(chunk))
        }
      }
    } catch {
      // Microphone disconnected
    }
  }

  stop() {
    this.running = false
    this.process?.kill()
    this.process = null
  }

  isRunning(): boolean {
    return this.running
  }
}

export class AudioPlayback {
  private process: Subprocess | null = null
  private running = false

  async start(): Promise<void> {
    if (this.running) return

    const ffplay = resolveFfplayPath()

    try {
      this.process = spawn({
        cmd: [
          ffplay,
          "-f", "s16le",
          "-ar", String(AUDIO_SAMPLE_RATE),
          "-ac", String(AUDIO_CHANNELS),
          "-nodisp",
          "-v", "quiet",
          "-infbuf",
          "-i", "pipe:0",
        ],
        stdin: "pipe",
        stdout: "ignore",
        stderr: "ignore",
      })
    } catch {
      // ffplay not in PATH — no local speaker output for remote audio
      return
    }

    this.running = true
    // Monitor subprocess — mark stopped if ffplay exits unexpectedly
    this.process.exited.then(() => {
      if (this.running) {
        this.running = false
        this.process = null
      }
    })
  }

  write(data: Buffer) {
    if (!this.running || !this.process?.stdin) return
    try {
      const stdin = this.process.stdin as { write(data: Buffer): void }
      stdin.write(data)
    } catch {
      this.running = false
      this.process = null
    }
  }

  stop() {
    this.running = false
    try {
      const stdin = this.process?.stdin as { end?(): void } | undefined
      stdin?.end?.()
    } catch {}
    this.process?.kill()
    this.process = null
  }

  isRunning(): boolean {
    return this.running
  }
}
