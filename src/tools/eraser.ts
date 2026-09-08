import type { Cell } from '../core/types'
import type { Tool } from './types'

import { cellsBetween } from '../core/line'

/**
 * Removes cells. Erasing is deleting a key, not painting a filler: the
 * filler exists only in the text export, so there is no "erasing mode" to
 * track anywhere in the model.
 */
export function createEraserTool(): Tool {
  let last: Cell | null = null

  return {
    id: 'eraser',

    onCancel() {
      last = null
    },

    onDown(cell, ctx) {
      last = cell
      ctx.recorder.record(ctx.scene, cell.x, cell.y, undefined)
    },

    onMove(cell, ctx) {
      if (!last) return

      for (const step of cellsBetween(last, cell)) {
        ctx.recorder.record(ctx.scene, step.x, step.y, undefined)
      }

      last = cell
    },

    onUp() {
      last = null
    },
  }
}
