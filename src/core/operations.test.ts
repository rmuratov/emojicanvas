import { describe, expect, it } from 'vitest'

import {
  applyOperation,
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
})
