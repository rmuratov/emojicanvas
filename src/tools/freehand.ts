import type { Cell } from '../core/types'
import type { PreviewContext, Tool, ToolContext } from './types'

import { cellsBetween } from '../core/line'

export function createFreehandTool(id: 'brush' | 'eraser'): Tool {
  let last: Cell | null = null

  function* stampCells(cell: Cell, ctx: PreviewContext): Iterable<Cell> {
    const radius = ((ctx.brushSize ?? 1) - 1) / 2

    for (let y = cell.y - radius; y <= cell.y + radius; y++) {
      for (let x = cell.x - radius; x <= cell.x + radius; x++) {
        yield { x, y }
      }
    }
  }

  function stamp(cell: Cell, ctx: ToolContext) {
    const value = id === 'brush' ? ctx.brush : undefined

    for (const { x, y } of stampCells(cell, ctx)) {
      ctx.recorder.record(ctx.scene, x, y, value)
    }
  }

  return {
    id,

    onCancel() {
      last = null
    },

    onDown(cell, ctx) {
      last = cell
      stamp(cell, ctx)
    },

    onMove(cell, ctx) {
      if (!last || (last.x === cell.x && last.y === cell.y)) return

      for (const step of cellsBetween(last, cell)) {
        stamp(step, ctx)
      }

      last = cell
    },

    onUp() {
      last = null
    },

    preview(cell, ctx) {
      const value = id === 'brush' ? ctx.brush : undefined

      return [...stampCells(cell, ctx)].filter(
        ({ x, y }) => ctx.scene.get(x, y) !== value,
      )
    },
  }
}
