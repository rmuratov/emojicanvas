import { describe, expect, it } from 'vitest'

import { Scene } from '../scene'
import { DEFAULT_FILLER, toText } from './text'

describe('toText', () => {
  it('returns an empty string for an empty scene', () => {
    expect(toText(new Scene())).toBe('')
  })

  it('returns just the emoji for a single cell', () => {
    const scene = new Scene()
    scene.writeCell(4, 9, '❤️')

    expect(toText(scene)).toBe('❤️')
  })

  it('trims empty space around the drawing', () => {
    const scene = new Scene()
    scene.writeCell(10, 10, 'a')
    scene.writeCell(11, 10, 'b')

    expect(toText(scene)).toBe('ab')
  })

  it('fills gaps inside the drawing with the filler', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')
    scene.writeCell(2, 0, 'b')

    expect(toText(scene)).toBe(`a${DEFAULT_FILLER}b`)
  })

  it('separates rows with a newline and has no trailing newline', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')
    scene.writeCell(0, 1, 'b')

    expect(toText(scene)).toBe('a\nb')
  })

  it('handles a non-square area, wider than it is tall', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')
    scene.writeCell(1, 0, 'b')
    scene.writeCell(2, 0, 'c')
    scene.writeCell(0, 1, 'd')

    expect(toText(scene)).toBe(`abc\nd${DEFAULT_FILLER}${DEFAULT_FILLER}`)
  })

  it('handles a non-square area, taller than it is wide', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')
    scene.writeCell(0, 1, 'b')
    scene.writeCell(0, 2, 'c')
    scene.writeCell(1, 0, 'd')

    expect(toText(scene)).toBe(
      `ad\nb${DEFAULT_FILLER}\nc${DEFAULT_FILLER}`,
    )
  })

  it('works entirely in negative coordinates', () => {
    const scene = new Scene()
    scene.writeCell(-5, -5, 'a')
    scene.writeCell(-4, -4, 'b')

    expect(toText(scene)).toBe(`a${DEFAULT_FILLER}\n${DEFAULT_FILLER}b`)
  })

  it('accepts a custom filler', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')
    scene.writeCell(2, 0, 'b')

    expect(toText(scene, '.')).toBe('a.b')
  })
})
