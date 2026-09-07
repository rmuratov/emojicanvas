import { describe, expect, it } from 'vitest'

import { Scene } from './scene'

describe('Scene', () => {
  it('starts empty', () => {
    const scene = new Scene()

    expect(scene.size).toBe(0)
    expect(scene.get(0, 0)).toBeUndefined()
    expect(scene.has(0, 0)).toBe(false)
    expect(scene.bounds()).toBeNull()
  })

  it('stores and reads a cell', () => {
    const scene = new Scene()
    scene.writeCell(2, 3, '❤️')

    expect(scene.get(2, 3)).toBe('❤️')
    expect(scene.has(2, 3)).toBe(true)
    expect(scene.size).toBe(1)
  })

  it('treats undefined as erasing the cell', () => {
    const scene = new Scene()
    scene.writeCell(2, 3, '❤️')
    scene.writeCell(2, 3, undefined)

    expect(scene.get(2, 3)).toBeUndefined()
    expect(scene.has(2, 3)).toBe(false)
    expect(scene.size).toBe(0)
  })

  it('supports negative coordinates', () => {
    const scene = new Scene()
    scene.writeCell(-4, -7, '🔥')

    expect(scene.get(-4, -7)).toBe('🔥')
    expect(scene.bounds()).toEqual({ maxX: -4, maxY: -7, minX: -4, minY: -7 })
  })

  it('does not confuse cells whose keys could collide', () => {
    const scene = new Scene()
    scene.writeCell(1, 23, 'a')
    scene.writeCell(12, 3, 'b')

    expect(scene.get(1, 23)).toBe('a')
    expect(scene.get(12, 3)).toBe('b')
    expect(scene.size).toBe(2)
  })

  it('reports bounds spanning a rectangular area', () => {
    const scene = new Scene()
    scene.writeCell(-1, 5, 'a')
    scene.writeCell(4, 2, 'b')

    expect(scene.bounds()).toEqual({ maxX: 4, maxY: 5, minX: -1, minY: 2 })
  })

  it('shrinks bounds after the outermost cell is erased', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')
    scene.writeCell(10, 10, 'b')
    scene.writeCell(10, 10, undefined)

    expect(scene.bounds()).toEqual({ maxX: 0, maxY: 0, minX: 0, minY: 0 })
  })

  it('iterates over filled cells', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')
    scene.writeCell(-2, 7, 'b')

    const entries = [...scene.entries()].sort((l, r) => l[0].x - r[0].x)

    expect(entries).toEqual([
      [{ x: -2, y: 7 }, 'b'],
      [{ x: 0, y: 0 }, 'a'],
    ])
  })

  it('clears every cell', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')
    scene.clear()

    expect(scene.size).toBe(0)
    expect(scene.bounds()).toBeNull()
  })

  it('survives a serialisation round trip', () => {
    const scene = new Scene()
    scene.writeCell(-3, 4, '❤️')
    scene.writeCell(0, 0, '🔥')

    const restored = Scene.fromJSON(JSON.parse(JSON.stringify(scene.toJSON())))

    expect(restored.size).toBe(2)
    expect(restored.get(-3, 4)).toBe('❤️')
    expect(restored.get(0, 0)).toBe('🔥')
  })
})
