import { describe, expect, it } from 'vitest'

import { StrokeRecorder } from '../core/operations'
import { Scene } from '../core/scene'
import { createShapeTool } from './shape'

function context() {
  return { brush: '⭐', recorder: new StrokeRecorder(), scene: new Scene() }
}

describe('shape tools', () => {
  it('interpolates a line and ignores repeat movement within the same cell', () => {
    const ctx = context()
    const tool = createShapeTool('line')
    const start = { x: -1, y: 0 }

    tool.onMove({ x: 4, y: 0 }, ctx)
    expect(ctx.scene.size).toBe(0)
    tool.onDown(start, ctx)
    tool.onMove(start, ctx)
    expect(tool.preview(start, ctx)).toEqual([])
    tool.onMove({ x: 2, y: 0 }, ctx)
    tool.onUp(ctx)

    expect([...ctx.scene.entries()].map(([cell]) => cell)).toEqual([
      start,
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ])
  })

  it('draws a hollow ellipse and forgets the gesture on cancellation', () => {
    const ctx = context()
    const tool = createShapeTool('ellipse')

    tool.onDown({ x: 4, y: 4 }, ctx)
    tool.onMove({ x: 0, y: 0 }, ctx)

    for (const [x, y] of [
      [0, 2],
      [4, 2],
      [2, 0],
      [2, 4],
    ]) {
      expect(ctx.scene.get(x, y)).toBe('⭐')
    }
    expect(ctx.scene.get(2, 2)).toBeUndefined()

    ctx.recorder.rollback(ctx.scene)
    tool.onCancel(ctx)
    tool.onMove({ x: 8, y: 8 }, ctx)
    expect(ctx.scene.size).toBe(0)
  })

  it('draws a segment when a shape has just one row or column', () => {
    for (const end of [
      { x: 0, y: 3 },
      { x: 3, y: 0 },
    ]) {
      const ctx = context()
      const tool = createShapeTool('rectangle')

      tool.onDown({ x: 0, y: 0 }, ctx)
      tool.onMove(end, ctx)

      expect(ctx.scene.size).toBe(4)
      expect(ctx.scene.get(end.x, end.y)).toBe('⭐')
    }
  })
})
