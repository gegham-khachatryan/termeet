#!/usr/bin/env bun
/** @deprecated Use `bun run build:cli` (same as cli-build --single). */
import { spawnSync } from "node:child_process"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const r = spawnSync(process.execPath, [join(root, "scripts/cli-build.ts"), "--single"], {
  cwd: root,
  stdio: "inherit",
})
process.exit(r.status ?? 1)
