import { describe, expect, it } from 'vitest'

import {
  cellSizeAt,
  cellToScreen,
  clampZoom,
  createCamera,
  MAX_ZOOM,
  MIN_ZOOM,
  screenToCell,
  visibleBounds,
  zoomAt,
} from './camera'

describe('cellSizeAt', () => {
  it('scales the base cell size by the zoom', () => {
    expect(cellSizeAt(30, 1)).toBe(30)
    expect(cellSizeAt(30, 2)).toBe(60)
    expect(cellSizeAt(30, 0.5)).toBe(15)
  })
})

describe('clampZoom', () => {
  it('keeps the zoom inside its allowed range', () => {
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(100)).toBe(MAX_ZOOM)
    expect(clampZoom(0.0001)).toBe(MIN_ZOOM)
  })
})

describe('screenToCell', () => {
  it('maps the origin to cell 0,0 at rest', () => {
    expect(screenToCell(createCamera(), 30, 0, 0)).toEqual({ x: 0, y: 0 })
  })

  it('keeps a point inside a cell within that cell', () => {
    const camera = createCamera()

    expect(screenToCell(camera, 30, 29, 29)).toEqual({ x: 0, y: 0 })
    expect(screenToCell(camera, 30, 30, 30)).toEqual({ x: 1, y: 1 })
  })

  it('produces negative cells above and left of the origin', () => {
    const camera = createCamera()

    expect(screenToCell(camera, 30, -1, -1)).toEqual({ x: -1, y: -1 })
    expect(screenToCell(camera, 30, -30, -30)).toEqual({ x: -1, y: -1 })
    expect(screenToCell(camera, 30, -31, -31)).toEqual({ x: -2, y: -2 })
  })

  it('accounts for the camera offset', () => {
    const camera = { offsetX: 60, offsetY: 30, zoom: 1 }

    expect(screenToCell(camera, 30, 0, 0)).toEqual({ x: 2, y: 1 })
  })

  it('accounts for the zoom', () => {
    const camera = { offsetX: 0, offsetY: 0, zoom: 2 }

    expect(screenToCell(camera, 30, 59, 0)).toEqual({ x: 0, y: 0 })
    expect(screenToCell(camera, 30, 60, 0)).toEqual({ x: 1, y: 0 })
  })
})

describe('cellToScreen', () => {
  it('returns the top-left corner of the cell', () => {
    expect(cellToScreen(createCamera(), 30, 2, 3)).toEqual({ px: 60, py: 90 })
  })

  it('round-trips with screenToCell', () => {
    const camera = { offsetX: 17, offsetY: -43, zoom: 1.5 }

    for (const cell of [
      { x: 0, y: 0 },
      { x: 7, y: -4 },
      { x: -12, y: 31 },
    ]) {
      const { px, py } = cellToScreen(camera, 30, cell.x, cell.y)

      expect(screenToCell(camera, 30, px, py)).toEqual(cell)
    }
  })

  it('round-trips across a wide sweep of cells, zooms and offsets', () => {
    const zooms = [1.1, 1.3, 1.5, 2.5, 3.7, MIN_ZOOM, MAX_ZOOM]
    const offsets = [0, 17, -43, 100000, -99999.5]
    const cellCoords = [-2000, -1000, -1, 0, 1, 999, 2000]

    const failures: string[] = []

    for (const zoom of zooms) {
      for (const offsetX of offsets) {
        for (const offsetY of offsets) {
          const camera = { offsetX, offsetY, zoom }

          for (const x of cellCoords) {
            for (const y of cellCoords) {
              const { px, py } = cellToScreen(camera, 30, x, y)
              const roundTripped = screenToCell(camera, 30, px, py)

              if (roundTripped.x !== x || roundTripped.y !== y) {
                failures.push(
                  `cell (${x}, ${y}) at zoom ${zoom}, offset (${offsetX}, ${offsetY}): ` +
                    `screen (${px}, ${py}) -> cell (${roundTripped.x}, ${roundTripped.y})`,
                )
              }
            }
          }
        }
      }
    }

    expect(failures).toEqual([])
  })
})

