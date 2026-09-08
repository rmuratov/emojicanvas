import { describe, expect, it } from 'vitest'

import type { ToolContext } from '../tools/types'

import { createBrushTool } from '../tools/brush'
import { createEraserTool } from '../tools/eraser'
import { createCamera, screenToCell } from './camera'
import { toText } from './export/text'
import { History } from './history'
import { StrokeRecorder } from './operations'
import { Scene } from './scene'

/**
 * Exercises the real modules together, the way the next plan's Editor
 * facade will wire them: no mocks, and every step goes through the same
 * public API a caller outside src/core would use.
 */
describe('engine core integration', () => {
  it('takes a brush stroke from screen coordinates through commit, undo and redo', () => {
    const scene = new Scene()
    const history = new History()
    const recorder = new StrokeRecorder()
    const tool = createBrushTool()
    const camera = createCamera()
    const baseCellSize = 32
    const ctx: ToolContext = { brush: '❤️', recorder, scene }

    const start = screenToCell(camera, baseCellSize, 0, 0)
    const end = screenToCell(camera, baseCellSize, 64, 0)

    tool.onDown(start, ctx)
    tool.onMove(end, ctx)
    tool.onUp(ctx)

    const committed = recorder.commit('brush')

    expect(committed).not.toBeNull()
    if (!committed) throw new Error('expected a committed stroke')

    history.commit(committed.op, committed.inverse)

    expect(scene.get(0, 0)).toBe('❤️')
    expect(scene.get(1, 0)).toBe('❤️')
    expect(scene.get(2, 0)).toBe('❤️')
    expect(scene.size).toBe(3)
    expect(toText(scene)).toBe('❤️❤️❤️')

    expect(history.undo(scene)).toBe(true)
    expect(scene.size).toBe(0)

    expect(history.redo(scene)).toBe(true)
    expect(scene.get(0, 0)).toBe('❤️')
    expect(scene.get(1, 0)).toBe('❤️')
    expect(scene.get(2, 0)).toBe('❤️')
    expect(scene.size).toBe(3)
    expect(toText(scene)).toBe('❤️❤️❤️')
  })

  it('erases drawn cells through commit and restores them on undo', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, '🔥')
    scene.writeCell(1, 0, '🔥')
    scene.writeCell(2, 0, '🔥')

    const history = new History()
    const recorder = new StrokeRecorder()
    const tool = createEraserTool()
    const ctx: ToolContext = { brush: '❤️', recorder, scene }

    tool.onDown({ x: 0, y: 0 }, ctx)
    tool.onMove({ x: 2, y: 0 }, ctx)
    tool.onUp(ctx)

    const committed = recorder.commit('eraser')

    expect(committed).not.toBeNull()
    if (!committed) throw new Error('expected a committed stroke')

    history.commit(committed.op, committed.inverse)

    expect(scene.size).toBe(0)

    expect(history.undo(scene)).toBe(true)
    expect(scene.get(0, 0)).toBe('🔥')
    expect(scene.get(1, 0)).toBe('🔥')
    expect(scene.get(2, 0)).toBe('🔥')
    expect(scene.size).toBe(3)
  })

  it('abandons a rolled-back stroke so the next stroke starts clean', () => {
    const scene = new Scene()
    const recorder = new StrokeRecorder()
    const tool = createBrushTool()
    const ctx: ToolContext = { brush: '🔥', recorder, scene }

    tool.onDown({ x: 0, y: 0 }, ctx)
    tool.onMove({ x: 3, y: 0 }, ctx)

    recorder.rollback(scene)
    tool.onCancel(ctx)

    tool.onDown({ x: 10, y: 10 }, ctx)
    tool.onMove({ x: 12, y: 10 }, ctx)
    tool.onUp(ctx)

    const committed = recorder.commit('brush')

    expect(committed).not.toBeNull()
    expect(scene.size).toBe(3)
    expect(scene.get(10, 10)).toBe('🔥')
    expect(scene.get(11, 10)).toBe('🔥')
    expect(scene.get(12, 10)).toBe('🔥')
    expect(scene.has(0, 0)).toBe(false)
    expect(scene.has(1, 0)).toBe(false)
    expect(scene.has(2, 0)).toBe(false)
    expect(scene.has(3, 0)).toBe(false)
  })
})
