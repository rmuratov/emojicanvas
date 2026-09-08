import type { Camera } from '../core/camera'
import type { Scene } from '../core/scene'
import type { CellBounds } from '../core/types'
import type { GlyphAtlas } from './glyphAtlas'
import type { LevelOfDetail, Theme } from './theme'

import { cellSizeAt, visibleBounds } from '../core/camera'
import { levelOfDetail } from './theme'

/**
 * Scratch space for the block level of detail, module-level and reused
 * rather than allocated per frame, because this runs inside the draw loop.
 * `blockSums` holds four numbers per block — red, green, blue and how many
 * cells were added — indexed by the block's position in the viewport, and
 * the canvas holds one pixel per block, which is blitted to the screen in a
 * single scaled drawImage. Rendering is synchronous, so there is never a
 * second frame in flight to share any of it with.
 */
const BLOCK_STRIDE = 4

let blockCanvas: HTMLCanvasElement | null = null
let blockCtx: CanvasRenderingContext2D | null = null
let blockImage: ImageData | null = null
let blockSums = new Uint32Array(0)

/**
 * The part of the block grid that anything was drawn into, in block
 * coordinates. Only this rectangle is written and blitted: a small drawing
 * on a zoomed-out screen would otherwise pay for a screen-sized blit of
 * mostly transparent pixels.
 */
let filledMaxColumn = -1
let filledMaxRow = -1
let filledMinColumn = 0
let filledMinRow = 0

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
    drawBlocks(ctx, scene, atlas, camera, cellSize, bounds, theme, sparse)
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

/** Adds one drawn cell's colour to the block it falls in. */
function addToBlock(
  atlas: GlyphAtlas,
  value: string,
  x: number,
  y: number,
  bounds: CellBounds,
  span: number,
  columns: number,
): void {
  const column = Math.floor((x - bounds.minX) / span)
  const row = Math.floor((y - bounds.minY) / span)
  const sum = (column + row * columns) * BLOCK_STRIDE
  const rgb = atlas.averageColorRgb(value)

  blockSums[sum] += rgb[0]
  blockSums[sum + 1] += rgb[1]
  blockSums[sum + 2] += rgb[2]
  blockSums[sum + 3]++

  if (column < filledMinColumn) filledMinColumn = column
  if (column > filledMaxColumn) filledMaxColumn = column
  if (row < filledMinRow) filledMinRow = row
  if (row > filledMaxRow) filledMaxRow = row
}

/**
 * The one-pixel-per-block buffer, grown to fit and cleared. Null only if the
 * grid is degenerate, which a zero-sized viewport already rules out before
 * any of this runs.
 */
