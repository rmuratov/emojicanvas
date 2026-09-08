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
  /**
   * Below this rendered cell size, cells merge into blocks. Measured, not
   * guessed: see the values in DEFAULT_THEME.
   */
  blockLodThresholdPx: number
  /** Below this rendered cell size, glyphs give way to average colour. */
  colorLodThresholdPx: number
  fontStack: string
  gridColor: string
  gridLineWidth: number
}

/**
 * The two thresholds come from `src/render/lod.bench.ts`, run on an M-series
 * MacBook in headless Chromium against the worst case a frame can be asked
 * for: a 1440x800 viewport at device pixel ratio 2 with every visible cell
 * drawn. A desktop window is the binding case, not a phone — at the same
 * cell size it holds 3.7 times as many cells as a 390x800 screen — and the
 * budget is 16.7ms.
 *
 * Glyphs, with the level of detail disabled: 16px cells (4,500 glyphs) took
 * 5.0ms, 14px (5,974) took 11.2ms with frames as long as 19.2ms, and 12px
 * (8,040) took 17.1ms. 16 is the smallest size that holds the budget with
 * margin, so glyphs give way to colour below it.
 *
 * Colour fills, with the block level disabled: 8px cells (18,000 fills) took
 * 4.2ms, 6px (32,160) took 10.6ms, 5px (46,080) took 16.1ms and 4px (72,000)
 * took 25.1ms. 6 is the smallest size that still fits, so cells merge into
 * blocks below it.
 *
 * These are worst-case numbers: a screen where every visible cell is drawn.
 * A real drawing is sparser and costs far less, because the renderer walks
 * whichever is smaller, the drawing or the viewport. A benchmark regression
 * is a reason to investigate, not to raise a threshold.
 */
export const DEFAULT_THEME: Theme = {
  antialias: true,
  backgroundColor: 'white',
  baseCellSize: 30,
  blockLodThresholdPx: 6,
  colorLodThresholdPx: 16,
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
