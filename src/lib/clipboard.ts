import { spawn } from "bun"

/** Copy plain text to the system clipboard (terminal-friendly). */
export async function copyToClipboard(text: string): Promise<boolean> {
  const platform = process.platform
  const payload = Buffer.from(text, "utf8")

  const writeStdin = async (subprocess: ReturnType<typeof spawn>) => {
    const stdin = subprocess.stdin
    if (!stdin || typeof (stdin as { write?: unknown }).write !== "function") return false
    const sink = stdin as { write(chunk: Buffer): void; end(): void }
    try {
      sink.write(payload)
      sink.end()
    } catch {
      return false
    }
    return (await subprocess.exited) === 0
  }

  const run = async (cmd: string[]) => {
    try {
      const subprocess = spawn({ cmd, stdin: "pipe" })
      return await writeStdin(subprocess)
    } catch {
      return false
    }
  }

  if (platform === "darwin") {
    return run(["pbcopy"])
  }

  if (platform === "linux") {
    if (await run(["wl-copy"])) return true
    if (await run(["xclip", "-selection", "clipboard"])) return true
    return false
  }

  if (platform === "win32") {
    return run(["clip"])
  }

  return false
}
