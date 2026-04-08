/**
 * Matches `gridLayout` in src/ui/video-sizes.ts — used to size/placement of
 * participant tiles like the terminal TUI.
 */
export function gridLayout(participantCount: number): { gridCols: number; gridRows: number } {
  if (participantCount <= 1) return { gridCols: 1, gridRows: 1 }
  if (participantCount <= 2) return { gridCols: 2, gridRows: 1 }
  if (participantCount <= 4) return { gridCols: 2, gridRows: 2 }
  if (participantCount <= 6) return { gridCols: 3, gridRows: 2 }
  return { gridCols: 3, gridRows: Math.ceil(participantCount / 3) }
}
