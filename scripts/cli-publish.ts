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
  npmPublish(pkgDir, `termeet-cli-${dir}`, false)
}

npmPublish(ROOT, "termeet", true)

console.log("All packages published.")