describe('visibleBounds', () => {
  it('covers exactly the cells touching the viewport at rest', () => {
    expect(visibleBounds(createCamera(), 30, 90, 60)).toEqual({
      maxX: 2,
      maxY: 1,
      minX: 0,
      minY: 0,
    })
  })

  it('includes the partially visible cell at the far edge', () => {
    expect(visibleBounds(createCamera(), 30, 91, 61)).toEqual({
      maxX: 3,
      maxY: 2,
      minX: 0,
      minY: 0,
    })
  })

  it('shifts with the camera offset', () => {
    const camera = { offsetX: -60, offsetY: -60, zoom: 1 }

    expect(visibleBounds(camera, 30, 90, 90)).toEqual({
      maxX: 0,
      maxY: 0,
      minX: -2,
      minY: -2,
    })
  })

  it('covers fewer cells when zoomed in', () => {
    const camera = { offsetX: 0, offsetY: 0, zoom: 2 }

    expect(visibleBounds(camera, 30, 120, 120)).toEqual({
      maxX: 1,
      maxY: 1,
      minX: 0,
      minY: 0,
    })
  })

  it('yields a valid single-cell range for a zero-size viewport', () => {
    const bounds = visibleBounds(createCamera(), 30, 0, 0)

    expect(bounds.maxX).toBeGreaterThanOrEqual(bounds.minX)
    expect(bounds.maxY).toBeGreaterThanOrEqual(bounds.minY)
    expect(bounds).toEqual({ maxX: 0, maxY: 0, minX: 0, minY: 0 })
  })

  it('yields a valid range for a zero height', () => {
    const bounds = visibleBounds(createCamera(), 30, 90, 0)

    expect(bounds.maxY).toBeGreaterThanOrEqual(bounds.minY)
    expect(bounds).toEqual({ maxX: 2, maxY: 0, minX: 0, minY: 0 })
  })

  it('yields a valid range for a negative width', () => {
    const bounds = visibleBounds(createCamera(), 30, -10, 90)

    expect(bounds.maxX).toBeGreaterThanOrEqual(bounds.minX)
    expect(bounds).toEqual({ maxX: 0, maxY: 2, minX: 0, minY: 0 })
  })
})

describe('zoomAt', () => {
  it('keeps the anchored point over the same place in the scene', () => {
    const camera = { offsetX: 100, offsetY: 50, zoom: 1 }
    const anchorPx = 200
    const anchorPy = 150

    const worldXBefore = (anchorPx + camera.offsetX) / cellSizeAt(30, camera.zoom)
    const worldYBefore = (anchorPy + camera.offsetY) / cellSizeAt(30, camera.zoom)

    const zoomed = zoomAt(camera, 2, anchorPx, anchorPy)

    const worldXAfter = (anchorPx + zoomed.offsetX) / cellSizeAt(30, zoomed.zoom)
    const worldYAfter = (anchorPy + zoomed.offsetY) / cellSizeAt(30, zoomed.zoom)

    expect(worldXAfter).toBeCloseTo(worldXBefore, 10)
    expect(worldYAfter).toBeCloseTo(worldYBefore, 10)
  })

  it('keeps the anchored point fixed even when the zoom clamps', () => {
    const camera = { offsetX: 100, offsetY: 50, zoom: 1 }
    const anchorPx = 200
    const anchorPy = 150

    for (const factor of [1000, 0.00001]) {
      const worldXBefore =
        (anchorPx + camera.offsetX) / cellSizeAt(30, camera.zoom)
      const worldYBefore =
        (anchorPy + camera.offsetY) / cellSizeAt(30, camera.zoom)

      const zoomed = zoomAt(camera, factor, anchorPx, anchorPy)

      const worldXAfter =
        (anchorPx + zoomed.offsetX) / cellSizeAt(30, zoomed.zoom)
      const worldYAfter =
        (anchorPy + zoomed.offsetY) / cellSizeAt(30, zoomed.zoom)

      expect(worldXAfter).toBeCloseTo(worldXBefore, 10)
      expect(worldYAfter).toBeCloseTo(worldYBefore, 10)
    }
  })

  it('multiplies the zoom by the factor', () => {
    expect(zoomAt(createCamera(), 2, 0, 0).zoom).toBe(2)
  })

  it('refuses to exceed the zoom limits', () => {
    expect(zoomAt(createCamera(), 1000, 0, 0).zoom).toBe(MAX_ZOOM)
    expect(zoomAt(createCamera(), 0.00001, 0, 0).zoom).toBe(MIN_ZOOM)
  })

  it('does not mutate the camera it was given', () => {
    const camera = createCamera()

    zoomAt(camera, 2, 10, 10)

    expect(camera).toEqual({ offsetX: 0, offsetY: 0, zoom: 1 })
  })
})
