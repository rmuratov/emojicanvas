import { describe, expect, it } from 'vitest'

import { ATLAS_STEPS, GlyphAtlas, nearestAtlasStep } from './glyphAtlas'
import { DEFAULT_THEME } from './theme'

function atlas(): GlyphAtlas {
  return new GlyphAtlas(1, DEFAULT_THEME.fontStack)
}

/** Counts pixels with any opacity, and their centre of mass. */
function opaquePixels(source: CanvasImageSource, size: number) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0)

  const { data } = ctx.getImageData(0, 0, size, size)

  let count = 0
  let sumX = 0
  let sumY = 0

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue

    const pixel = i / 4

    count++
    sumX += pixel % size
    sumY += Math.floor(pixel / size)
  }

  return { centreX: sumX / count, centreY: sumY / count, count }
}

describe('nearestAtlasStep', () => {
  it('returns a step from the fixed list', () => {
    expect(ATLAS_STEPS).toContain(nearestAtlasStep(30))
  })

  it('picks the nearest step rather than rounding down', () => {
    expect(nearestAtlasStep(30)).toBe(32)
  })

  it('clamps a size below the smallest step', () => {
    expect(nearestAtlasStep(3)).toBe(16)
  })

  it('clamps a size above the largest step', () => {
    expect(nearestAtlasStep(4000)).toBe(128)
  })
})

describe('GlyphAtlas', () => {
  it('rasterises a glyph into a non-empty buffer', () => {
    const step = nearestAtlasStep(32)
    const { count } = opaquePixels(atlas().get('❤️', 32), step)

    expect(count).toBeGreaterThan(0)
  })

  it('centres the glyph inside the cell', () => {
    const step = nearestAtlasStep(64)
    const { centreX, centreY } = opaquePixels(atlas().get('❤️', 64), step)

    // Within a tenth of the cell of the middle, in both axes. The old engine
    // needed a hand-tuned per-glyph nudge to get this far, and only for
    // Apple metrics.
    expect(Math.abs(centreX - step / 2)).toBeLessThan(step / 10)
    expect(Math.abs(centreY - step / 2)).toBeLessThan(step / 10)
  })

  it('centres a native emoji as well as one with a variation selector', () => {
    const step = nearestAtlasStep(64)
    const heart = opaquePixels(atlas().get('❤️', 64), step)
    const grin = opaquePixels(atlas().get('😀', 64), step)

    expect(Math.abs(heart.centreY - grin.centreY)).toBeLessThan(step / 10)
  })

  it('keeps the glyph inside the cell bounds', () => {
    const step = nearestAtlasStep(32)
    const canvas = document.createElement('canvas')
    canvas.width = step
    canvas.height = step

    const ctx = canvas.getContext('2d')!
    ctx.drawImage(atlas().get('😀', 32), 0, 0)

    const { data } = ctx.getImageData(0, 0, step, step)

    // No opaque pixel in the outermost row: nothing spills into the
    // neighbouring cell, which is defect 2 in the spec.
    for (let x = 0; x < step; x++) {
      expect(data[(0 * step + x) * 4 + 3]).toBe(0)
      expect(data[((step - 1) * step + x) * 4 + 3]).toBe(0)
    }
  })

  it('reuses the buffer for a repeat request at the same step', () => {
    const instance = atlas()

    expect(instance.get('❤️', 30)).toBe(instance.get('❤️', 31))
  })

  it('rasterises separately for a different step', () => {
    const instance = atlas()

    expect(instance.get('❤️', 16)).not.toBe(instance.get('❤️', 128))
  })

  it('reports a reddish average colour for a red glyph', () => {
    const [r, g, b] = atlas().averageColorRgb('❤️')

    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })

  it('formats the average colour as a CSS rgb string', () => {
    expect(atlas().averageColor('❤️')).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })

  it('returns the same tuple on every call, so the draw loop allocates nothing', () => {
    const instance = atlas()

    expect(instance.averageColorRgb('❤️')).toBe(instance.averageColorRgb('❤️'))
  })

  it('rasterises again after clear', () => {
    const instance = atlas()
    const before = instance.get('❤️', 32)

    instance.clear()

    expect(instance.get('❤️', 32)).not.toBe(before)
  })

  it('scales the buffer by the device pixel ratio', () => {
    const step = nearestAtlasStep(32)
    const buffer = new GlyphAtlas(2, DEFAULT_THEME.fontStack).get(
      '❤️',
      32,
    ) as HTMLCanvasElement

    expect(buffer.width).toBe(step * 2)
  })
})
