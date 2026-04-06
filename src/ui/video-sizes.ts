/**
 * Single source of truth for ASCII stream and video card size.
 * Panel outer size = stream (cols × rows) + small padding + titled border chrome.
 *
 * App's AsciiRenderer output MUST match `meetingAsciiDimensions` so text fits
 * the panel inner width (no overflow / middle truncation from `truncate`).
 */

/** Horizontal: left/right border + paddingX (1+1). */
export const CHROME_COLS = 4

/** Vertical: top/bottom border + title + bottomTitle + padding (OpenTUI needs ~1 extra row). */
export const CHROME_ROWS = 6

/**
 * 16:9 video in pixel space with ~2:1 terminal glyph aspect (cell height ≈ 2× width):
 * (cols × w) / (rows × 2w) = 16/9 ⇒ rows = (9/32) × cols.
 */
function streamRowsFor16x9(cols: number): number {
  return Math.max(1, Math.round((cols * 9) / 32))
}

/**
 * Pick the largest stream (cols × rows) with 16:9 display aspect that fits in an outer
 * panel slot [maxOuterW × maxOuterH] (including border chrome).
 */
export function fitStream16x9InOuterSlot(
  maxOuterW: number,
  maxOuterH: number,
  minStreamCols: number,
  minStreamRows: number,
): FixedVideoPanelSize {
  const rawMaxW = Math.max(0, maxOuterW - CHROME_COLS)
  const rawMaxH = Math.max(0, maxOuterH - CHROME_ROWS)

  let bestCols = minStreamCols
  let bestRows = Math.max(minStreamRows, streamRowsFor16x9(minStreamCols))
  let bestArea = 0

  for (let cols = minStreamCols; cols <= rawMaxW; cols++) {
    const rows = streamRowsFor16x9(cols)
    if (rows < minStreamRows || rows > rawMaxH) continue
    const area = cols * rows
    if (area > bestArea) {
      bestArea = area
      bestCols = cols
      bestRows = rows
    }
  }

  if (bestArea === 0) {
    // Slot too short for 16:9 at min width — reduce cols until rows fit.
    for (let cols = rawMaxW; cols >= minStreamCols; cols--) {
      const rows = Math.max(minStreamRows, streamRowsFor16x9(cols))
      if (rows <= rawMaxH) {
        bestCols = cols
        bestRows = rows
        bestArea = cols * rows
        break
      }
    }
  }

  if (bestArea === 0) {
    bestCols = Math.max(1, Math.min(rawMaxW, minStreamCols))
    bestRows = Math.max(1, Math.min(rawMaxH, Math.max(minStreamRows, streamRowsFor16x9(bestCols))))
  }

  return {
    streamCols: bestCols,
    streamRows: bestRows,
    panelWidth: bestCols + CHROME_COLS,
    panelHeight: bestRows + CHROME_ROWS,
  }
}

/** Inner video region below participants bar and beside chat (character cells). */
export function videoContentArea(termW: number, termH: number, chatWidth: number) {
  return {
    w: termW - chatWidth,
    h: termH - 5, // participants bar + controls reserve
  }
}

export interface FixedVideoPanelSize {
  streamCols: number
  streamRows: number
  panelWidth: number
  panelHeight: number
}

/** Match logic in App when not in a synced meeting grid (e.g. lobby). */
export function asciiStreamDimensions(termW: number, termH: number): { cols: number; rows: number } {
  const { w, h } = videoContentArea(termW, termH, 0)
  const p = fitStream16x9InOuterSlot(w - 2, h - 2, 20, 8)
  return { cols: p.streamCols, rows: p.streamRows }
}

/** One fixed card size for every participant tile (legacy / simple layouts). */
export function fixedVideoPanelSize(termW: number, termH: number): FixedVideoPanelSize {
  const { w, h } = videoContentArea(termW, termH, 0)
  return fitStream16x9InOuterSlot(w - 2, h - 2, 20, 8)
}

function gridLayout(participantCount: number): { gridCols: number; gridRows: number } {
  if (participantCount <= 1) return { gridCols: 1, gridRows: 1 }
  if (participantCount <= 2) return { gridCols: 2, gridRows: 1 }
  if (participantCount <= 4) return { gridCols: 2, gridRows: 2 }
  if (participantCount <= 6) return { gridCols: 3, gridRows: 2 }
  return { gridCols: 3, gridRows: Math.ceil(participantCount / 3) }
}

/**
 * Tile size for a multi-column grid filling [videoAreaW × videoAreaH] (already net of chat & chrome).
 */
export function adaptivePanelInArea(
  videoAreaW: number,
  videoAreaH: number,
  participantCount: number,
): FixedVideoPanelSize {
  const gap = 2
  const padding = 4
  const { gridCols, gridRows } = gridLayout(participantCount)

  const maxPanelW = Math.floor((videoAreaW - padding - gap * (gridCols - 1)) / gridCols)
  const maxPanelH = Math.floor((videoAreaH - padding - gap * (gridRows - 1)) / gridRows)

  return fitStream16x9InOuterSlot(maxPanelW, maxPanelH, 20, 8)
}

/**
 * Vertical stack of thumbnails (pinned layout sidebar). One column, N rows.
 */
export function adaptiveSidebarThumbs(
  sidebarAreaW: number,
  videoAreaH: number,
  thumbCount: number,
): FixedVideoPanelSize {
  const gap = 2
  const padding = 4
  if (thumbCount <= 0) {
    return fitStream16x9InOuterSlot(sidebarAreaW - padding, videoAreaH - padding, 16, 6)
  }

  const maxPanelW = sidebarAreaW - padding
  const maxPanelH = Math.floor((videoAreaH - padding - gap * (thumbCount - 1)) / thumbCount)

  return fitStream16x9InOuterSlot(maxPanelW, maxPanelH, 16, 6)
}

/** Full terminal: subtract chat strip and top/bottom chrome from height. */
export function adaptiveVideoPanelSize(
  termW: number,
  termH: number,
  participantCount: number,
  chatWidth: number,
): FixedVideoPanelSize {
  const { w, h } = videoContentArea(termW, termH, chatWidth)
  return adaptivePanelInArea(w, h, participantCount)
}

/**
 * AsciiRenderer output size — must match each visible panel’s inner stream size.
 * Grid: one size for all tiles. Pinned: use the large pinned strip (sidebar thumbs
 * may clip with overflow:hidden; using min(pin, thumb) shrank ASCII and left empty
 * space inside the yellow pinned frame).
 */
export function meetingAsciiDimensions(
  termW: number,
  termH: number,
  chatWidth: number,
  options:
    | { layout: "grid"; participantCount: number }
    | { layout: "pinned"; sidebarTileCount: number },
): { cols: number; rows: number } {
  const { w: videoAreaW, h: videoAreaH } = videoContentArea(termW, termH, chatWidth)

  if (options.layout === "grid") {
    const p = adaptivePanelInArea(videoAreaW, videoAreaH, options.participantCount)
    return { cols: p.streamCols, rows: p.streamRows }
  }

  const pinnedStripW = Math.floor(videoAreaW * 0.67)
  const pin = adaptivePanelInArea(pinnedStripW, videoAreaH, 1)
  return { cols: pin.streamCols, rows: pin.streamRows }
}
