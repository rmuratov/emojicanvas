import { describe, expect, it } from 'vitest'

import { cellsBetween } from './line'

describe('cellsBetween', () => {
  it('returns a single cell when both points are the same', () => {
    expect(cellsBetween({ x: 2, y: 3 }, { x: 2, y: 3 })).toEqual([{ x: 2, y: 3 }])
  })

  it('walks a horizontal segment including both endpoints', () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ])
  })

  it('walks a diagonal', () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ])
  })

  it('walks a vertical segment including both endpoints', () => {
    expect(cellsBetween({ x: 2, y: -1 }, { x: 2, y: 2 })).toEqual([
      { x: 2, y: -1 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ])
  })

  it('walks a steep segment where |dy| is greater than |dx|', () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 1, y: 3 })).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
    ])
  })

  it('works with negative coordinates', () => {
    const cells = cellsBetween({ x: 0, y: 0 }, { x: -2, y: -1 })

    expect(cells).toEqual([
      { x: 0, y: 0 },
      { x: -1, y: 0 },
      { x: -2, y: -1 },
    ])

    for (let i = 1; i < cells.length; i++) {
      expect(Math.abs(cells[i].x - cells[i - 1].x)).toBeLessThanOrEqual(1)
      expect(Math.abs(cells[i].y - cells[i - 1].y)).toBeLessThanOrEqual(1)
    }
  })

  it('produces the same cells in reverse order when the endpoints are swapped', () => {
    const from = { x: -2, y: 3 }
    const to = { x: 4, y: -1 }

    const forward = cellsBetween(from, to)
    const backward = cellsBetween(to, from)

    expect(backward).toEqual([...forward].reverse())
  })

  it('floors fractional coordinates instead of hanging', () => {
    const cells = cellsBetween({ x: 0.7, y: 0.2 }, { x: 2.9, y: 1.9 })

    expect(cells).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
    ])
    expect(cells.length).toBeGreaterThan(0)
    expect(Number.isFinite(cells.length)).toBe(true)
  }, 1000)
})
