import { expect, it } from 'vitest'

it('exposes a real 2D context in the browser project', () => {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32

  const ctx = canvas.getContext('2d')
  expect(ctx).not.toBeNull()

  ctx!.fillStyle = 'red'
  ctx!.fillRect(0, 0, 32, 32)

  const [r, g, b, a] = ctx!.getImageData(16, 16, 1, 1).data
  expect([r, g, b, a]).toEqual([255, 0, 0, 255])
})

it('returns actual glyph bounding-box metrics from measureText', () => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = '30px sans-serif'

  const metrics = ctx.measureText('A')

  expect(metrics.actualBoundingBoxAscent).toBeGreaterThan(0)
  expect(metrics.width).toBeGreaterThan(0)
})
