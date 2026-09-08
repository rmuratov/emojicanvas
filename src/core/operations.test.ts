import { describe, expect, it } from 'vitest'

import {
  applyOperation,
  createClearOperation,
  invertOperation,
  StrokeRecorder,
} from './operations'
import { Scene } from './scene'

describe('applyOperation', () => {
  it('writes every change into the scene', () => {
    const scene = new Scene()

    applyOperation(scene, {
      changes: [
        { value: 'a', x: 0, y: 0 },
        { value: 'b', x: 1, y: 1 },
      ],
      label: 'draw',
    })

    expect(scene.get(0, 0)).toBe('a')
    expect(scene.get(1, 1)).toBe('b')
  })

  it('erases where the change carries undefined', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')

    applyOperation(scene, {
      changes: [{ value: undefined, x: 0, y: 0 }],
      label: 'erase',
    })

    expect(scene.has(0, 0)).toBe(false)
  })
})

describe('invertOperation', () => {
  it('captures the state before the operation is applied', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'old')

    const op = {
      changes: [
        { value: 'new', x: 0, y: 0 },
        { value: 'fresh', x: 5, y: 5 },
      ],
      label: 'draw',
    }
    const inverse = invertOperation(scene, op)

    expect(inverse.changes).toEqual([
      { value: 'old', x: 0, y: 0 },
      { value: undefined, x: 5, y: 5 },
    ])
  })

  it('restores the exact previous state when applied after the operation', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'old')
    scene.writeCell(9, 9, 'kept')

    const op = {
      changes: [
        { value: 'new', x: 0, y: 0 },
        { value: 'fresh', x: 5, y: 5 },
      ],
      label: 'draw',
    }
    const inverse = invertOperation(scene, op)

    applyOperation(scene, op)
    applyOperation(scene, inverse)

    expect(scene.get(0, 0)).toBe('old')
    expect(scene.has(5, 5)).toBe(false)
    expect(scene.get(9, 9)).toBe('kept')
    expect(scene.size).toBe(2)
  })
})

describe('createClearOperation', () => {
  it('empties the scene once applied', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')
    scene.writeCell(-3, 4, 'b')

    const op = createClearOperation(scene)
    applyOperation(scene, op)

    expect(scene.size).toBe(0)
    expect(scene.bounds()).toBeNull()
  })

  it('restores every cell exactly when its inverse is applied', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')
    scene.writeCell(-3, 4, 'b')

    const op = createClearOperation(scene)
    const inverse = invertOperation(scene, op)

    applyOperation(scene, op)
    applyOperation(scene, inverse)

    expect(scene.get(0, 0)).toBe('a')
    expect(scene.get(-3, 4)).toBe('b')
    expect(scene.size).toBe(2)
  })
})

describe('StrokeRecorder', () => {
  it('reports whether a cell actually changed', () => {
    const scene = new Scene()
    const recorder = new StrokeRecorder()

    expect(recorder.record(scene, 0, 0, 'a')).toBe(true)
    expect(recorder.record(scene, 0, 0, 'a')).toBe(false)
  })

  it('writes through to the scene immediately', () => {
    const scene = new Scene()
    const recorder = new StrokeRecorder()

    recorder.record(scene, 2, 2, 'a')

    expect(scene.get(2, 2)).toBe('a')
  })

  it('keeps the earliest previous value when a cell is touched twice', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'original')

    const recorder = new StrokeRecorder()
    recorder.record(scene, 0, 0, 'first')
    recorder.record(scene, 0, 0, 'second')

    const committed = recorder.commit('draw')

    expect(committed).not.toBeNull()
    expect(committed!.op.changes).toEqual([{ value: 'second', x: 0, y: 0 }])
    expect(committed!.inverse.changes).toEqual([
      { value: 'original', x: 0, y: 0 },
    ])
  })

  it('returns null when the stroke changed nothing', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')

    const recorder = new StrokeRecorder()
    recorder.record(scene, 0, 0, 'a')

    expect(recorder.commit('draw')).toBeNull()
  })

  it('restores the scene on rollback', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'original')

    const recorder = new StrokeRecorder()
    recorder.record(scene, 0, 0, 'changed')
    recorder.record(scene, 3, 3, 'added')
    recorder.rollback(scene)

    expect(scene.get(0, 0)).toBe('original')
    expect(scene.has(3, 3)).toBe(false)
    expect(scene.size).toBe(1)
  })

  it('returns null when a cell is painted and then painted back to its original value', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'original')

    const recorder = new StrokeRecorder()
    recorder.record(scene, 0, 0, 'x')
    recorder.record(scene, 0, 0, 'original')

    expect(recorder.commit('draw')).toBeNull()
    expect(scene.get(0, 0)).toBe('original')
  })

  it('omits a round-tripped cell from the commit while keeping a genuinely changed one', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a-original')
    scene.writeCell(1, 1, 'b-original')

    const recorder = new StrokeRecorder()
    recorder.record(scene, 0, 0, 'a-changed')
    recorder.record(scene, 1, 1, 'b-changed')
    recorder.record(scene, 1, 1, 'b-original')

    const committed = recorder.commit('draw')

    expect(committed).not.toBeNull()
    expect(committed!.op.changes).toEqual([{ value: 'a-changed', x: 0, y: 0 }])
    expect(committed!.inverse.changes).toEqual([
      { value: 'a-original', x: 0, y: 0 },
    ])
  })

  it('returns null when erasing a cell that was already empty', () => {
    const scene = new Scene()

    const recorder = new StrokeRecorder()
    recorder.record(scene, 0, 0, 'x')
    recorder.record(scene, 0, 0, undefined)

    expect(recorder.commit('erase')).toBeNull()
    expect(scene.has(0, 0)).toBe(false)
  })

  it('starts a fresh stroke after commit', () => {
    const scene = new Scene()
    const recorder = new StrokeRecorder()

    recorder.record(scene, 0, 0, 'a')
    recorder.commit('first')
    recorder.record(scene, 1, 1, 'b')

    const second = recorder.commit('second')

    expect(second!.op.changes).toEqual([{ value: 'b', x: 1, y: 1 }])
  })

  it('starts a fresh stroke after rollback', () => {
    const scene = new Scene()
    const recorder = new StrokeRecorder()

    recorder.record(scene, 0, 0, 'a')
    recorder.rollback(scene)

    expect(recorder.commit('after rollback')).toBeNull()
  })

  it('keys stroke changes the same way Scene keys direct writes, avoiding collisions', () => {
    // 1,23 and 12,3 concatenate to the same digits ("123") under a key
    // format lacking a field separator. Scene guards against that (see
    // the equivalent test in scene.test.ts), and StrokeRecorder must
    // guard against it identically now that both share Scene's `keyOf` —
    // a future divergence between the two encodings would surface here
    // as a stroke change silently clobbering, or being clobbered by, an
    // unrelated cell.
    const scene = new Scene()
    const recorder = new StrokeRecorder()

    recorder.record(scene, 1, 23, 'from stroke')
    scene.writeCell(12, 3, 'direct write')

    expect(scene.get(1, 23)).toBe('from stroke')
    expect(scene.get(12, 3)).toBe('direct write')

    const result = recorder.commit('draw')

    expect(result!.op.changes).toEqual([{ value: 'from stroke', x: 1, y: 23 }])
  })
})
