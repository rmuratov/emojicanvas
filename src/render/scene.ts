import type { Camera } from '../core/camera'
import type { Scene } from '../core/scene'
import type { CellBounds } from '../core/types'
import type { GlyphAtlas } from './glyphAtlas'
import type { LevelOfDetail, Theme } from './theme'

import { cellSizeAt, visibleBounds } from '../core/camera'
import { levelOfDetail } from './theme'

/**
 * Scratch space for the sparse block path: a block's colour sums live in
 * `blockSums` as six numbers — red, green, blue, how many cells, and the
 * block's top-left cell — and `blockSlots` maps a block's position in the
 * viewport to the start of its six. Both are module-level and reused rather
 * than allocated per frame, because this runs inside the draw loop, and both
 * are emptied at the start of every frame that uses them. Rendering is
 * synchronous, so there is never a second frame in flight to share them
 * with.
 */
const blockSlots = new Map<number, number>()
const blockSums: number[] = []
const SLOT_SIZE = 6

export type RenderOptions = {
  atlas: GlyphAtlas
  camera: Camera
  /** Viewport height in logical pixels. */
  height: number
  theme: Theme
  /** Viewport width in logical pixels. */
  width: number
}

/**
 * Draws one full frame into the supplied context. Full, but confined to the
 * cells the viewport can actually see, so frame cost follows window size and
 * not the size of the drawing: a scene with a million cells costs the same
 * as one with a hundred.
 *
 * The context is a parameter rather than something this module owns, so that
 * raster export later becomes a call with a different context instead of a
 * second rendering path.
 *
 * Nothing in the loops below allocates — no cellToScreen (it returns a fresh
 * object per call), no closures, no temporaries. At the smallest zoom this
 * loop runs over tens of thousands of cells per frame.
 */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  opts: RenderOptions,
): void {
  const { atlas, camera, height, theme, width } = opts

  ctx.imageSmoothingEnabled = theme.antialias
  ctx.fillStyle = theme.backgroundColor
  ctx.fillRect(0, 0, width, height)

  if (width <= 0 || height <= 0) return

  const cellSize = cellSizeAt(theme.baseCellSize, camera.zoom)
  const bounds = visibleBounds(camera, theme.baseCellSize, width, height)
  const detail = levelOfDetail(theme, cellSize)

  // Whichever side is smaller is the one to walk. Scanning the viewport
  // costs a cell lookup — and the string key it builds — for every visible
  // cell, drawn or not, which zoomed out is over a million of them for a
  // drawing of ten. Walking the scene costs one step per drawn cell instead,
  // so the frame stays bounded by the smaller of the two either way.
  const sparse = scene.size < cellCount(bounds)

  if (detail === 'block') {
    if (sparse) {
      drawSparseBlocks(ctx, scene, atlas, camera, cellSize, bounds, theme)
    } else {
      drawBlocks(ctx, scene, atlas, camera, cellSize, bounds, theme)
    }

    return
  }

  if (detail === 'glyph') {
    drawGrid(ctx, theme, camera, cellSize, bounds, width, height)
  }

  if (sparse) {
    drawSparseCells(ctx, scene, atlas, camera, cellSize, bounds, detail)
    return
  }

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const value = scene.get(x, y)

      if (value === undefined) continue

      const px = x * cellSize - camera.offsetX
      const py = y * cellSize - camera.offsetY

      if (detail === 'glyph') {
        ctx.drawImage(atlas.get(value, cellSize), px, py, cellSize, cellSize)
      } else {
        ctx.fillStyle = atlas.averageColor(value)
        // One pixel of overlap: adjacent fills at a fractional cell size
        // would otherwise leave background-coloured seams between them.
        ctx.fillRect(px, py, cellSize + 1, cellSize + 1)
      }
    }
  }
}

/** How many cells the viewport can see, drawn or not. */
function cellCount(bounds: CellBounds): number {
  return (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1)
}

/**
 * At the smallest zoom levels a single cell is a fraction of a pixel, so
 * cells are merged into blocks big enough to see and each block is filled
 * with the mean colour of what it contains. Without this, zooming out would
 * mean tens of thousands of sub-pixel fills per frame.
 */
function drawBlocks(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  atlas: GlyphAtlas,
  camera: Camera,
  cellSize: number,
  bounds: CellBounds,
  theme: Theme,
): void {
  const span = Math.max(1, Math.ceil(theme.blockLodThresholdPx / cellSize))
  const blockSize = cellSize * span

  for (let by = bounds.minY; by <= bounds.maxY; by += span) {
    for (let bx = bounds.minX; bx <= bounds.maxX; bx += span) {
      let b = 0
      let filled = 0
      let g = 0
      let r = 0

      for (let y = by; y < by + span && y <= bounds.maxY; y++) {
        for (let x = bx; x < bx + span && x <= bounds.maxX; x++) {
          const value = scene.get(x, y)

          if (value === undefined) continue

          const rgb = atlas.averageColorRgb(value)

          filled++
          r += rgb[0]
          g += rgb[1]
          b += rgb[2]
        }
      }

      if (filled === 0) continue

      ctx.fillStyle = `rgb(${Math.round(r / filled)}, ${Math.round(
        g / filled,
      )}, ${Math.round(b / filled)})`
      ctx.fillRect(
        bx * cellSize - camera.offsetX,
        by * cellSize - camera.offsetY,
        blockSize + 1,
        blockSize + 1,
      )
    }
  }
}

