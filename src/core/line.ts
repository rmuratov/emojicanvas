import type { Cell } from './types'

/**
 * Клетки на отрезке между двумя точками по алгоритму Брезенхема,
 * включая обе крайние. Нужен, чтобы быстрое движение указателя
 * не оставляло разрывов в линии.
 *
 * Координаты округляются вниз (Math.floor) до целых клеток — так же,
 * как точка внутри клетки относится к этой клетке в остальной части
 * системы. Без этого нецелые координаты не давали циклу дойти до
 * условия выхода и зависали навсегда.
 */
export function cellsBetween(from: Cell, to: Cell): Cell[] {
  const start = { x: Math.floor(from.x), y: Math.floor(from.y) }
  const end = { x: Math.floor(to.x), y: Math.floor(to.y) }

  const dx = Math.abs(end.x - start.x)
  const dy = Math.abs(end.y - start.y)
  const stepX = start.x < end.x ? 1 : -1
  const stepY = start.y < end.y ? 1 : -1

  let error = dx - dy
  let { x, y } = start

  const cells: Cell[] = []

  for (;;) {
    cells.push({ x, y })

    if (x === end.x && y === end.y) return cells

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
