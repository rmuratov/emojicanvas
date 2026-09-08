/**
 * How a cell is drawn at the current zoom. Below a certain rendered size a
 * glyph is physically indistinguishable, so drawing one is wasted work: the
 * cell becomes a patch of the emoji's average colour, and below that whole
 * blocks of cells collapse into one patch. This is what turns the
 * zoomed-out view into a usable minimap instead of tens of thousands of
 * glyph draws.
 */
export type LevelOfDetail = 'block' | 'color' | 'glyph'

/**
 * Everything the renderer needs to know about appearance, in one place. The
 * planned pixel-art redesign is an edit to this module and the React shell,
 * not to rendering logic.
 */
export type Theme = {
  /**
   * Whether scaled atlas buffers are smoothed. The planned pixel-art
   * redesign turns this off; until then a 32px buffer drawn at 30px wants
   * smoothing.
   */
  antialias: boolean
  backgroundColor: string
  /** Cell size in logical pixels at zoom 1. */
  baseCellSize: number
  /** Below this rendered cell size, cells merge into blocks. */
  blockLodThresholdPx: number
  /** Below this rendered cell size, glyphs give way to average colour. */
  colorLodThresholdPx: number
  fontStack: string
  gridColor: string
  gridLineWidth: number
}

export const DEFAULT_THEME: Theme = {
  antialias: true,
  backgroundColor: 'white',
  baseCellSize: 30,
  blockLodThresholdPx: 4,
  colorLodThresholdPx: 12,
  fontStack:
    '"Twemoji Mozilla", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", "EmojiOne Color", "Android Emoji", sans-serif',
  gridColor: 'darkgrey',
  gridLineWidth: 1,
}

/**
 * Picks the drawing mode for a rendered cell size. Both thresholds are
 * inclusive lower bounds of the *richer* mode, so a cell exactly at
 * `colorLodThresholdPx` still gets a glyph — the cheaper mode starts
 * strictly below the threshold.
 */
export function levelOfDetail(theme: Theme, cellSizePx: number): LevelOfDetail {
  if (cellSizePx < theme.blockLodThresholdPx) return 'block'
  if (cellSizePx < theme.colorLodThresholdPx) return 'color'

  return 'glyph'
}
