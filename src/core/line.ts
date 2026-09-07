import type { Cell } from './types'

/**
 * Клетки на отрезке между двумя точками по алгоритму Брезенхема,
 * включая обе крайние. Нужен, чтобы быстрое движение указателя
 * не оставляло разрывов в линии.
 */
export function cellsBetween(from: Cell, to: Cell): Cell[] {
  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)
  const stepX = from.x < to.x ? 1 : -1
  const stepY = from.y < to.y ? 1 : -1

  let error = dx - dy
  let { x, y } = from

  const cells: Cell[] = []

  for (;;) {
    cells.push({ x, y })

    if (x === to.x && y === to.y) return cells

    const doubled = error * 2

    if (doubled > -dy) {
      error -= dy
      x += stepX
    }

    if (doubled < dx) {
      error += dx
      y += stepY
    }
  }
}
