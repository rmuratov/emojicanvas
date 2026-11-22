import type { Cell, CellBounds } from './types'

/**
 * offsetX/offsetY are the world-pixel coordinates of the viewport's
 * top-left corner, so a screen point `px` sits at world pixel
 * `px + offsetX`. The canvas is the size of the window, never the size of
 * the drawing, which is what lets the grid be unbounded.
 */
export type Camera = { offsetX: number; offsetY: number; zoom: number }

export const MAX_ZOOM = 4
export const MIN_ZOOM = 0.1

export function cellSizeAt(baseCellSize: number, zoom: number): number {
  return baseCellSize * zoom
}

/** Top-left corner of the given cell, in screen pixels. */
export function cellToScreen(
  camera: Camera,
  baseCellSize: number,
  x: number,
  y: number,
): { px: number; py: number } {
  const cellSize = cellSizeAt(baseCellSize, camera.zoom)

  return {
    px: x * cellSize - camera.offsetX,
    py: y * cellSize - camera.offsetY,
  }
}

export function clampZoom(zoom: number, minZoom = MIN_ZOOM): number {
  return Math.min(MAX_ZOOM, Math.max(minZoom, zoom))
}

export function createCamera(): Camera {
  return { offsetX: 0, offsetY: 0, zoom: 1 }
}

/** Centers the drawing in the viewport with room around its outer cells. */
export function fitBounds(
  bounds: CellBounds,
  baseCellSize: number,
  width: number,
  height: number,
): Camera {
  const columns = bounds.maxX - bounds.minX + 1
  const rows = bounds.maxY - bounds.minY + 1
  const padding = Math.min(24, Math.min(width, height) / 10)
  const zoom = Math.min(
    MAX_ZOOM,
    (width - padding * 2) / (columns * baseCellSize),
    (height - padding * 2) / (rows * baseCellSize),
  )
  const size = cellSizeAt(baseCellSize, zoom)

  return {
    offsetX: (bounds.minX + columns / 2) * size - width / 2,
    offsetY: (bounds.minY + rows / 2) * size - height / 2,
    zoom,
  }
}

/**
 * Cell containing the given screen point. Uses Math.floor, so a point
 * anywhere inside a cell — including in negative coordinates — belongs to
 * that cell.
 */
export function screenToCell(
  camera: Camera,
  baseCellSize: number,
  px: number,
  py: number,
): Cell {
  const cellSize = cellSizeAt(baseCellSize, camera.zoom)

  return {
    x: Math.floor((px + camera.offsetX) / cellSize),
    y: Math.floor((py + camera.offsetY) / cellSize),
  }
}

/**
 * Every cell touching the viewport, including partially visible ones at the
 * far edges. Rendering only this range is what keeps frame cost tied to the
 * window size rather than to the size of the drawing.
 *
 * Width and height are clamped to at least 0 before locating the far edge,
 * so a degenerate viewport (0×0, or a transient negative size during
 * layout) still yields a valid single-cell range instead of inverted
 * bounds.
 */
export function visibleBounds(
  camera: Camera,
  baseCellSize: number,
  width: number,
  height: number,
): CellBounds {
  const topLeft = screenToCell(camera, baseCellSize, 0, 0)
  const bottomRight = screenToCell(
    camera,
    baseCellSize,
    Math.max(0, width - 1),
    Math.max(0, height - 1),
  )

  return {
    maxX: bottomRight.x,
    maxY: bottomRight.y,
    minX: topLeft.x,
    minY: topLeft.y,
  }
}

/**
 * Scales around a fixed screen point: whatever part of the scene sits under
 * the cursor or the pinch centre stays under it. Returns a new camera.
 */
export function zoomAt(
  camera: Camera,
  factor: number,
  anchorPx: number,
  anchorPy: number,
): Camera {
  // Fitting a large drawing can go below MIN_ZOOM. Zooming back in from
  // that view still advances by the requested factor.
  const zoom = clampZoom(camera.zoom * factor, Math.min(MIN_ZOOM, camera.zoom))
  const ratio = zoom / camera.zoom

  return {
    offsetX: (anchorPx + camera.offsetX) * ratio - anchorPx,
    offsetY: (anchorPy + camera.offsetY) * ratio - anchorPy,
    zoom,
  }
}
