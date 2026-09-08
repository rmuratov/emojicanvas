import { describe, expect, it } from 'vitest'

import type { ToolContext } from './types'

import { StrokeRecorder } from '../core/operations'
import { Scene } from '../core/scene'
import { createBrushTool } from './brush'

function context(brush = '❤️'): ToolContext {
  return { brush, recorder: new StrokeRecorder(), scene: new Scene() }
}

describe('createBrushTool', () => {
  it('paints the cell where the stroke starts', () => {
    const tool = createBrushTool()
    const ctx = context()

    tool.onDown({ x: 2, y: 3 }, ctx)

    expect(ctx.scene.get(2, 3)).toBe('❤️')
  })

  it('paints a continuous path between pointer events', () => {
    const tool = createBrushTool()
    const ctx = context()

    tool.onDown({ x: 0, y: 0 }, ctx)
    tool.onMove({ x: 3, y: 0 }, ctx)

    expect(ctx.scene.get(0, 0)).toBe('❤️')
    expect(ctx.scene.get(1, 0)).toBe('❤️')
    expect(ctx.scene.get(2, 0)).toBe('❤️')
    expect(ctx.scene.get(3, 0)).toBe('❤️')
    expect(ctx.scene.size).toBe(4)
  })

  it('does not connect a new stroke to the previous one', () => {
    const tool = createBrushTool()
    const ctx = context()

    tool.onDown({ x: 0, y: 0 }, ctx)
    tool.onUp(ctx)
    tool.onDown({ x: 5, y: 0 }, ctx)

    expect(ctx.scene.size).toBe(2)
    expect(ctx.scene.has(3, 0)).toBe(false)
  })

  it('ignores movement before the stroke started', () => {
    const tool = createBrushTool()
    const ctx = context()

    tool.onMove({ x: 4, y: 4 }, ctx)

    expect(ctx.scene.size).toBe(0)
  })

  it('uses the brush from the context at the time of the event', () => {
    const tool = createBrushTool()
    const ctx = context('🔥')

    tool.onDown({ x: 0, y: 0 }, ctx)

    expect(ctx.scene.get(0, 0)).toBe('🔥')
  })

  it('does not connect a stroke to a cancelled one after rollback', () => {
    const tool = createBrushTool()
    const ctx = context()

    tool.onDown({ x: 0, y: 0 }, ctx)
    tool.onMove({ x: 2, y: 0 }, ctx)
    ctx.recorder.rollback(ctx.scene)
    tool.onCancel(ctx)

    tool.onDown({ x: 10, y: 10 }, ctx)
    tool.onMove({ x: 12, y: 10 }, ctx)

    expect(ctx.scene.size).toBe(3)
    expect(ctx.scene.has(0, 0)).toBe(false)
    expect(ctx.scene.has(1, 0)).toBe(false)
    expect(ctx.scene.has(2, 0)).toBe(false)
    expect(ctx.scene.get(10, 10)).toBe('❤️')
    expect(ctx.scene.get(11, 10)).toBe('❤️')
    expect(ctx.scene.get(12, 10)).toBe('❤️')
  })

  it('leaves one committable operation for the whole stroke', () => {
    const tool = createBrushTool()
    const ctx = context()

    tool.onDown({ x: 0, y: 0 }, ctx)
    tool.onMove({ x: 2, y: 0 }, ctx)
    tool.onUp(ctx)

    const committed = ctx.recorder.commit('brush')

    expect(committed).not.toBeNull()
    expect(committed!.op.changes).toHaveLength(3)
  })
})
