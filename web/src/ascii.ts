// ─── Browser-side ASCII renderer ────────────────────────────────────────────
// Mirrors src/media/ascii-renderer.ts sampling + true-color glyphs (renderColored).

import type { AsciiColoredLines, AsciiColorRun } from "./types"

/** Same as protocol ASCII_RAMP_BLOCKS — matches CLI AsciiRenderer in app.tsx */
const ASCII_RAMP_BLOCKS = " ·∙:░▒▓█"

/** Defaults match CLI `new AsciiRenderer({ contrast: 0.3, brightness: 0.1, charset: ASCII_RAMP_BLOCKS })` */
const DEFAULT_CONTRAST = 0.3
const DEFAULT_BRIGHTNESS = 0.1

interface AsciiCell {
  char: string
  r: number
  g: number
  b: number
}

export interface AsciiRenderOptions {
  charset?: string
  contrast?: number
  brightness?: number
}

function map(value: number, start1: number, stop1: number, start2: number, stop2: number): number {
  return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1))
}

function constrain(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}

function pixelBrightness(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function applyContrast(value: number, contrast: number): number {
  const factor = (1 + contrast) / (1 - contrast + 0.01)
  return constrain(factor * (value - 128) + 128, 0, 255)
}

function applyBrightness(value: number, brightnessAdj: number): number {
  return constrain(value + brightnessAdj * 255, 0, 255)
}

function sampleAsciiCells(
  data: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  cols: number,
  rows: number,
  options?: AsciiRenderOptions,
): AsciiCell[][] {
  const charset = options?.charset ?? ASCII_RAMP_BLOCKS
  const contrast = options?.contrast ?? DEFAULT_CONTRAST
  const brightnessAdj = options?.brightness ?? DEFAULT_BRIGHTNESS

  const outputAspect = (cols * 1.0) / (rows * 2.0)
  const srcAspect = srcWidth / srcHeight

  let cropW = srcWidth
  let cropH = srcHeight
  let offsetX = 0
  let offsetY = 0

  if (srcAspect > outputAspect) {
    cropW = Math.floor(srcHeight * outputAspect)
    offsetX = Math.floor((srcWidth - cropW) / 2)
  } else {
    cropH = Math.floor(srcWidth / outputAspect)
    offsetY = Math.floor((srcHeight - cropH) / 2)
  }

  const stepX = cropW / cols
  const stepY = cropH / rows

  const grid: AsciiCell[][] = []
  for (let y = 0; y < rows; y++) {
    const row: AsciiCell[] = []
    for (let x = 0; x < cols; x++) {
      const sx = Math.floor(offsetX + x * stepX + stepX / 2)
      const sy = Math.floor(offsetY + y * stepY + stepY / 2)
      const i = (sy * srcWidth + sx) * 3

      const r = data[i] ?? 0
      const g = data[i + 1] ?? 0
      const b = data[i + 2] ?? 0

      let bright = pixelBrightness(r, g, b)
      bright = applyContrast(bright, contrast)
      bright = applyBrightness(bright, brightnessAdj)

      const charIdx = Math.floor(map(bright, 0, 255, 0, charset.length - 1))
      const char = charset[constrain(charIdx, 0, charset.length - 1)]!
      row.push({ char, r, g, b })
    }
    grid.push(row)
  }
  return grid
}

function rowToRuns(row: AsciiCell[]): AsciiColorRun[] {
  const runs: AsciiColorRun[] = []
  for (const cell of row) {
    const last = runs[runs.length - 1]
    if (last && last.rgb[0] === cell.r && last.rgb[1] === cell.g && last.rgb[2] === cell.b) {
      last.text += cell.char
    } else {
      runs.push({ text: cell.char, rgb: [cell.r, cell.g, cell.b] })
    }
  }
  return runs
}

/**
 * True-color ASCII lines for HTML (same logic as CLI AsciiRenderer.renderColored).
 */
export function renderRgbToColoredLines(
  data: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  cols: number,
  rows: number,
  options?: AsciiRenderOptions,
): AsciiColoredLines {
  const grid = sampleAsciiCells(data, srcWidth, srcHeight, cols, rows, options)
  return grid.map(rowToRuns)
}

/**
 * Plain string (mono-color elsewhere). Same grid as colored path.
 */
export function renderRgbToAscii(
  data: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  cols: number,
  rows: number,
  options?: AsciiRenderOptions,
): string {
  const grid = sampleAsciiCells(data, srcWidth, srcHeight, cols, rows, options)
  return grid.map((row) => row.map((c) => c.char).join("")).join("\n")
}

/**
 * Convert RGBA ImageData pixels to RGB Uint8Array (drops alpha channel).
 */
export function rgbaToRgb(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const rgb = new Uint8Array(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = rgba[i * 4]
    rgb[i * 3 + 1] = rgba[i * 4 + 1]
    rgb[i * 3 + 2] = rgba[i * 4 + 2]
  }
  return rgb
}

/**
 * Base64 encode a Uint8Array.
 */
export function toBase64(data: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i])
  }
  return btoa(binary)
}

/**
 * Base64 decode to Uint8Array.
 */
export function fromBase64(str: string): Uint8Array {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Check if a frame's data field is base64-encoded RGB pixels
 * (as sent by the CLI) vs pre-rendered ASCII art.
 */
export function isBase64Frame(data: string, width: number, height: number): boolean {
  if (data.includes("\n")) return false
  const expectedLen = Math.ceil((width * height * 3) / 3) * 4
  return data.length >= expectedLen * 0.8
}
