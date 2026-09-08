import type { Cell } from '../core/types'
import type { Tool } from './types'

import { cellsBetween } from '../core/line'

/**
 * Paints the current brush. Movement between two pointer events is filled in
 * with cellsBetween, so a fast drag leaves a continuous line rather than a
 * dotted trail.
 */
export function createBrushTool(): Tool {
  let last: Cell | null = null

  return {
    id: 'brush',

    onDown(cell, ctx) {
      last = cell
      ctx.recorder.record(ctx.scene, cell.x, cell.y, ctx.brush)
    },

    onMove(cell, ctx) {
      if (!last) return

      for (const step of cellsBetween(last, cell)) {
        ctx.recorder.record(ctx.scene, step.x, step.y, ctx.brush)
      }

      last = cell
    },

    onUp() {
      last = null
    },
  }
}
