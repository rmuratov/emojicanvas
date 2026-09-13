import { describe, expect, it } from 'vitest'

import {
  cameraForCellSize,
  createSurface,
  DESKTOP_VIEWPORT,
  filledViewport,
} from '../bench/scenarios'
import { visibleBounds } from '../core/camera'
import { Scene } from '../core/scene'
import { GlyphAtlas } from './glyphAtlas'
import { renderScene } from './scene'
import { DEFAULT_THEME } from './theme'

/**
 * Counts the drawing calls one frame makes. Frame times vary with the
 * machine and can never gate a build; these counts are the same everywhere,
 * and they are exactly what the levels of detail exist to bound. The way
 * this breaks is quiet — a threshold edited to zero still renders a correct
 * picture, only far slower — so it is worth pinning.
 */
function countingContext(ctx: CanvasRenderingContext2D) {
  const counts = { drawImage: 0, fillRect: 0 }

  const proxy = new Proxy(ctx, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target)

      if (typeof value !== 'function') return value

      return (...args: unknown[]) => {
        if (prop === 'drawImage') counts.drawImage++
        if (prop === 'fillRect') counts.fillRect++

        return (value as (...a: unknown[]) => unknown).apply(target, args)
      }
    },
    set(target, prop, value) {
      Reflect.set(target, prop, value, target)

      return true
    },
  })

  return { counts, ctx: proxy }
}

function drawOneFrame(cellSizePx: number) {
  const camera = cameraForCellSize(DEFAULT_THEME, cellSizePx)
  const scene = filledViewport(camera, DEFAULT_THEME, DESKTOP_VIEWPORT)
  const { counts, ctx } = countingContext(createSurface(DESKTOP_VIEWPORT, 1))

  renderScene(ctx, scene, {
    atlas: new GlyphAtlas(1, DEFAULT_THEME.fontStack),
    camera,
    height: DESKTOP_VIEWPORT.height,
    theme: DEFAULT_THEME,
    width: DESKTOP_VIEWPORT.width,
  })

  return { cells: scene.size, counts }
}

describe('per-frame drawing budget', () => {
  it('draws one glyph per visible cell at the glyph level of detail', () => {
    const { cells, counts } = drawOneFrame(DEFAULT_THEME.baseCellSize)

    expect(counts.drawImage).toBe(cells)
    // Only the background fill: glyphs go through drawImage, not fillRect.
    expect(counts.fillRect).toBe(1)
  })

  it('stops rasterising glyphs below the colour threshold', () => {
    const { cells, counts } = drawOneFrame(
      DEFAULT_THEME.colorLodThresholdPx - 0.5,
    )

    expect(counts.drawImage).toBe(0)
    expect(counts.fillRect).toBe(cells + 1)
  })

  it('paints every block in one image, however many cells there are', () => {
    const { cells, counts } = drawOneFrame(
      DEFAULT_THEME.blockLodThresholdPx / 4,
    )

    // A block is at least blockLodThresholdPx across, so the screen holds
    // tens of thousands of them at this zoom and half a million cells. All
    // of it reaches the canvas as one scaled blit of a one-pixel-per-block
    // buffer, plus the background fill — filling each block separately cost
    // about 8ms of the frame, most of it spent building a colour string per
    // block.
    expect(cells).toBeGreaterThan(500_000)
    expect(counts.drawImage).toBe(1)
    expect(counts.fillRect).toBe(1)
  })
})

/**
 * Counts the cell lookups one frame makes. A lookup builds a string key, so
 * a frame that scans the whole viewport allocates once per visible cell —
 * tens of thousands of times when zoomed out, whether or not anything is
 * drawn there.
 */
function countingScene(scene: Scene) {
  const counts = { get: 0 }

  const proxy = new Proxy(scene, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target)

      if (typeof value !== 'function') return value

      return (...args: unknown[]) => {
        if (prop === 'get') counts.get++

        return (value as (...a: unknown[]) => unknown).apply(target, args)
      }
    },
  })

  return { counts, scene: proxy }
}

function drawSparseFrame(cellSizePx: number, drawnCells: number) {
  const camera = cameraForCellSize(DEFAULT_THEME, cellSizePx)
  const bounds = visibleBounds(
    camera,
    DEFAULT_THEME.baseCellSize,
    DESKTOP_VIEWPORT.width,
    DESKTOP_VIEWPORT.height,
  )
  const visible =
    (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1)
  const { counts, scene } = countingScene(
    filledViewport(camera, DEFAULT_THEME, DESKTOP_VIEWPORT, drawnCells),
  )

  renderScene(createSurface(DESKTOP_VIEWPORT, 1), scene, {
    atlas: new GlyphAtlas(1, DEFAULT_THEME.fontStack),
    camera,
    height: DESKTOP_VIEWPORT.height,
    theme: DEFAULT_THEME,
    width: DESKTOP_VIEWPORT.width,
  })

  return { counts, drawn: scene.size, visible }
}

describe('per-frame scene lookups', () => {
  it('costs what is drawn, not what is visible, at the block level', () => {
    const { counts, visible } = drawSparseFrame(
      DEFAULT_THEME.blockLodThresholdPx / 4,
      1,
    )

    // A screen showing one drawn cell must not pay for the hundred thousand
    // empty ones it can also see.
    expect(visible).toBeGreaterThan(10000)
    expect(counts.get).toBeLessThan(visible / 100)
  })

  it('costs what is drawn, not what is visible, at the colour level', () => {
    const { counts, visible } = drawSparseFrame(
      DEFAULT_THEME.colorLodThresholdPx - 0.5,
      1,
    )

    // The viewport holds thousands of cells and the drawing has one; how
    // many exactly depends on the threshold, which measurement may move.
    expect(visible).toBeGreaterThan(1000)
    expect(counts.get).toBeLessThan(visible / 100)
  })

  it('still scans the viewport when the drawing is bigger than it', () => {
    const { counts, drawn, visible } = drawSparseFrame(
      DEFAULT_THEME.blockLodThresholdPx / 4,
      Number.MAX_SAFE_INTEGER,
    )

    // Scanning the viewport is the cheaper of the two when every visible
    // cell is drawn, and the renderer must still pick it.
    expect(drawn).toBe(visible)
    expect(counts.get).toBe(visible)
  })
})
