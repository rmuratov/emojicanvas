import type { Cell } from './types'

/**
 * Cells along the segment between two points, using Bresenham's
 * algorithm and including both endpoints. Needed so that fast pointer
 * movement does not leave gaps in a drawn line.
 *
 * Coordinates are floored to whole cells, matching how a point inside a
 * cell belongs to that cell everywhere else in the system. Without this,
 * fractional coordinates never satisfied the loop's exit condition and
 * hung forever.
 */
export function cellsBetween(from: Cell, to: Cell): Cell[] {
  const start = { x: Math.floor(from.x), y: Math.floor(from.y) }
  const end = { x: Math.floor(to.x), y: Math.floor(to.y) }

  const dx = Math.abs(end.x - start.x)
  const dy = Math.abs(end.y - start.y)
  const stepX = start.x < end.x ? 1 : -1
  const stepY = start.y < end.y ? 1 : -1

  let error = dx - dy
  let { x, y } = start

  const cells: Cell[] = []

  for (;;) {
    cells.push({ x, y })

    if (x === end.x && y === end.y) return cells

    const doubled = error * 2

    if (doubled > -dy) {
      error -= dy
      x += stepX
    }

    if (doubled < dx) {
      error += dx
      y += stepY
    }
  }
}
