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

  it('draws the same blocks whether it walks the scene or the viewport', () => {
    // Which walk the renderer picks is decided by scene.size against the
    // number of visible cells, so the same visible drawing plus enough
    // off-screen cells takes the other path and must produce the same
    // picture. 3px cells put this below the block threshold.
    const camera = createCamera()
    camera.zoom = 3 / DEFAULT_THEME.baseCellSize

    const visibleCells = (WIDTH / 3) * (HEIGHT / 3)
    const sparse = new Scene()
    const dense = new Scene()

    // Deliberately not starting on a block boundary: a cluster aligned with
    // one would hide a block drawn at its first cell's coordinates instead
    // of at the block's own.
    for (let y = 1; y < 11; y++) {
      for (let x = 1; x < 11; x++) {
        const emoji = (x + y) % 2 === 0 ? '❤️' : '🌊'

        sparse.writeCell(x, y, emoji)
        dense.writeCell(x, y, emoji)
      }
    }

    // Off to the side, so they cost the dense walk without being seen.
    for (let i = 0; i <= visibleCells; i++) {
      dense.writeCell(1000 + i, 1000, '❤️')
    }

    expect(sparse.size).toBeLessThan(visibleCells)
    expect(dense.size).toBeGreaterThan(visibleCells)

    const bySparseWalk = surface()
    const byViewportScan = surface()

    renderScene(bySparseWalk, sparse, options({ camera }))
    renderScene(byViewportScan, dense, options({ camera }))

    expect(bytes(bySparseWalk)).toEqual(bytes(byViewportScan))
  })

  it('draws the same colour cells whether it walks the scene or the viewport', () => {
    // 6px cells: below the colour threshold, above the block one.
    const camera = createCamera()
    camera.zoom = 6 / DEFAULT_THEME.baseCellSize

    const visibleCells = (WIDTH / 6) * (HEIGHT / 6)
    const sparse = new Scene()
    const dense = new Scene()

    for (let y = 1; y < 6; y++) {
      for (let x = 1; x < 6; x++) {
        const emoji = (x + y) % 2 === 0 ? '❤️' : '🌊'

        sparse.writeCell(x, y, emoji)
        dense.writeCell(x, y, emoji)
      }
    }

    for (let i = 0; i <= visibleCells; i++) {
      dense.writeCell(1000 + i, 1000, '❤️')
    }

    expect(sparse.size).toBeLessThan(visibleCells)
    expect(dense.size).toBeGreaterThan(visibleCells)

    const bySparseWalk = surface()
    const byViewportScan = surface()

    renderScene(bySparseWalk, sparse, options({ camera }))
    renderScene(byViewportScan, dense, options({ camera }))

    expect(bytes(bySparseWalk)).toEqual(bytes(byViewportScan))
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
