import type { Cell } from '../core/types'
import type { PreviewContext, Tool } from './types'

import { keyOf } from '../core/scene'

const MAX_FILL_CELLS = 50_000
const OPEN_REGION = 'Close the outline before filling empty space.'
const NEIGHBORS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

export function createFillTool(): Tool {
  return {
    id: 'fill',

    onCancel() {},

    onDown(seed, { brush, recorder, scene }) {
      const region = fillRegion(seed, { brush, scene })

      if (typeof region === 'string') return region

      for (const { x, y } of region) {
        recorder.record(scene, x, y, brush)
      }
    },

    onMove() {},
    onUp() {},

    preview(seed, ctx) {
      const region = fillRegion(seed, ctx)

      return typeof region === 'string' ? [] : region
    },
  }
}

function fillRegion(
  seed: Cell,
  { brush, scene }: PreviewContext,
): Cell[] | string {
  const target = scene.get(seed.x, seed.y)

  if (target === brush) return []

  // Blank space on the unbounded canvas can only be filled if enclosed.
  const bounds = target === undefined ? scene.bounds() : null

  if (target === undefined && !bounds) return OPEN_REGION

  const region: Cell[] = [seed]
  const seen = new Set([keyOf(seed.x, seed.y)])

  for (let i = 0; i < region.length; i++) {
    const { x, y } = region[i]

    if (
      bounds &&
      (x <= bounds.minX ||
        x >= bounds.maxX ||
        y <= bounds.minY ||
        y >= bounds.maxY)
    ) {
      return OPEN_REGION
    }

    for (const delta of NEIGHBORS) {
      const next = { x: x + delta.x, y: y + delta.y }
      const key = keyOf(next.x, next.y)

      if (seen.has(key) || scene.get(next.x, next.y) !== target) continue
      if (region.length === MAX_FILL_CELLS)
        return 'This region is too large to fill in one step.'

      seen.add(key)
      region.push(next)
    }
  }

  return region
}
