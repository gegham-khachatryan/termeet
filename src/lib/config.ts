import { join } from "path"
import { homedir } from "os"

const CONFIG_DIR = join(homedir(), ".config", "termeet")
const CONFIG_FILE = join(CONFIG_DIR, "config.json")

interface TermeetConfig {
  userName?: string
}

function readConfig(): TermeetConfig {
  try {
    const data = require("fs").readFileSync(CONFIG_FILE, "utf-8")
    return JSON.parse(data) as TermeetConfig
  } catch {
    return {}
  }
}

function writeConfig(config: TermeetConfig): void {
  try {
    require("fs").mkdirSync(CONFIG_DIR, { recursive: true })
    require("fs").writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n")
  } catch {
    // Best-effort — don't crash if fs is unavailable
  }
}

export function getSavedUserName(): string {
  return readConfig().userName ?? ""
}

export function saveUserName(name: string): void {
  const config = readConfig()
  config.userName = name
  writeConfig(config)
}
