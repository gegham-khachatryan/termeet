#!/usr/bin/env bun
/**
 * Cross-compile the Termeet CLI for all platforms (like multiplayer-debugger
 * packages/cli/scripts/build.ts) and place a matching ffmpeg next to each binary.
 *
 * Local single-platform: bun run scripts/cli-build.ts --single
 * CI (all targets):      bun run scripts/cli-build.ts
 */

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { join, dirname } from "node:path"
import { gunzipSync } from "node:zlib"
import { fileURLToPath } from "node:url"
import { $ } from "bun"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as {
  version: string
  license?: string
  repository?: { type: string; url: string }
}

const ffmpegPkg = JSON.parse(
  readFileSync(join(ROOT, "node_modules/ffmpeg-static/package.json"), "utf-8"),
) as { "ffmpeg-static": { "binary-release-tag": string } }
const FFMPEG_RELEASE = ffmpegPkg["ffmpeg-static"]["binary-release-tag"]

type Target = {
  target: string
  slug: string
  npmOs: string
  npmCpu: string
  ffPlat: string
  ffArch: string
  bin: string
}

const TARGETS: Target[] = [
  {
    target: "bun-darwin-arm64",
    slug: "darwin-arm64",
    npmOs: "darwin",
    npmCpu: "arm64",
    ffPlat: "darwin",
    ffArch: "arm64",
    bin: "termeet",
  },
  {
    target: "bun-darwin-x64",
    slug: "darwin-x64",
    npmOs: "darwin",
    npmCpu: "x64",
    ffPlat: "darwin",
    ffArch: "x64",
    bin: "termeet",
  },
  {
    target: "bun-linux-x64",
    slug: "linux-x64",
    npmOs: "linux",
    npmCpu: "x64",
    ffPlat: "linux",
    ffArch: "x64",
    bin: "termeet",
  },
  {
    target: "bun-linux-arm64",
    slug: "linux-arm64",
    npmOs: "linux",
    npmCpu: "arm64",
    ffPlat: "linux",
    ffArch: "arm64",
    bin: "termeet",
  },
  {
    target: "bun-windows-x64",
    slug: "windows-x64",
    npmOs: "win32",
    npmCpu: "x64",
    ffPlat: "win32",
    ffArch: "x64",
    bin: "termeet.exe",
  },
  {
    target: "bun-windows-arm64",
    slug: "windows-arm64",
    npmOs: "win32",
    npmCpu: "arm64",
    ffPlat: "win32",
    ffArch: "arm64",
    bin: "termeet.exe",
  },
]

const single = process.argv.includes("--single")
const envTargets = process.env["TERMEET_TARGETS"]
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean)

let targets = single
  ? TARGETS.filter(
      (t) =>
        t.npmOs ===
          (process.platform === "win32"
            ? "win32"
            : process.platform === "darwin"
              ? "darwin"
              : "linux") && t.npmCpu === process.arch,
    )
  : TARGETS

if (envTargets && envTargets.length > 0) {
  const wanted = new Set(envTargets)
  targets = targets.filter((t) => wanted.has(t.slug))
}

if (targets.length === 0) {
  console.error("No matching target for --single (platform/arch).")
  process.exit(1)
}

async function downloadFfmpeg(ffPlat: string, ffArch: string, destPath: string): Promise<boolean> {
  const base = `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_RELEASE}`
  const url = `${base}/ffmpeg-${ffPlat}-${ffArch}.gz`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`  ⚠ ffmpeg: skip ${ffPlat}-${ffArch} (${res.status}) — use system ffmpeg or PATH`)
    return false
  }
  const gz = Buffer.from(await res.arrayBuffer())
  const raw = gunzipSync(gz)
  writeFileSync(destPath, raw)
  chmodSync(destPath, 0o755)
  return true
}

