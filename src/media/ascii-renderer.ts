import { RGBA, StyledText, type TextChunk } from "@opentui/core"
import { ASCII_RAMP_DETAILED } from "../protocol.ts"
import type { RawFrame } from "./camera.ts"

interface AsciiCell {
  char: string
  r: number
  g: number
  b: number
}

// ─── p5.js-inspired ASCII Renderer ─────────────────────────────────────────
// Converts raw RGB frames to ASCII art using brightness mapping,
// edge detection, and optional color (ANSI) output.
//
// Inspired by p5.js pixel manipulation patterns:
//   - pixels[] array access
//   - brightness/color extraction
//   - map() for value remapping

interface AsciiRendererOptions {
  outputWidth: number
  outputHeight: number
  charset?: string
  colorMode?: "none" | "ansi256" | "truecolor"
  invert?: boolean
  edgeDetection?: boolean
  contrast?: number // -1.0 to 1.0
  brightness?: number // -1.0 to 1.0
}

export class AsciiRenderer {
  private charset: string
  private outputWidth: number
  private outputHeight: number
  private colorMode: "none" | "ansi256" | "truecolor"
  private invert: boolean
  private edgeDetection: boolean
  private contrast: number
  private brightnessAdj: number

  constructor(options: AsciiRendererOptions) {
    this.charset = options.charset ?? ASCII_RAMP_DETAILED
    this.outputWidth = options.outputWidth
    this.outputHeight = options.outputHeight
    this.colorMode = options.colorMode ?? "none"
    this.invert = options.invert ?? false
    this.edgeDetection = options.edgeDetection ?? false
    this.contrast = options.contrast ?? 0.2
    this.brightnessAdj = options.brightness ?? 0
  }

  // ─── p5.js-style helpers ────────────────────────────────────────────────

  /** Map a value from one range to another (like p5.map()) */
  private map(value: number, start1: number, stop1: number, start2: number, stop2: number): number {
    return start2 + (stop2 - start2) * ((value - start1) / (stop1 - start1))
  }

  /** Constrain a value between min and max (like p5.constrain()) */
  private constrain(value: number, low: number, high: number): number {
    return Math.max(low, Math.min(high, value))
  }

  /** Get brightness of RGB pixel (like p5.brightness()) */
  private pixelBrightness(r: number, g: number, b: number): number {
    // Perceived brightness using luminance formula
    return 0.299 * r + 0.587 * g + 0.114 * b
  }

  /** Apply contrast adjustment */
  private applyContrast(value: number): number {
    const factor = (1 + this.contrast) / (1 - this.contrast + 0.01)
    return this.constrain(factor * (value - 128) + 128, 0, 255)
  }

  /** Apply brightness adjustment */
  private applyBrightness(value: number): number {
    return this.constrain(value + this.brightnessAdj * 255, 0, 255)
  }

  // ─── Frame Processing ──────────────────────────────────────────────────

  /**
   * Sample the frame into a grid of glyphs + source RGB per cell.
   * Character comes from (processed) brightness; r,g,b are the sampled pixel for coloring.
   */
  private sampleGrid(frame: RawFrame): AsciiCell[][] {
    const { width: srcW, height: srcH, data } = frame

    const outputAspect = (this.outputWidth * 1.0) / (this.outputHeight * 2.0)
    const srcAspect = srcW / srcH

    let cropW = srcW
    let cropH = srcH
    let offsetX = 0
    let offsetY = 0

    if (srcAspect > outputAspect) {
      cropW = Math.floor(srcH * outputAspect)
      offsetX = Math.floor((srcW - cropW) / 2)
    } else {
      cropH = Math.floor(srcW / outputAspect)
      offsetY = Math.floor((srcH - cropH) / 2)
    }

    const stepX = cropW / this.outputWidth
    const stepY = cropH / this.outputHeight

    const grid: AsciiCell[][] = []

    for (let oy = 0; oy < this.outputHeight; oy++) {
      const row: AsciiCell[] = []
      for (let ox = 0; ox < this.outputWidth; ox++) {
        const sx = Math.floor(offsetX + ox * stepX + stepX / 2)
        const sy = Math.floor(offsetY + oy * stepY + stepY / 2)
        const idx = (sy * srcW + sx) * 3

        const r = data[idx] ?? 0
        const g = data[idx + 1] ?? 0
        const b = data[idx + 2] ?? 0

        let brightness = this.pixelBrightness(r, g, b)
        brightness = this.applyContrast(brightness)
        brightness = this.applyBrightness(brightness)

        if (this.invert) {
          brightness = 255 - brightness
        }

        if (this.edgeDetection) {
          const edgeStrength = this.sobelAt(data, srcW, srcH, sx, sy)
          brightness = this.constrain(brightness - edgeStrength * 0.5, 0, 255)
        }

        const charIdx = Math.floor(this.map(brightness, 0, 255, 0, this.charset.length - 1))
        const char = this.charset[this.constrain(charIdx, 0, this.charset.length - 1)]!
        row.push({ char, r, g, b })
      }
      grid.push(row)
    }

    return grid
  }

