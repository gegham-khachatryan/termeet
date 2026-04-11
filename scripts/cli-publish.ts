#!/usr/bin/env bun
/**
 * Publish platform packages under dist/* then the root termeet wrapper (mirrors
 * multiplayer-debugger packages/cli/scripts/publish.ts).
 */

import { chmodSync, existsSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as { version?: string }
const prereleaseMatch = pkg.version?.match(/-([\w]+)(\.\d+)?$/)
const distTag = prereleaseMatch ? prereleaseMatch[1]! : "latest"

if (!pkg.version) {
  console.error("Root package.json is missing version")
  process.exit(1)
}

const PLATFORMS: { dir: string; bin: string }[] = [
  { dir: "darwin-arm64", bin: "termeet" },
  { dir: "darwin-x64", bin: "termeet" },
  { dir: "linux-x64", bin: "termeet" },
  { dir: "linux-arm64", bin: "termeet" },
  { dir: "windows-x64", bin: "termeet.exe" },
  { dir: "windows-arm64", bin: "termeet.exe" },
]

function npmPublish(pkgDir: string, label: string, ignoreScripts: boolean) {
  const args = ["publish", "--access", "public", "--tag", distTag]
  if (ignoreScripts) args.push("--ignore-scripts")
  if (process.env["NPM_CONFIG_PROVENANCE"] === "true") args.push("--provenance")

  const result = Bun.spawnSync(["npm", ...args], {
    cwd: pkgDir,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  })

  const out = result.stdout.toString() + result.stderr.toString()

  if (result.exitCode === 0) {
    console.log(`Published ${label}`)
    return
  }

  if (
    out.includes("You cannot publish over the previously published versions") ||
    out.includes("previously published")
  ) {
    console.log(`Skipping ${label} — already published`)
    return
  }

  process.stderr.write(result.stderr)
  process.stdout.write(result.stdout)
  process.exit(result.exitCode ?? 1)
}

async function verifyTarballAvailable(pkgName: string, version: string) {
  const spec = `${pkgName}@${version}`
  const maxAttempts = 24
  const initialDelayMs = 3000
  const maxDelayMs = 15000

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const view = Bun.spawnSync(["npm", "view", spec, "dist.tarball", "--json"], {
      cwd: ROOT,
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    })

    if (view.exitCode === 0) {
      const tarball = view.stdout.toString().trim().replace(/^"|"$/g, "")
      if (tarball) {
        try {
          const res = await fetch(tarball, {
            method: "GET",
            headers: { Range: "bytes=0-0" },
          })
          if (res.ok || res.status === 206) {
            console.log(`Verified ${spec} tarball`)
            return
          }
          console.log(`Waiting for ${spec} tarball (${res.status}), attempt ${attempt}/${maxAttempts}`)
        } catch {
          console.log(`Waiting for ${spec} tarball (network), attempt ${attempt}/${maxAttempts}`)
        }
      }
    }

    const delay = Math.min(maxDelayMs, initialDelayMs * attempt)
    await Bun.sleep(delay)
  }

  console.error(`Tarball not available after publish: ${spec}`)
  process.exit(1)
}

for (const { dir, bin } of PLATFORMS) {
  const pkgDir = join(ROOT, "dist", dir)
  if (!existsSync(pkgDir)) {
    console.error(`Missing: dist/${dir} — run cli-build first`)
    process.exit(1)
  }
  const binPath = join(pkgDir, "bin", bin)
  if (!existsSync(binPath)) {
    console.error(`Missing binary: ${binPath}`)
    process.exit(1)
  }
  chmodSync(binPath, 0o755)
  const platformName = `termeet-cli-${dir}`
  npmPublish(pkgDir, platformName, false)
  await verifyTarballAvailable(platformName, pkg.version)
}

npmPublish(ROOT, "termeet", true)
await verifyTarballAvailable("termeet", pkg.version)

console.log("All packages published.")
