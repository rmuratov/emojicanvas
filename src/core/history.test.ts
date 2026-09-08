import { describe, expect, it } from 'vitest'

import { History } from './history'
import { applyOperation, type Operation } from './operations'
import { Scene } from './scene'

function draw(x: number, value: string): Operation {
  return { changes: [{ value, x, y: 0 }], label: 'draw' }
}

function erase(x: number): Operation {
  return { changes: [{ value: undefined, x, y: 0 }], label: 'erase' }
}

describe('History', () => {
  it('has nothing to undo or redo when empty', () => {
    const history = new History()

    expect(history.canRedo).toBe(false)
    expect(history.canUndo).toBe(false)
    expect(history.undo(new Scene())).toBe(false)
    expect(history.redo(new Scene())).toBe(false)
  })

  it('undoes an applied operation', () => {
    const scene = new Scene()
    const history = new History()
    const op = draw(0, 'a')

    applyOperation(scene, op)
    history.commit(op, erase(0))

    expect(history.canUndo).toBe(true)
    expect(history.undo(scene)).toBe(true)
    expect(scene.has(0, 0)).toBe(false)
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(true)
  })

  it('redoes what was undone', () => {
    const scene = new Scene()
    const history = new History()
    const op = draw(0, 'a')

    applyOperation(scene, op)
    history.commit(op, erase(0))
    history.undo(scene)

    expect(history.redo(scene)).toBe(true)
    expect(scene.get(0, 0)).toBe('a')
    expect(history.canRedo).toBe(false)
    expect(history.canUndo).toBe(true)
  })

  it('walks back through several operations in order', () => {
    const scene = new Scene()
    const history = new History()

    for (const [x, value] of [
      [0, 'a'],
      [1, 'b'],
      [2, 'c'],
    ] as const) {
      const op = draw(x, value)
      applyOperation(scene, op)
      history.commit(op, erase(x))
    }

    history.undo(scene)
    history.undo(scene)

    expect(scene.get(0, 0)).toBe('a')
    expect(scene.has(1, 0)).toBe(false)
    expect(scene.has(2, 0)).toBe(false)
  })

  it('drops the redo stack once a new operation is committed', () => {
    const scene = new Scene()
    const history = new History()
    const first = draw(0, 'a')

    applyOperation(scene, first)
    history.commit(first, erase(0))
    history.undo(scene)

    expect(history.canRedo).toBe(true)

    const second = draw(1, 'b')
    applyOperation(scene, second)
    history.commit(second, erase(1))

    expect(history.canRedo).toBe(false)
  })

  it('forgets the oldest operations beyond its limit', () => {
    const scene = new Scene()
    const history = new History(2)

    for (const [x, value] of [
      [0, 'a'],
      [1, 'b'],
      [2, 'c'],
    ] as const) {
      const op = draw(x, value)
      applyOperation(scene, op)
      history.commit(op, erase(x))
    }

    expect(history.undo(scene)).toBe(true)
    expect(history.undo(scene)).toBe(true)
    expect(history.undo(scene)).toBe(false)
    expect(scene.get(0, 0)).toBe('a')
  })

  it('clears both stacks', () => {
    const scene = new Scene()
    const history = new History()
    const op = draw(0, 'a')

    applyOperation(scene, op)
    history.commit(op, erase(0))
    history.undo(scene)

    expect(history.canRedo).toBe(true)

    history.clear()

    expect(history.canRedo).toBe(false)
    expect(history.canUndo).toBe(false)
  })
})
