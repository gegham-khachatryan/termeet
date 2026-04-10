#!/usr/bin/env bun
/**
 * Audio troubleshoot test — records from mic for a few seconds, then replays.
 * Run: bun run src/test-audio.ts
 */
import { AudioCapture, AudioPlayback } from "./media/audio.ts"
import { resolveFfmpegPath, resolveFfplayPath } from "./lib/media-binaries.ts"
import { AUDIO_SAMPLE_RATE, AUDIO_CHANNELS } from "./protocol.ts"
import { tmpdir } from "node:os"
import { join } from "node:path"

const RECORD_SECONDS = 4
const SILENCE_THRESHOLD = 150 // ~0.45% of int16 full scale

function maxAmplitude(buffers: Buffer[]): number {
  let max = 0
  for (const chunk of buffers) {
    for (let i = 0; i + 1 < chunk.length; i += 2) {
      const sample = chunk.readInt16LE(i)
      const amp = Math.abs(sample)
      if (amp > max) max = amp
    }
  }
  return max
}

function printMacAudioDiagnostics() {
  if (process.platform !== "darwin") return
  try {
    const volume = Bun.spawnSync({
      cmd: ["osascript", "-e", "get volume settings"],
      stdout: "pipe",
      stderr: "ignore",
    })
    const volumeText = volume.stdout.toString().trim()
    if (volumeText) {
      console.log(`macOS volume: ${volumeText}`)
    }
  } catch {
    // Ignore optional diagnostics failures.
  }

  try {
    const profiler = Bun.spawnSync({
      cmd: ["system_profiler", "SPAudioDataType"],
      stdout: "pipe",
      stderr: "ignore",
    })
    const lines = profiler.stdout.toString().split("\n")
    const outLine = lines.find((l) => l.includes("Default Output Device: Yes"))
    if (outLine) {
      // Device name is the nearest previous non-empty section line ending with ":".
      for (let i = lines.indexOf(outLine); i >= 0; i--) {
        const rawLine = lines[i]
        if (!rawLine) continue
        const line = rawLine.trim()
        if (line && line.endsWith(":") && !line.startsWith("Default")) {
          console.log(`macOS default output: ${line.slice(0, -1)}`)
          break
        }
      }
    }
  } catch {
    // Ignore optional diagnostics failures.
  }
}

async function playWithAfplay(rawPcm: Buffer, ffmpegPath: string): Promise<boolean> {
  const base = `termeet-audio-${Date.now()}`
  const pcmPath = join(tmpdir(), `${base}.pcm`)
  const wavPath = join(tmpdir(), `${base}.wav`)

  await Bun.write(pcmPath, rawPcm)
  const convert = Bun.spawn({
    cmd: [
      ffmpegPath,
      "-f", "s16le",
      "-ar", String(AUDIO_SAMPLE_RATE),
      "-ac", String(AUDIO_CHANNELS),
      "-i", pcmPath,
      "-y",
      wavPath,
    ],
    stdout: "ignore",
    stderr: "ignore",
  })
  const convertExit = await convert.exited
  if (convertExit !== 0) return false

  const afplay = Bun.spawn({
    cmd: ["afplay", wavPath],
    stdout: "ignore",
    stderr: "ignore",
  })
  return (await afplay.exited) === 0
}

async function main() {
  // 1. Check binaries
  const ffmpeg = resolveFfmpegPath()
  const ffplay = resolveFfplayPath()
  console.log(`ffmpeg: ${ffmpeg}`)
  console.log(`ffplay: ${ffplay}`)
  printMacAudioDiagnostics()

  // 2. Record
  console.log(`\nRecording ${RECORD_SECONDS}s from mic...`)
  const chunks: Buffer[] = []
  const capture = new AudioCapture((data) => {
    chunks.push(Buffer.from(data))
  })
  await capture.start()
  if (!capture.isRunning()) {
    console.error("ERROR: AudioCapture failed to start. Is ffmpeg installed and mic accessible?")
    process.exit(1)
  }

  await new Promise((r) => setTimeout(r, RECORD_SECONDS * 1000))
  capture.stop()

  const totalBytes = chunks.reduce((s, c) => s + c.length, 0)
  const durationMs = (totalBytes / (AUDIO_SAMPLE_RATE * 2 * AUDIO_CHANNELS)) * 1000
  console.log(`Captured ${chunks.length} chunks, ${totalBytes} bytes (~${Math.round(durationMs)}ms)`)
  const peak = maxAmplitude(chunks)
  console.log(`Peak amplitude: ${peak}`)

  if (totalBytes === 0) {
    console.error("ERROR: No audio data captured. Check your microphone permissions.")
    process.exit(1)
  }
  if (peak < SILENCE_THRESHOLD) {
    console.warn("WARNING: Recording looks near-silent.")
    if (process.platform === "darwin") {
      console.warn('Hint: set AUDIO_INPUT_DEVICE, e.g. AUDIO_INPUT_DEVICE=":default" bun run test:audio')
      console.warn('You can list devices with: ffmpeg -f avfoundation -list_devices true -i ""')
    }
  }

  // 3. Playback
  console.log("\nPlaying back captured audio...")
  const playback = new AudioPlayback()
  await playback.start()
  if (!playback.isRunning()) {
    console.error("ERROR: AudioPlayback failed to start. Is ffplay installed?")
    process.exit(1)
  }

  for (const chunk of chunks) {
    playback.write(chunk)
  }

  // Wait for playback to finish (duration + buffer)
  await new Promise((r) => setTimeout(r, durationMs + 500))
  playback.stop()

  if (process.platform === "darwin") {
    console.log("\nTrying macOS native playback (afplay) as fallback...")
    const ok = await playWithAfplay(Buffer.concat(chunks), ffmpeg)
    if (!ok) {
      console.warn("WARNING: afplay fallback failed. Check default output device/volume.")
    } else {
      console.log("afplay fallback finished.")
    }
  }

  console.log("\nDone. If you heard your recording, audio pipeline is working.")
  process.exit(0)
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
