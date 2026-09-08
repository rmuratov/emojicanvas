import { describe, expect, it } from 'vitest'

import type { RenderOptions } from './scene'

import { createCamera } from '../core/camera'
import { Scene } from '../core/scene'
import { GlyphAtlas } from './glyphAtlas'
import { renderScene } from './scene'
import { DEFAULT_THEME } from './theme'

const WIDTH = 120
const HEIGHT = 120

function bytes(ctx: CanvasRenderingContext2D) {
  return Array.from(ctx.getImageData(0, 0, WIDTH, HEIGHT).data)
}

function options(overrides: Partial<RenderOptions> = {}): RenderOptions {
  return {
    atlas: new GlyphAtlas(1, DEFAULT_THEME.fontStack),
    camera: createCamera(),
    height: HEIGHT,
    theme: DEFAULT_THEME,
    width: WIDTH,
    ...overrides,
  }
}

function pixel(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const { data } = ctx.getImageData(x, y, 1, 1)

  return [data[0], data[1], data[2], data[3]]
}

function surface() {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT

  return canvas.getContext('2d')!
}

describe('renderScene', () => {
  it('fills the background across the whole surface', () => {
    const ctx = surface()

    renderScene(ctx, new Scene(), options())

    expect(pixel(ctx, WIDTH - 1, HEIGHT - 1)).toEqual([255, 255, 255, 255])
  })

  it('draws grid lines at the glyph level of detail', () => {
    const ctx = surface()
    const empty = surface()

    renderScene(ctx, new Scene(), options())
    empty.fillStyle = DEFAULT_THEME.backgroundColor
    empty.fillRect(0, 0, WIDTH, HEIGHT)

    // Somewhere on the surface a pixel differs from a plain background fill:
    // that is the grid. The old engine drew it once and then erased pieces
    // of it with every cell fill (defect 3).
    expect(bytes(ctx)).not.toEqual(bytes(empty))
  })

  it('makes a filled cell differ from an empty one', () => {
    const filled = surface()
    const blank = surface()
    const scene = new Scene()
    scene.writeCell(1, 1, '❤️')

    renderScene(filled, scene, options())
    renderScene(blank, new Scene(), options())

    const centre = Math.round(DEFAULT_THEME.baseCellSize * 1.5)

    expect(pixel(filled, centre, centre)).not.toEqual(
      pixel(blank, centre, centre),
    )
  })

  it('leaves no trace of an erased cell after a redraw', () => {
    const ctx = surface()
    const scene = new Scene()

    scene.writeCell(1, 1, '❤️')
    renderScene(ctx, scene, options())

    scene.writeCell(1, 1, undefined)
    renderScene(ctx, scene, options())

    const reference = surface()
    renderScene(reference, new Scene(), options())

    expect(bytes(ctx)).toEqual(bytes(reference))
  })

  it('ignores cells outside the viewport', () => {
    const near = surface()
    const far = surface()
    const withFar = new Scene()

    withFar.writeCell(10_000, 10_000, '❤️')

    renderScene(near, new Scene(), options())
    renderScene(far, withFar, options())

    expect(bytes(far)).toEqual(bytes(near))
  })

  it('draws a cell that is only partly visible at the edge', () => {
    const ctx = surface()
    const blank = surface()
    const scene = new Scene()
    const camera = createCamera()

    // Half a cell scrolled away, so cell (0,0) starts off-screen.
    camera.offsetX = DEFAULT_THEME.baseCellSize / 2
    scene.writeCell(0, 0, '❤️')

    renderScene(ctx, scene, options({ camera }))
    renderScene(blank, new Scene(), options({ camera }))

    expect(bytes(ctx)).not.toEqual(bytes(blank))
  })

  it('switches to average colour below the colour threshold', () => {
    const ctx = surface()
    const scene = new Scene()
    const camera = createCamera()

    scene.writeCell(0, 0, '❤️')
    camera.zoom =
      (DEFAULT_THEME.colorLodThresholdPx - 2) / DEFAULT_THEME.baseCellSize

    renderScene(ctx, scene, options({ camera }))

    const [r, g, b, a] = pixel(ctx, 1, 1)

    expect(a).toBe(255)
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })

  it('draws no grid below the colour threshold', () => {
    const ctx = surface()
    const blank = surface()
    const camera = createCamera()

    camera.zoom =
      (DEFAULT_THEME.colorLodThresholdPx - 2) / DEFAULT_THEME.baseCellSize

    renderScene(ctx, new Scene(), options({ camera }))
    blank.fillStyle = DEFAULT_THEME.backgroundColor
    blank.fillRect(0, 0, WIDTH, HEIGHT)

    expect(bytes(ctx)).toEqual(bytes(blank))
  })

  it('still paints filled cells below the block threshold', () => {
    const ctx = surface()
    const scene = new Scene()
    const camera = createCamera()

    for (let x = 0; x < 40; x++) {
      for (let y = 0; y < 40; y++) {
        scene.writeCell(x, y, '❤️')
      }
    }

    camera.zoom =
      (DEFAULT_THEME.blockLodThresholdPx - 1) / DEFAULT_THEME.baseCellSize

    renderScene(ctx, scene, options({ camera }))

    const [r, g, b, a] = pixel(ctx, 1, 1)

    expect(a).toBe(255)
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })

  it('applies the theme antialiasing flag to the context', () => {
    const ctx = surface()

    ctx.imageSmoothingEnabled = true
    renderScene(
      ctx,
      new Scene(),
      options({ theme: { ...DEFAULT_THEME, antialias: false } }),
    )

    expect(ctx.imageSmoothingEnabled).toBe(false)
  })

  it('survives a zero-sized viewport without throwing', () => {
    const ctx = surface()

    expect(() =>
      renderScene(ctx, new Scene(), options({ height: 0, width: 0 })),
    ).not.toThrow()
  })
})
