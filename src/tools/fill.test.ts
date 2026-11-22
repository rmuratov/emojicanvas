import { expect, it } from 'vitest'

import { applyOperation, StrokeRecorder } from '../core/operations'
import { Scene } from '../core/scene'
import { createFillTool } from './fill'

it('skips cells already using the brush and does not extend a fill when dragged', () => {
  const scene = new Scene()
  const ctx = { brush: '⭐', recorder: new StrokeRecorder(), scene }
  const tool = createFillTool()
  const seed = { x: 0, y: 0 }

  applyOperation(scene, {
    changes: [
      { value: '⭐', ...seed },
      { value: '🔥', x: 1, y: 0 },
    ],
    label: 'fixture',
  })
  expect(tool.preview(seed, ctx)).toEqual([])
  tool.onDown(seed, ctx)
  tool.onMove({ x: 1, y: 0 }, ctx)
  tool.onCancel(ctx)

  expect(ctx.recorder.commit(tool.id)).toBeNull()
  expect(scene.get(1, 0)).toBe('🔥')
})

it('refuses an oversized region without partially recoloring it', () => {
  const scene = new Scene()
  const ctx = { brush: '⭐', recorder: new StrokeRecorder(), scene }
  const tool = createFillTool()
  const seed = { x: 0, y: 0 }

  applyOperation(scene, {
    changes: Array.from({ length: 50_001 }, (_, x) => ({
      value: '🔥',
      x,
      y: 0,
    })),
    label: 'fixture',
  })

  expect(tool.onDown(seed, ctx)).toContain('too large')
  expect(scene.get(0, 0)).toBe('🔥')
  expect(scene.get(50_000, 0)).toBe('🔥')
  expect(ctx.recorder.commit(tool.id)).toBeNull()
})