  /** Plain string (no ANSI). For terminals that interpret escapes themselves. */
  render(frame: RawFrame): string {
    const grid = this.sampleGrid(frame)
    return grid
      .map((row) =>
        row
          .map((cell) => {
            if (this.colorMode === "truecolor") {
              return `\x1b[38;2;${cell.r};${cell.g};${cell.b}m${cell.char}\x1b[0m`
            }
            if (this.colorMode === "ansi256") {
              const ansi = this.rgbToAnsi256(cell.r, cell.g, cell.b)
              return `\x1b[38;5;${ansi}m${cell.char}\x1b[0m`
            }
            return cell.char
          })
          .join(""),
      )
      .join("\n")
  }

  /**
   * True-color glyphs for OpenTUI: pass to `<text content={...} />`.
   * Inline ANSI strings are not interpreted by OpenTUI; StyledText chunks are.
   */
  renderColored(frame: RawFrame): StyledText {
    const grid = this.sampleGrid(frame)
    const chunks: TextChunk[] = []

    for (let li = 0; li < grid.length; li++) {
      const row = grid[li]!
      let i = 0
      while (i < row.length) {
        const { r, g, b } = row[i]!
        let run = ""
        while (
          i < row.length &&
          row[i]!.r === r &&
          row[i]!.g === g &&
          row[i]!.b === b
        ) {
          run += row[i]!.char
          i++
        }
        chunks.push({
          __isChunk: true,
          text: run,
          fg: RGBA.fromInts(r, g, b, 255),
        })
      }
      if (li < grid.length - 1 && chunks.length > 0) {
        const last = chunks[chunks.length - 1]!
        last.text += "\n"
      }
    }

    if (chunks.length === 0) {
      return new StyledText([{ __isChunk: true, text: "" }])
    }
    return new StyledText(chunks)
  }

  /** Sobel edge detection at a specific pixel */
  private sobelAt(data: Buffer, w: number, h: number, x: number, y: number): number {
    const get = (px: number, py: number): number => {
      const cx = this.constrain(px, 0, w - 1)
      const cy = this.constrain(py, 0, h - 1)
      const i = (cy * w + cx) * 3
      return this.pixelBrightness(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0)
    }

    // Sobel kernels
    const gx =
      -get(x - 1, y - 1) + get(x + 1, y - 1) +
      -2 * get(x - 1, y) + 2 * get(x + 1, y) +
      -get(x - 1, y + 1) + get(x + 1, y + 1)

    const gy =
      -get(x - 1, y - 1) - 2 * get(x, y - 1) - get(x + 1, y - 1) +
      get(x - 1, y + 1) + 2 * get(x, y + 1) + get(x + 1, y + 1)

    return Math.sqrt(gx * gx + gy * gy)
  }

  /** Convert RGB to ANSI 256 color index */
  private rgbToAnsi256(r: number, g: number, b: number): number {
    // Check if it's a grayscale color
    if (r === g && g === b) {
      if (r < 8) return 16
      if (r > 248) return 231
      return Math.round((r - 8) / 247 * 24) + 232
    }

    return (
      16 +
      36 * Math.round((r / 255) * 5) +
      6 * Math.round((g / 255) * 5) +
      Math.round((b / 255) * 5)
    )
  }

  // ─── Configuration ────────────────────────────────────────────────────

  setOutputSize(width: number, height: number) {
    this.outputWidth = width
    this.outputHeight = height
  }

  setColorMode(mode: "none" | "ansi256" | "truecolor") {
    this.colorMode = mode
  }

  setContrast(value: number) {
    this.contrast = this.constrain(value, -1, 1)
  }

  setBrightness(value: number) {
    this.brightnessAdj = this.constrain(value, -1, 1)
  }

  toggleInvert() {
    this.invert = !this.invert
  }

  toggleEdgeDetection() {
    this.edgeDetection = !this.edgeDetection
  }
}

// ─── Frame Utilities ────────────────────────────────────────────────────────

/** Downsample a raw RGB frame to a smaller resolution using center-sampling. */
export function downsampleFrame(frame: RawFrame, targetW: number, targetH: number): RawFrame {
  if (frame.width <= targetW && frame.height <= targetH) return frame

  const { width: srcW, height: srcH, data: srcData } = frame
  const out = Buffer.alloc(targetW * targetH * 3)
  const stepX = srcW / targetW
  const stepY = srcH / targetH

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const sx = Math.floor(x * stepX + stepX / 2)
      const sy = Math.floor(y * stepY + stepY / 2)
      const srcIdx = (sy * srcW + sx) * 3
      const dstIdx = (y * targetW + x) * 3
      out[dstIdx] = srcData[srcIdx] ?? 0
      out[dstIdx + 1] = srcData[srcIdx + 1] ?? 0
      out[dstIdx + 2] = srcData[srcIdx + 2] ?? 0
    }
  }

  return { width: targetW, height: targetH, data: out }
}

// ─── Test Pattern Generator ─────────────────────────────────────────────────
// Generates test frames when no camera is available

export function generateTestFrame(width: number, height: number, t: number): RawFrame {
  const data = Buffer.alloc(width * height * 3)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3
      // Animated gradient pattern
      const r = Math.floor(128 + 127 * Math.sin(x * 0.05 + t * 0.02))
      const g = Math.floor(128 + 127 * Math.sin(y * 0.05 + t * 0.03))
      const b = Math.floor(128 + 127 * Math.sin((x + y) * 0.03 + t * 0.01))
      data[idx] = r
      data[idx + 1] = g
      data[idx + 2] = b
    }
  }

  return { width, height, data }
}