/**
 * The grid is redrawn as part of every frame rather than once at startup.
 * The old engine drew it only on clear and then erased pieces of it with
 * every cell fill, which is why grid lines used to disappear as you drew.
 */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  theme: Theme,
  camera: Camera,
  cellSize: number,
  bounds: CellBounds,
  width: number,
  height: number,
): void {
  ctx.beginPath()
  ctx.lineWidth = theme.gridLineWidth
  ctx.strokeStyle = theme.gridColor

  for (let x = bounds.minX; x <= bounds.maxX + 1; x++) {
    // The half-pixel offset puts a one-pixel line on a pixel rather than
    // straddling two, which would render as a two-pixel blur.
    const px = Math.round(x * cellSize - camera.offsetX) + 0.5

    ctx.moveTo(px, 0)
    ctx.lineTo(px, height)
  }

  for (let y = bounds.minY; y <= bounds.maxY + 1; y++) {
    const py = Math.round(y * cellSize - camera.offsetY) + 0.5

    ctx.moveTo(0, py)
    ctx.lineTo(width, py)
  }

  ctx.stroke()
}

/**
 * The block path for a drawing smaller than the viewport: every drawn cell
 * is added to the block it falls in, then each block is filled once. Same
 * blocks, same alignment and same averaged colour as the dense path — only
 * the walk differs.
 */
function drawSparseBlocks(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  atlas: GlyphAtlas,
  camera: Camera,
  cellSize: number,
  bounds: CellBounds,
  theme: Theme,
): void {
  const span = Math.max(1, Math.ceil(theme.blockLodThresholdPx / cellSize))
  const blockSize = cellSize * span
  const columns = Math.ceil((bounds.maxX - bounds.minX + 1) / span)

  blockSlots.clear()
  blockSums.length = 0

  for (const [{ x, y }, value] of scene.entries()) {
    if (x < bounds.minX || x > bounds.maxX) continue
    if (y < bounds.minY || y > bounds.maxY) continue

    const column = Math.floor((x - bounds.minX) / span)
    const row = Math.floor((y - bounds.minY) / span)
    const key = column + row * columns

    let slot = blockSlots.get(key)

    if (slot === undefined) {
      slot = blockSums.length
      blockSlots.set(key, slot)
      blockSums.push(
        0,
        0,
        0,
        0,
        bounds.minX + column * span,
        bounds.minY + row * span,
      )
    }

    const rgb = atlas.averageColorRgb(value)

    blockSums[slot] += rgb[0]
    blockSums[slot + 1] += rgb[1]
    blockSums[slot + 2] += rgb[2]
    blockSums[slot + 3]++
  }

  for (let slot = 0; slot < blockSums.length; slot += SLOT_SIZE) {
    const filled = blockSums[slot + 3]

    ctx.fillStyle = `rgb(${Math.round(blockSums[slot] / filled)}, ${Math.round(
      blockSums[slot + 1] / filled,
    )}, ${Math.round(blockSums[slot + 2] / filled)})`
    ctx.fillRect(
      blockSums[slot + 4] * cellSize - camera.offsetX,
      blockSums[slot + 5] * cellSize - camera.offsetY,
      blockSize + 1,
      blockSize + 1,
    )
  }
}

/**
 * The glyph and colour paths for a drawing smaller than the viewport: one
 * step per drawn cell instead of one lookup per visible cell. Glyphs never
 * overlap, so the order they are drawn in cannot show; colour fills overlap
 * their neighbour by the one pixel that hides the seams, so a differently
 * ordered walk can decide a seam pixel differently — which is invisible, the
 * two colours being those of adjacent cells either way.
 */
function drawSparseCells(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  atlas: GlyphAtlas,
  camera: Camera,
  cellSize: number,
  bounds: CellBounds,
  detail: LevelOfDetail,
): void {
  for (const [{ x, y }, value] of scene.entries()) {
    if (x < bounds.minX || x > bounds.maxX) continue
    if (y < bounds.minY || y > bounds.maxY) continue

    const px = x * cellSize - camera.offsetX
    const py = y * cellSize - camera.offsetY

    if (detail === 'glyph') {
      ctx.drawImage(atlas.get(value, cellSize), px, py, cellSize, cellSize)
    } else {
      ctx.fillStyle = atlas.averageColor(value)
      ctx.fillRect(px, py, cellSize + 1, cellSize + 1)
    }
  }
}