function copyFfplayFromPath(binDir: string, win: boolean) {
  if (win) {
    const where = Bun.spawnSync(["cmd", "/c", "where ffplay"], {
      stdout: "pipe",
      stderr: "ignore",
    })
    if (where.exitCode !== 0) return
    const src = where.stdout.toString().trim().split(/\r?\n/)[0]
    const dest = join(binDir, "ffplay.exe")
    if (src && existsSync(src)) {
      copyFileSync(src, dest)
      console.log(`  → ffplay copied (Windows)`)
    }
    return
  }
  const which = Bun.spawnSync(["which", "ffplay"], { stdout: "pipe", stderr: "ignore" })
  if (which.exitCode !== 0) return
  const src = which.stdout.toString().trim().split("\n")[0]
  const dest = join(binDir, "ffplay")
  if (src && existsSync(src)) {
    copyFileSync(src, dest)
    chmodSync(dest, 0o755)
    console.log(`  → ffplay copied from PATH`)
  }
}

/**
 * Ad-hoc codesign a Mach-O binary so macOS Gatekeeper won't SIGKILL it.
 * Tries `codesign` (macOS) first, then `ldid` (cross-platform), then
 * `rcodesign` (Rust-based cross-platform signer).
 */
async function adHocSign(binPath: string, slug: string) {
  const tools = [
    { cmd: ["codesign", "--sign", "-", "--force", binPath], name: "codesign" },
    { cmd: ["ldid", "-S", binPath], name: "ldid" },
    { cmd: ["rcodesign", "sign", binPath], name: "rcodesign" },
  ]
  for (const { cmd, name } of tools) {
    const which = Bun.spawnSync(["which", cmd[0]], { stdout: "pipe", stderr: "ignore" })
    if (which.exitCode !== 0) continue
    console.log(`  → ad-hoc signing (${name}) ${slug}`)
    const result = Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" })
    if (result.exitCode === 0) return
    console.warn(`  ⚠ ${name} returned ${result.exitCode}`)
  }
  console.warn(`  ⚠ no signing tool available for ${slug} — macOS may block this binary`)
}

const distRoot = join(ROOT, "dist")
mkdirSync(distRoot, { recursive: true })

console.log(`Building ${targets.length} target(s)…`)

/**
 * Cross-compilation resolves `@opentui/core-${process.platform}-${process.arch}` at bundle time.
 * On Linux CI the host is linux-x64, so a plain `bun install` never extracts darwin/windows
 * optional packages. Install every platform variant once (same lockfile; no package.json change).
 */
if (!single) {
  console.log(
    "  bun install --frozen-lockfile --os=* --cpu=* (all OpenTUI native optional packages)…",
  )
  const proc = Bun.spawn([process.execPath, "install", "--frozen-lockfile", "--os=*", "--cpu=*"], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  })
  const code = await proc.exited
  if (code !== 0) process.exit(code)
}

for (const t of targets) {
  const pkgName = `termeet-cli-${t.slug}`
  const pkgDir = join(distRoot, t.slug)
  const binDir = join(pkgDir, "bin")
  const binPath = join(binDir, t.bin)

  mkdirSync(binDir, { recursive: true })

  console.log(`  → ${t.target}`)
  await $`${process.execPath} build ${join(ROOT, "src/index.tsx")} --compile --target=${t.target} --outfile=${binPath} --sourcemap=none`.cwd(
    ROOT,
  )

  for (const f of readdirSync(binDir)) {
    if (f.endsWith(".map")) unlinkSync(join(binDir, f))
  }

  if (t.npmOs !== "win32") chmodSync(binPath, 0o755)

  // Ad-hoc codesign macOS binaries so Gatekeeper doesn't SIGKILL them
  if (t.npmOs === "darwin") {
    try {
      await adHocSign(binPath, t.slug)
    } catch (e) {
      console.warn(`  ⚠ signing failed for ${t.slug}: ${e}`)
    }
  }

  const ffName = t.npmOs === "win32" ? "ffmpeg.exe" : "ffmpeg"
  const ffDest = join(binDir, ffName)
  if (await downloadFfmpeg(t.ffPlat, t.ffArch, ffDest)) {
    console.log(`  → ffmpeg bundled`)
  }

  if (single) copyFfplayFromPath(binDir, t.npmOs === "win32")

  const platformPkg = {
    name: pkgName,
    version: pkg.version,
    description: `Termeet CLI binary (${t.slug}) with bundled ffmpeg`,
    repository: pkg.repository,
    os: [t.npmOs],
    cpu: [t.npmCpu],
    license: pkg.license ?? "MIT",
    files: ["bin"],
  }
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify(platformPkg, null, 2) + "\n")
}

console.log("Done.")
