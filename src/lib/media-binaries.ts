import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

/**
 * Directory containing the running executable (Bun --compile or `bun run`).
 * Used to find sidecar ffmpeg/ffplay shipped next to the binary.
 */
function executableDir(): string {
  try {
    const argv0 = process.argv[0]
    if (argv0 && argv0 !== "bun" && !argv0.endsWith("/bun")) {
      return dirname(argv0)
    }
  } catch {
    // ignore
  }
  return process.cwd()
}

function firstExisting(paths: string[]): string | null {
  for (const p of paths) {
    if (p && existsSync(p)) return p
  }
  return null
}

/** User override for packaged / custom installs */
export function resolveFfmpegPath(): string {
  const env = process.env["FFMPEG_PATH"]
  if (env && existsSync(env)) return env

  const dir = executableDir()
  const name = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
  const bundled = firstExisting([join(dir, name), join(dir, "..", "bin", name)])

  if (bundled) return bundled

  return "ffmpeg"
}

/** ffplay is optional; remote audio playback falls back to silent if missing */
export function resolveFfplayPath(): string {
  const env = process.env["FFPLAY_PATH"]
  if (env && existsSync(env)) return env

  const dir = executableDir()
  const name = process.platform === "win32" ? "ffplay.exe" : "ffplay"
  const bundled = firstExisting([join(dir, name), join(dir, "..", "bin", name)])

  if (bundled) return bundled

  return "ffplay"
}
