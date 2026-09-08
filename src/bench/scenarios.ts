import type { Camera } from '../core/camera'
import type { CellChange } from '../core/operations'
import type { Emoji } from '../core/types'
import type { Theme } from '../render/theme'

import { cellSizeAt, createCamera, visibleBounds } from '../core/camera'
import { applyOperation, StrokeRecorder } from '../core/operations'
import { Scene } from '../core/scene'
import { GlyphAtlas } from '../render/glyphAtlas'
import { renderScene } from '../render/scene'
import { DEFAULT_THEME } from '../render/theme'
import { createBrushTool } from '../tools/brush'

export type Viewport = { height: number; width: number }

/**
 * A dozen glyphs rather than one, so the atlas holds a realistic number of
 * buffers and the average-colour cache is exercised the way a real drawing
 * exercises it. One repeated emoji would measure a warmer cache than any
 * user ever gets.
 */
export const BENCH_EMOJI: readonly Emoji[] = [
  '❤️',
  '😀',
  '🌈',
  '🔥',
  '🍕',
  '🐙',
  '⭐',
  '🌊',
  '🎩',
  '🧩',
  '🚀',
  '🥑',
]

export const DESKTOP_VIEWPORT: Viewport = { height: 800, width: 1440 }
/** A common phone in CSS pixels; the device pixel ratio is separate. */
export const PHONE_VIEWPORT: Viewport = { height: 800, width: 390 }

/**
 * A camera whose zoom renders cells at exactly the requested size. The
 * benchmarks sweep cell size rather than zoom, because the levels of detail
 * are expressed in rendered pixels and that is the quantity being tuned.
 */
export function cameraForCellSize(theme: Theme, cellSizePx: number): Camera {
  return { ...createCamera(), zoom: cellSizePx / theme.baseCellSize }
}

/**
 * A context of the given size, scaled for the device pixel ratio exactly as
 * the Editor scales its own canvas — the cost of a phone frame at DPR 3 is
 * the number this whole exercise exists to find out.
 */
export function createSurface(
  viewport: Viewport,
  dpr: number,
): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width * dpr)
  canvas.height = Math.round(viewport.height * dpr)

  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  return ctx
}

/**
 * Every visible cell drawn — the worst case a frame can be asked to render
 * — or, with `drawnCells`, that many cells spread evenly over the same
 * area, which is what a real drawing looks like from far away.
 */
export function filledViewport(
  camera: Camera,
  theme: Theme,
  viewport: Viewport,
  drawnCells?: number,
): Scene {
  const scene = new Scene()
  const bounds = visibleBounds(
    camera,
    theme.baseCellSize,
    viewport.width,
    viewport.height,
  )
  const changes: CellChange[] = []
  const visible =
    (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1)
  const every =
    drawnCells === undefined ? 1 : Math.max(1, Math.floor(visible / drawnCells))

  let i = 0

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      if (i++ % every !== 0) continue

      changes.push({ value: BENCH_EMOJI[i % BENCH_EMOJI.length], x, y })
    }
  }

  // Through an operation, not scene.writeCell: the fixture obeys the same
  // rule the app does, so it can never drift from what the app produces.
  applyOperation(scene, { changes, label: 'bench' })

  return scene
}

/**
 * One full frame of a full screen at the given rendered cell size, ready to
 * be timed. The atlas is warmed by drawing once before returning: the first
 * frame pays for rasterising every glyph, and that cost belongs to a
 * different measurement than the steady-state frame time.
 */
export function frameScenario(options: {
  cellSizePx: number
  dpr?: number
  /** How many cells are actually drawn; every visible one by default. */
  drawnCells?: number
  theme?: Theme
  viewport?: Viewport
}): { cells: number; draw: () => void } {
  const theme = options.theme ?? DEFAULT_THEME
  const viewport = options.viewport ?? DESKTOP_VIEWPORT
  const dpr = options.dpr ?? 1
  const camera = cameraForCellSize(theme, options.cellSizePx)
  const scene = filledViewport(camera, theme, viewport, options.drawnCells)
  const ctx = createSurface(viewport, dpr)
  const atlas = new GlyphAtlas(dpr, theme.fontStack)
  const draw = () =>
    renderScene(ctx, scene, {
      atlas,
      camera,
      height: viewport.height,
      theme,
      width: viewport.width,
    })

  draw()

  return { cells: scene.size, draw }
}

/**
 * A stroke drawn diagonally across the whole screen, redrawing after every
 * pointer step, which is what the app actually does while a finger moves.
 * This measures the interactive path — recording plus redraw — rather than
 * rendering alone, because that is what a user feels as lag.
 */
export function strokeScenario(
  options: {
    dpr?: number
    theme?: Theme
    viewport?: Viewport
  } = {},
): { draw: () => void; steps: number } {
  const theme = options.theme ?? DEFAULT_THEME
  const viewport = options.viewport ?? DESKTOP_VIEWPORT
  const dpr = options.dpr ?? 1
  const camera = createCamera()
  const ctx = createSurface(viewport, dpr)
  const atlas = new GlyphAtlas(dpr, theme.fontStack)
  const cellSize = cellSizeAt(theme.baseCellSize, camera.zoom)
  const steps = Math.round(viewport.width / cellSize)
  const slope = viewport.height / viewport.width
  const tool = createBrushTool()

  const draw = () => {
    // A fresh scene per run: a stroke over cells already holding the brush
    // records nothing and would measure the empty case after the first run.
    const scene = new Scene()
    const recorder = new StrokeRecorder()
    const toolCtx = { brush: BENCH_EMOJI[0], recorder, scene }

    tool.onDown({ x: 0, y: 0 }, toolCtx)

    for (let i = 1; i <= steps; i++) {
      tool.onMove({ x: i, y: Math.round(i * slope) }, toolCtx)
      renderScene(ctx, scene, {
        atlas,
        camera,
        height: viewport.height,
        theme,
        width: viewport.width,
      })
    }

    tool.onUp(toolCtx)
    recorder.commit('bench')
  }

  draw()

  return { draw, steps }
}