function blockBuffer(columns: number, rows: number): ImageData | null {
  if (columns <= 0 || rows <= 0) return null

  blockCanvas ??= document.createElement('canvas')

  if (blockCanvas.width !== columns || blockCanvas.height !== rows) {
    blockCanvas.width = columns
    blockCanvas.height = rows
    blockCtx = blockCanvas.getContext('2d')
    blockImage = null
  }

  blockCtx ??= blockCanvas.getContext('2d')

  if (!blockCtx) return null

  if (!blockImage) {
    blockImage = blockCtx.createImageData(columns, rows)
  } else {
    blockImage.data.fill(0)
  }

  return blockImage
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
 *
 * The blocks are painted as one image rather than as one fill each: a
 * pixel per block goes into a buffer the size of the block grid, and a
 * single scaled drawImage puts it on screen. Filling them individually cost
 * about 8ms of a 16ms frame on a full screen at minimum zoom, most of it
 * spent building and parsing a `rgb(...)` string for every one of thirty-odd
 * thousand blocks. Nearest-neighbour scaling keeps each block a flat colour,
 * and one contiguous image cannot show the seams that made the individual
 * fills overlap by a pixel.
 *
 * `sparse` picks which side to walk: the scene's own cells when the drawing
 * is smaller than the viewport, the viewport when it is not. Both fill the
 * same sums and produce the same image.
 *
 * The blit costs what it covers, not what was drawn into it, which is the
 * one place this is slower than a fill per block: five hundred cells
 * scattered over a whole zoomed-out screen make the filled rectangle the
 * screen, and cost 0.62ms against 0.22ms. The same five hundred cells in one
 * patch — what a drawing actually looks like — cost 0.11ms against 0.13ms,
 * and a full screen costs 8.6ms against 15.7ms. The trade is deliberate:
 * the case that got slower is 4% of the frame budget and the case that got
 * faster was the whole of it. Both shapes are in `lod.bench.ts` so the trade
 * stays visible.
 */
function drawBlocks(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  atlas: GlyphAtlas,
  camera: Camera,
  cellSize: number,
  bounds: CellBounds,
  theme: Theme,
  sparse: boolean,
): void {
  const span = Math.max(1, Math.ceil(theme.blockLodThresholdPx / cellSize))
  const blockSize = cellSize * span
  const columns = Math.ceil((bounds.maxX - bounds.minX + 1) / span)
  const rows = Math.ceil((bounds.maxY - bounds.minY + 1) / span)
  const image = blockBuffer(columns, rows)

  if (!image) return

  if (blockSums.length < columns * rows * BLOCK_STRIDE) {
    blockSums = new Uint32Array(columns * rows * BLOCK_STRIDE)
  } else {
    blockSums.fill(0, 0, columns * rows * BLOCK_STRIDE)
  }

  filledMinColumn = columns
  filledMinRow = rows
  filledMaxColumn = -1
  filledMaxRow = -1

  if (sparse) {
    for (const [{ x, y }, value] of scene.entries()) {
      if (x < bounds.minX || x > bounds.maxX) continue
      if (y < bounds.minY || y > bounds.maxY) continue

      addToBlock(atlas, value, x, y, bounds, span, columns)
    }
  } else {
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const value = scene.get(x, y)

        if (value === undefined) continue

        addToBlock(atlas, value, x, y, bounds, span, columns)
      }
    }
  }

  // Nothing drawn anywhere in view: no buffer to write and nothing to blit.
  if (filledMaxColumn < filledMinColumn) return

  const pixels = image.data
  const width = filledMaxColumn - filledMinColumn + 1
  const height = filledMaxRow - filledMinRow + 1

  for (let row = filledMinRow; row <= filledMaxRow; row++) {
    for (let column = filledMinColumn; column <= filledMaxColumn; column++) {
      const block = column + row * columns
      const sum = block * BLOCK_STRIDE
      const filled = blockSums[sum + 3]

      if (filled === 0) continue

      const pixel = block * 4

      pixels[pixel] = Math.round(blockSums[sum] / filled)
      pixels[pixel + 1] = Math.round(blockSums[sum + 1] / filled)
      pixels[pixel + 2] = Math.round(blockSums[sum + 2] / filled)
      pixels[pixel + 3] = 255
    }
  }

  // Only the part of the grid that holds anything: a small drawing on a
  // zoomed-out screen would otherwise pay for a screen-sized blit of mostly
  // transparent pixels.
  blockCtx!.putImageData(
    image,
    0,
    0,
    filledMinColumn,
    filledMinRow,
    width,
    height,
  )

  const smoothing = ctx.imageSmoothingEnabled

  // Off, or the browser would blur every block into its neighbours; the
  // whole point of a block is that it is one flat colour.
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    blockCanvas!,
    filledMinColumn,
    filledMinRow,
    width,
    height,
    (bounds.minX + filledMinColumn * span) * cellSize - camera.offsetX,
    (bounds.minY + filledMinRow * span) * cellSize - camera.offsetY,
    width * blockSize,
    height * blockSize,
  )
  ctx.imageSmoothingEnabled = smoothing
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
