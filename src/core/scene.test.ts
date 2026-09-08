import { describe, expect, it } from 'vitest'

import type { SceneData } from './scene'

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

  it('reports bounds for cells sharing a row', () => {
    const scene = new Scene()
    scene.writeCell(-1, 3, 'a')
    scene.writeCell(4, 3, 'b')

    expect(scene.bounds()).toEqual({ maxX: 4, maxY: 3, minX: -1, minY: 3 })
  })

  it('reports bounds for cells sharing a column', () => {
    const scene = new Scene()
    scene.writeCell(2, -1, 'a')
    scene.writeCell(2, 6, 'b')

    expect(scene.bounds()).toEqual({ maxX: 2, maxY: 6, minX: 2, minY: -1 })
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

  it('survives a serialisation round trip', () => {
    const scene = new Scene()
    scene.writeCell(-3, 4, '❤️')
    scene.writeCell(0, 0, '🔥')

    const restored = Scene.fromJSON(JSON.parse(JSON.stringify(scene.toJSON())))

    expect(restored.size).toBe(2)
    expect(restored.get(-3, 4)).toBe('❤️')
    expect(restored.get(0, 0)).toBe('🔥')
  })

  it('keeps only the valid entries from a payload mixing valid and invalid ones', () => {
    const restored = Scene.fromJSON({
      cells: {
        '1,2': 'a',
        '1,2,3': 'b',
        '1.5,2': 'c',
        '2,3': 'd',
        abc: 'g',
        'abc,def': 'h',
        'Infinity,0': 'e',
        'NaN,0': 'f',
        'zzz,0': '',
      },
    })

    expect(restored.size).toBe(2)
    expect(restored.get(1, 2)).toBe('a')
    expect(restored.get(2, 3)).toBe('d')
  })

  it('normalises a key with surrounding whitespace to its canonical form', () => {
    const restored = Scene.fromJSON({
      cells: {
        '1,2 ': 'a',
        ' 1,2': 'b',
      },
    })

    expect(restored.size).toBe(1)
    expect(restored.get(1, 2)).toBe('b')
  })

  it('yields an empty scene from a payload with only invalid entries', () => {
    const restored = Scene.fromJSON({
      cells: {
        '1': 'a',
        '1,2,3': 'b',
        '1.5,2': 'c',
        'abc,def': 'f',
        'Infinity,0': 'd',
        'NaN,0': 'e',
        'zzz,0': '',
      },
    })

    expect(restored.size).toBe(0)
    expect(restored.bounds()).toBeNull()
  })

  it('yields an empty scene from a null payload instead of throwing', () => {
    const restored = Scene.fromJSON(null as unknown as SceneData)

    expect(restored.size).toBe(0)
    expect(restored.bounds()).toBeNull()
  })

  it('yields an empty scene from a payload missing cells instead of throwing', () => {
    const restored = Scene.fromJSON({} as SceneData)

    expect(restored.size).toBe(0)
    expect(restored.bounds()).toBeNull()
  })

  it('yields an empty scene when cells is not an object', () => {
    const restored = Scene.fromJSON({
      cells: 'not an object',
    } as unknown as SceneData)

    expect(restored.size).toBe(0)
    expect(restored.bounds()).toBeNull()
  })
})
