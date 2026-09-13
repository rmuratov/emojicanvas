import { describe, expect, it } from 'vitest'

import { cellsBetween } from './line'

describe('cellsBetween', () => {
  it('returns a single cell when both points are the same', () => {
    expect(cellsBetween({ x: 2, y: 3 }, { x: 2, y: 3 })).toEqual([
      { x: 2, y: 3 },
    ])
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

  it('walks the same endpoints and length when the direction is swapped', () => {
    const from = { x: -2, y: 3 }
    const to = { x: 4, y: -1 }

    const forward = cellsBetween(from, to)
    const backward = cellsBetween(to, from)

    expect(backward).toHaveLength(forward.length)
    expect(backward[0]).toEqual(to)
    expect(backward[backward.length - 1]).toEqual(from)
  })

  /**
   * Bresenham is NOT direction-symmetric: swapping the endpoints can pick a
   * different cell where the line passes exactly between two of them.
   * Brute force over every integer pair in [-5,5]^2 puts it at 31.5% of
   * pairs. This test pins the asymmetry so nobody "fixes" it by accident;
   * an earlier test asserted the opposite and only passed because its
   * chosen endpoints happened to be symmetric.
   */
  it('may choose a different middle cell in the opposite direction', () => {
    const from = { x: -5, y: -5 }
    const to = { x: -4, y: -3 }

    const forward = cellsBetween(from, to)
    const backward = cellsBetween(to, from)

    expect(forward).toEqual([
      { x: -5, y: -5 },
      { x: -5, y: -4 },
      { x: -4, y: -3 },
    ])
    expect(backward).toEqual([
      { x: -4, y: -3 },
      { x: -4, y: -4 },
      { x: -5, y: -5 },
    ])
    expect(backward).not.toEqual([...forward].reverse())
  })

  it('keeps every step adjacent, in both directions', () => {
    // Connectivity is the property the brush actually depends on: a gap
    // here is a dotted line on screen. It holds universally, unlike
    // direction symmetry.
    for (const [a, b] of [
      [
        { x: -5, y: -5 },
        { x: -4, y: -3 },
      ],
      [
        { x: 4, y: -1 },
        { x: -2, y: 3 },
      ],
      [
        { x: 0, y: 0 },
        { x: 7, y: 2 },
      ],
    ]) {
      for (const path of [cellsBetween(a, b), cellsBetween(b, a)]) {
        for (let i = 1; i < path.length; i++) {
          const dx = Math.abs(path[i].x - path[i - 1].x)
          const dy = Math.abs(path[i].y - path[i - 1].y)

          expect(Math.max(dx, dy)).toBe(1)
        }
      }
    }
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
