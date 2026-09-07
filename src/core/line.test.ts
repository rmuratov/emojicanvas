import { describe, expect, it } from 'vitest'

import { cellsBetween } from './line'

describe('cellsBetween', () => {
  it('возвращает одну клетку, когда точки совпадают', () => {
    expect(cellsBetween({ x: 2, y: 3 }, { x: 2, y: 3 })).toEqual([
      { x: 2, y: 3 },
    ])
  })

  it('строит горизонтальный отрезок, включая обе точки', () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ])
  })

  it('строит диагональ', () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ])
  })

  it('работает в отрицательных координатах и в обратном направлении', () => {
    const cells = cellsBetween({ x: 0, y: 0 }, { x: -2, y: -1 })

    expect(cells).toEqual([
      { x: 0, y: 0 },
      { x: -1, y: 0 },
      { x: -2, y: -1 },
    ])
    expect(cells[0]).toEqual({ x: 0, y: 0 })
    expect(cells[cells.length - 1]).toEqual({ x: -2, y: -1 })

    for (let i = 1; i < cells.length; i++) {
      expect(Math.abs(cells[i].x - cells[i - 1].x)).toBeLessThanOrEqual(1)
      expect(Math.abs(cells[i].y - cells[i - 1].y)).toBeLessThanOrEqual(1)
    }
  })

  it('не зависает и округляет дробные координаты вниз', () => {
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
