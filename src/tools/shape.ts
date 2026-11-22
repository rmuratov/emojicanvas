import type { Cell } from '../core/types'
import type { Tool } from './types'

import { cellsBetween } from '../core/line'

type Shape = 'ellipse' | 'line' | 'rectangle'

export function createShapeTool(id: Shape): Tool {
  let start: Cell | null = null
  let end: Cell | null = null

  return {
    id,

    onCancel() {
      start = end = null
    },

    onDown(cell, { brush, recorder, scene }) {
      start = end = cell
      recorder.record(scene, cell.x, cell.y, brush)
    },

    onMove(cell, { brush, recorder, scene }) {
      if (!start || (end?.x === cell.x && end.y === cell.y)) return

      end = cell
      recorder.rollback(scene)

      for (const { x, y } of shapeCells(id, start, cell)) {
        recorder.record(scene, x, y, brush)
      }
    },

    onUp() {
      start = end = null
    },

    preview(cell, { brush, scene }) {
      return scene.get(cell.x, cell.y) === brush ? [] : [cell]
    },
  }
}

function* shapeCells(id: Shape, start: Cell, end: Cell): Iterable<Cell> {
  const left = Math.min(start.x, end.x)
  const right = Math.max(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const bottom = Math.max(start.y, end.y)

  if (id === 'line' || left === right || top === bottom) {
    yield* cellsBetween(start, end)
    return
  }

  if (id === 'rectangle') {
    for (let x = left; x <= right; x++) {
      yield { x, y: top }
      yield { x, y: bottom }
    }

    for (let y = top + 1; y < bottom; y++) {
      yield { x: left, y }
      yield { x: right, y }
    }

    return
  }

  const rx = (right - left) / 2
  const ry = (bottom - top) / 2
  const cx = left + rx
  const cy = top + ry

  // Trace both axes so steep portions of a thin ellipse stay connected.
  for (let x = left; x <= right; x++) {
    const dy = ry * Math.sqrt(1 - ((x - cx) / rx) ** 2)

    yield { x, y: Math.round(cy - dy) }
    yield { x, y: Math.round(cy + dy) }
  }

  for (let y = top; y <= bottom; y++) {
    const dx = rx * Math.sqrt(1 - ((y - cy) / ry) ** 2)

    yield { x: Math.round(cx - dx), y }
    yield { x: Math.round(cx + dx), y }
  }
}
