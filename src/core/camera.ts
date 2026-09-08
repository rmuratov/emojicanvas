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

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function createCamera(): Camera {
  return { offsetX: 0, offsetY: 0, zoom: 1 }
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
 */
export function visibleBounds(
  camera: Camera,
  baseCellSize: number,
  width: number,
  height: number,
): CellBounds {
  const topLeft = screenToCell(camera, baseCellSize, 0, 0)
  const bottomRight = screenToCell(camera, baseCellSize, width - 1, height - 1)

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
  const zoom = clampZoom(camera.zoom * factor)
  const ratio = zoom / camera.zoom

  return {
    offsetX: (anchorPx + camera.offsetX) * ratio - anchorPx,
    offsetY: (anchorPy + camera.offsetY) * ratio - anchorPy,
    zoom,
  }
}
