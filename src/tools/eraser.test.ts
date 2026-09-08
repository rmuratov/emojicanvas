import { describe, expect, it } from 'vitest'

import type { ToolContext } from './types'

import { StrokeRecorder } from '../core/operations'
import { Scene } from '../core/scene'
import { createEraserTool } from './eraser'

function context(): ToolContext {
  return { brush: '❤️', recorder: new StrokeRecorder(), scene: new Scene() }
}

describe('createEraserTool', () => {
  it('removes the cell where the stroke starts', () => {
    const tool = createEraserTool()
    const ctx = context()
    ctx.scene.writeCell(2, 3, '❤️')

    tool.onDown({ x: 2, y: 3 }, ctx)

    expect(ctx.scene.has(2, 3)).toBe(false)
    expect(ctx.scene.size).toBe(0)
  })

  it('erases a continuous path between pointer events', () => {
    const tool = createEraserTool()
    const ctx = context()

    for (let x = 0; x <= 3; x++) {
      ctx.scene.writeCell(x, 0, '❤️')
    }

    tool.onDown({ x: 0, y: 0 }, ctx)
    tool.onMove({ x: 3, y: 0 }, ctx)

    expect(ctx.scene.size).toBe(0)
  })

  it('ignores the brush entirely', () => {
    const tool = createEraserTool()
    const ctx = context()
    ctx.scene.writeCell(0, 0, '🔥')

    tool.onDown({ x: 0, y: 0 }, ctx)

    expect(ctx.scene.has(0, 0)).toBe(false)
  })

  it('leaves neighbouring cells alone', () => {
    const tool = createEraserTool()
    const ctx = context()
    ctx.scene.writeCell(0, 0, 'a')
    ctx.scene.writeCell(1, 0, 'b')

    tool.onDown({ x: 0, y: 0 }, ctx)

    expect(ctx.scene.get(1, 0)).toBe('b')
  })

  it('does not connect a new stroke to the previous one', () => {
    const tool = createEraserTool()
    const ctx = context()

    for (let x = 0; x <= 5; x++) {
      ctx.scene.writeCell(x, 0, '❤️')
    }

    tool.onDown({ x: 0, y: 0 }, ctx)
    tool.onUp(ctx)
    tool.onDown({ x: 5, y: 0 }, ctx)

    expect(ctx.scene.get(3, 0)).toBe('❤️')
    expect(ctx.scene.size).toBe(4)
  })

  it('does not connect a stroke to a cancelled one after rollback', () => {
    const tool = createEraserTool()
    const ctx = context()

    for (let x = 0; x <= 12; x++) {
      ctx.scene.writeCell(x, 0, '❤️')
    }

    tool.onDown({ x: 0, y: 0 }, ctx)
    tool.onMove({ x: 2, y: 0 }, ctx)
    ctx.recorder.rollback(ctx.scene)
    tool.onCancel(ctx)

    tool.onDown({ x: 10, y: 0 }, ctx)
    tool.onMove({ x: 12, y: 0 }, ctx)

    expect(ctx.scene.get(0, 0)).toBe('❤️')
    expect(ctx.scene.get(1, 0)).toBe('❤️')
    expect(ctx.scene.get(2, 0)).toBe('❤️')
    expect(ctx.scene.has(10, 0)).toBe(false)
    expect(ctx.scene.has(11, 0)).toBe(false)
    expect(ctx.scene.has(12, 0)).toBe(false)
  })
})
