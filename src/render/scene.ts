import type { Camera } from '../core/camera'
import type { Scene } from '../core/scene'
import type { CellBounds } from '../core/types'
import type { GlyphAtlas } from './glyphAtlas'
import type { Theme } from './theme'

import { cellSizeAt, visibleBounds } from '../core/camera'
import { levelOfDetail } from './theme'

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

  if (detail === 'block') {
    drawBlocks(ctx, scene, atlas, camera, cellSize, bounds, theme)
    return
  }

  if (detail === 'glyph') {
    drawGrid(ctx, theme, camera, cellSize, bounds, width, height)
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
