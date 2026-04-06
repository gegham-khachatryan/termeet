import { spawn, type Subprocess } from "bun"
import { resolveFfmpegPath } from "../lib/media-binaries.ts"
import { FRAME_RATE } from "../protocol.ts"

export interface RawFrame {
  width: number
  height: number
  data: Buffer // Raw RGB24 pixels
}

export type FrameCallback = (frame: RawFrame) => void

/** macOS avfoundation only accepts sizes the camera advertises (see ffmpeg output "Supported modes"). */
const DARWIN_CAPTURE_WIDTH = 640
const DARWIN_CAPTURE_HEIGHT = 480
/** FFmpeg 8.x + many Mac cameras reject input -framerate 15 even when listed; 30 fps open is reliable. */
const DARWIN_INPUT_FPS = 30

export class CameraCapture {
  private process: Subprocess | null = null
  private running = false
  private readonly requestedWidth: number
  private readonly requestedHeight: number
  private captureWidth = 0
  private captureHeight = 0
  private onFrame: FrameCallback
  private frameSize = 0

  constructor(width: number, height: number, onFrame: FrameCallback) {
    this.requestedWidth = width
    this.requestedHeight = height
    this.onFrame = onFrame
  }

  async start(): Promise<void> {
    if (this.running) return

    const platform = process.platform
    let inputFormat: string
    let inputDevice: string

    let capW = this.requestedWidth
    let capH = this.requestedHeight
    let inputFps = FRAME_RATE

    if (platform === "darwin") {
      inputFormat = "avfoundation"
      // Video device 0, no audio — plain "0" often fails or hangs (audio + video)
      inputDevice = "0:none"
      capW = DARWIN_CAPTURE_WIDTH
      capH = DARWIN_CAPTURE_HEIGHT
      inputFps = DARWIN_INPUT_FPS
    } else if (platform === "linux") {
      inputFormat = "v4l2"
      inputDevice = "/dev/video0"
    } else {
      inputFormat = "dshow"
      inputDevice = "video=Integrated Camera"
    }

    this.captureWidth = capW
    this.captureHeight = capH
    this.frameSize = capW * capH * 3 // RGB24

    // macOS cameras expose uyvy422 / yuyv422 / nv12 — avoid ffmpeg defaulting to yuv420p (unsupported)
    const inputArgs: string[] = [
      "-f",
      inputFormat,
      "-framerate",
      String(inputFps),
      "-video_size",
      `${capW}x${capH}`,
    ]
    if (platform === "darwin") {
      inputArgs.push("-pixel_format", "uyvy422")
    }
    inputArgs.push("-i", inputDevice)

    const ffmpeg = resolveFfmpegPath()

    try {
      this.process = spawn({
        cmd: [
          ffmpeg,
          "-nostdin",
          ...inputArgs,
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgb24",
          "-r",
          String(FRAME_RATE),
          "-an",
          "pipe:1",
        ],
        stdout: "pipe",
        stderr: "ignore",
        stdin: "ignore",
      })
    } catch {
      // ffmpeg not in PATH or device missing — caller can fall back (e.g. test pattern)
      return
    }

    this.running = true
    this.readFrames()
  }

  private async readFrames() {
    if (!this.process?.stdout) return

    const stdout = this.process.stdout as ReadableStream<Uint8Array>
    const reader = stdout.getReader()
    let buffer = Buffer.alloc(0)

    try {
      while (this.running) {
        const { done, value } = await reader.read()
        if (done) break

        buffer = Buffer.concat([buffer, Buffer.from(value)])

        // Extract complete frames from buffer
        while (buffer.length >= this.frameSize) {
          const frameData = buffer.subarray(0, this.frameSize)
          buffer = buffer.subarray(this.frameSize)

          this.onFrame({
            width: this.captureWidth,
            height: this.captureHeight,
            data: Buffer.from(frameData),
          })
        }
      }
    } catch {
      // Camera disconnected or stopped
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

// Detect available cameras (macOS/Linux)
export async function listCameras(): Promise<string[]> {
  const ffmpeg = resolveFfmpegPath()

  try {
    const proc = spawn({
      cmd:
        process.platform === "darwin"
          ? [ffmpeg, "-f", "avfoundation", "-list_devices", "true", "-i", ""]
          : ["v4l2-ctl", "--list-devices"],
      stdout: "pipe",
      stderr: "pipe",
    })

    const stderr = await new Response(proc.stderr).text()
    const stdout = await new Response(proc.stdout).text()
    const output = stderr + stdout

    return output
      .split("\n")
      .filter((line) => line.includes("video") || line.includes("Camera") || line.includes("FaceTime"))
      .map((line) => line.trim())
  } catch {
    return ["Default Camera"]
  }
}
