#!/usr/bin/env node
/**
 * npm global entry: resolves the native binary from optionalDependency
 * termeet-cli-<platform>-<arch> (same pattern as @multiplayer-app/cli).
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLATFORM_MAP = { darwin: 'darwin', linux: 'linux', win32: 'windows' }
const ARCH_MAP = { x64: 'x64', arm64: 'arm64' }

const platform = PLATFORM_MAP[/** @type {keyof typeof PLATFORM_MAP} */ (process.platform)]
const arch = ARCH_MAP[/** @type {keyof typeof ARCH_MAP} */ (process.arch)]

if (!platform || !arch) {
  process.stderr.write(`Unsupported platform: ${process.platform}-${process.arch}\n`)
  process.exit(1)
}

const slug = `${platform}-${arch}`
const pkgName = `termeet-cli-${slug}`
const binName = process.platform === 'win32' ? 'termeet.exe' : 'termeet'

function findBinary() {
  if (process.env['TERMEET_BIN_PATH']) return process.env['TERMEET_BIN_PATH']

  let dir = dirname(fileURLToPath(import.meta.url))
  while (true) {
    const candidate = join(dir, 'node_modules', pkgName, 'bin', binName)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  const devBin = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', slug, 'bin', binName)
  if (existsSync(devBin)) return devBin

  return null
}

const bin = findBinary()
if (!bin) {
  process.stderr.write(`Could not find Termeet binary for ${slug}.\n` + `Try reinstalling: npm install -g termeet\n`)
  process.exit(1)
}

try {
  execFileSync(bin, process.argv.slice(2), { stdio: 'inherit' })
} catch (err) {
  if (err.signal) {
    // Re-raise the same signal so the parent sees the correct exit reason
    // Re-raise the same signal so the parent sees the correct exit reason
    process.kill(process.pid, err.signal)
  }

  process.exit(err.status ?? 1)
}
