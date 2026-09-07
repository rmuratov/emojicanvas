# Ядро движка — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Построить чистое ядро редактора — сцену, обратимые операции, историю отмены,
камеру, текстовый экспорт и инструменты — полностью покрытое юнит-тестами и не знающее
ни про DOM, ни про canvas, ни про React.

**Architecture:** Разреженное хранилище нарисованных клеток на бесконечном поле;
единственный путь изменения — операции, каждая из которых умеет строить свою инверсию;
поверх них стек отмены. Камера отвечает за перевод экранных координат в координаты клеток
и обратно. Инструменты превращают события указателя в изменения сцены. Ни один модуль
этого плана не импортирует ничего из браузера.

**Tech Stack:** TypeScript 5.9, Vitest 5 (проект `node`, окружение без DOM).

**Spec:** `docs/superpowers/specs/2026-09-07-foundation-design.md`

**Состояние работ:** `docs/superpowers/PROGRESS.md`

## Global Constraints

- **Весь код на английском** — идентификаторы, комментарии, имена тестов, сообщения
  коммитов. Этот план написан по-русски; ничто из него не копируется в код дословно,
  кроме блоков кода, которые уже написаны по-английски.
- Ветка **`foundation`**. Коммиты разрешены, пуш запрещён, `main` не трогать.
- `npm run lint` проходит с `--max-warnings 0`; `npm test` и `npm run build` проходят.
- Prettier: без точек с запятой, одинарные кавычки, ширина 80, `arrowParens: 'avoid'`,
  `trailingComma: 'all'`.
- `eslint-plugin-perfectionist` в режиме natural: ключи объектов и типов, члены
  интерфейсов, импорты и экспорты сортируются естественным порядком. `sort-classes`
  отключён, поэтому порядок членов класса свободный. Ключи объектов и типов в блоках
  кода этого плана уже отсортированы — не переставляйте их.
- **Порядок импортов в плане не выверен.** Правило сортировки импортов зависит от того,
  как perfectionist группирует `import type` относительно обычных импортов, и проверить
  это можно только запуском. Поэтому после создания каждого файла выполняйте
  `npx eslint src --fix` и коммитьте уже исправленный вариант. Если автофиксом порядок
  не исправляется, значит дело не в сортировке — читайте сообщение линтера.
- **Ноль обращений к DOM и браузерным API** во всём, что создаётся этим планом. Никаких
  `window`, `document`, `canvas`, `performance`. Тесты идут в node-проекте Vitest.
- Не трогать `src/lib/EmojiCanvas.ts`, `src/hooks/`, `src/components/` — старый движок
  живёт до плана 3, который его заменит. Приложение в браузере после этого плана
  выглядит и работает ровно как сейчас.
- Существующие файлы `src/core/types.ts` и `src/core/line.ts` уже написаны и
  протестированы. Использовать их, не переписывать.

## Уже существующий контракт

```ts
// src/core/types.ts
export type Cell = { x: number; y: number }
export type CellBounds = { maxX: number; maxY: number; minX: number; minY: number }
export type Emoji = string

// src/core/line.ts
export function cellsBetween(from: Cell, to: Cell): Cell[]
```

`cellsBetween` возвращает клетки на отрезке по Брезенхему, включая обе крайние точки,
и округляет координаты вниз.

## Структура файлов

| Файл | Ответственность |
|---|---|
| `src/core/scene.ts` | Разреженное хранилище нарисованных клеток, границы, сериализация |
| `src/core/operations.ts` | Тип операции, применение, инверсия, накопитель мазка |
| `src/core/history.ts` | Стек отмены и повтора поверх операций |
| `src/core/camera.ts` | Экран ↔ клетки, масштаб, видимый диапазон |
| `src/core/export/text.ts` | Сцена → текст с обрезкой по границам и филлером |
| `src/tools/types.ts` | Интерфейс инструмента и его контекст |
| `src/tools/brush.ts` | Инструмент «кисть» |
| `src/tools/eraser.ts` | Инструмент «ластик» |

Каждому файлу — свой файл тестов рядом, с суффиксом `.test.ts`.

---

### Task 1: Scene — разреженное хранилище

**Files:**
- Create: `src/core/scene.ts`
- Test: `src/core/scene.test.ts`

**Interfaces:**
- Consumes: `Cell`, `CellBounds`, `Emoji` из `src/core/types.ts`
- Produces:
  ```ts
  export type SceneData = { cells: Record<string, Emoji> }
  export class Scene {
    get size(): number
    bounds(): CellBounds | null
    clear(): void
    entries(): IterableIterator<[Cell, Emoji]>
    get(x: number, y: number): Emoji | undefined
    has(x: number, y: number): boolean
    static fromJSON(data: SceneData): Scene
    toJSON(): SceneData
    writeCell(x: number, y: number, value: Emoji | undefined): void
  }
  ```
  `writeCell` — низкоуровневая запись, предназначенная только для `operations.ts`.
  Остальной код читает сцену, но не пишет в неё напрямую.

- [ ] **Step 1: Написать падающий тест**

Создать `src/core/scene.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { Scene } from './scene'

describe('Scene', () => {
  it('starts empty', () => {
    const scene = new Scene()

    expect(scene.size).toBe(0)
    expect(scene.get(0, 0)).toBeUndefined()
    expect(scene.has(0, 0)).toBe(false)
    expect(scene.bounds()).toBeNull()
  })

  it('stores and reads a cell', () => {
    const scene = new Scene()
    scene.writeCell(2, 3, '❤️')

    expect(scene.get(2, 3)).toBe('❤️')
    expect(scene.has(2, 3)).toBe(true)
    expect(scene.size).toBe(1)
  })

  it('treats undefined as erasing the cell', () => {
    const scene = new Scene()
    scene.writeCell(2, 3, '❤️')
    scene.writeCell(2, 3, undefined)

    expect(scene.get(2, 3)).toBeUndefined()
    expect(scene.has(2, 3)).toBe(false)
    expect(scene.size).toBe(0)
  })

  it('supports negative coordinates', () => {
    const scene = new Scene()
    scene.writeCell(-4, -7, '🔥')

    expect(scene.get(-4, -7)).toBe('🔥')
    expect(scene.bounds()).toEqual({ maxX: -4, maxY: -7, minX: -4, minY: -7 })
  })

  it('does not confuse cells whose keys could collide', () => {
    const scene = new Scene()
    scene.writeCell(1, 23, 'a')
    scene.writeCell(12, 3, 'b')

    expect(scene.get(1, 23)).toBe('a')
    expect(scene.get(12, 3)).toBe('b')
    expect(scene.size).toBe(2)
  })

  it('reports bounds spanning a rectangular area', () => {
    const scene = new Scene()
    scene.writeCell(-1, 5, 'a')
    scene.writeCell(4, 2, 'b')

    expect(scene.bounds()).toEqual({ maxX: 4, maxY: 5, minX: -1, minY: 2 })
  })

  it('shrinks bounds after the outermost cell is erased', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')
    scene.writeCell(10, 10, 'b')
    scene.writeCell(10, 10, undefined)

    expect(scene.bounds()).toEqual({ maxX: 0, maxY: 0, minX: 0, minY: 0 })
  })

  it('iterates over filled cells', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')
    scene.writeCell(-2, 7, 'b')

    const entries = [...scene.entries()].sort((l, r) => l[0].x - r[0].x)

    expect(entries).toEqual([
      [{ x: -2, y: 7 }, 'b'],
      [{ x: 0, y: 0 }, 'a'],
    ])
  })

  it('clears every cell', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')
    scene.clear()

    expect(scene.size).toBe(0)
    expect(scene.bounds()).toBeNull()
  })

  it('survives a serialisation round trip', () => {
    const scene = new Scene()
    scene.writeCell(-3, 4, '❤️')
    scene.writeCell(0, 0, '🔥')

    const restored = Scene.fromJSON(JSON.parse(JSON.stringify(scene.toJSON())))

    expect(restored.size).toBe(2)
    expect(restored.get(-3, 4)).toBe('❤️')
    expect(restored.get(0, 0)).toBe('🔥')
  })
})
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test`
Expected: FAIL — модуль `./scene` не найден.

- [ ] **Step 3: Реализовать Scene**

Создать `src/core/scene.ts`:

```ts
import type { Cell, CellBounds, Emoji } from './types'

export type SceneData = { cells: Record<string, Emoji> }

function keyOf(x: number, y: number): string {
  return `${x},${y}`
}

function parseKey(key: string): Cell {
  const comma = key.indexOf(',')

  return {
    x: Number(key.slice(0, comma)),
    y: Number(key.slice(comma + 1)),
  }
}

/**
 * Sparse storage for an unbounded grid: a key exists only where a cell has
 * been drawn. There is no canvas size and no filler — an absent key simply
 * means "empty", and coordinates may be any integers, including negative.
 */
export class Scene {
  private cells = new Map<string, Emoji>()

  get size(): number {
    return this.cells.size
  }

  /**
   * Smallest rectangle containing every filled cell, or null when the scene
   * is empty. Computed on demand rather than maintained incrementally,
   * because erasing an outermost cell would force a full recount anyway.
   */
  bounds(): CellBounds | null {
    if (this.cells.size === 0) return null

    let maxX = -Infinity
    let maxY = -Infinity
    let minX = Infinity
    let minY = Infinity

    for (const key of this.cells.keys()) {
      const { x, y } = parseKey(key)

      if (x > maxX) maxX = x
      if (x < minX) minX = x
      if (y > maxY) maxY = y
      if (y < minY) minY = y
    }

    return { maxX, maxY, minX, minY }
  }

  clear(): void {
    this.cells.clear()
  }

  *entries(): IterableIterator<[Cell, Emoji]> {
    for (const [key, value] of this.cells) {
      yield [parseKey(key), value]
    }
  }

  get(x: number, y: number): Emoji | undefined {
    return this.cells.get(keyOf(x, y))
  }

  has(x: number, y: number): boolean {
    return this.cells.has(keyOf(x, y))
  }

  static fromJSON(data: SceneData): Scene {
    const scene = new Scene()

    for (const [key, value] of Object.entries(data.cells)) {
      scene.cells.set(key, value)
    }

    return scene
  }

  toJSON(): SceneData {
    return { cells: Object.fromEntries(this.cells) }
  }

  /**
   * Low-level write. Only operations.ts and StrokeRecorder call this —
   * every other consumer treats the scene as read-only, so that undo can
   * rely on every change having passed through an operation.
   */
  writeCell(x: number, y: number, value: Emoji | undefined): void {
    const key = keyOf(x, y)

    if (value === undefined) {
      this.cells.delete(key)
      return
    }

    this.cells.set(key, value)
  }
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS — 7 прежних тестов плюс 10 новых.

- [ ] **Step 5: Проверить линт**

Run: `npm run lint`
Expected: проходит без предупреждений.

- [ ] **Step 6: Commit**

```bash
git add src/core/scene.ts src/core/scene.test.ts
git commit -m "feat: add sparse Scene storage for the unbounded grid"
```

---

### Task 2: Operations — обратимые изменения

**Files:**
- Create: `src/core/operations.ts`
- Test: `src/core/operations.test.ts`

**Interfaces:**
- Consumes: `Scene` и его `writeCell`/`get` из `src/core/scene.ts`; `Emoji` из
  `src/core/types.ts`
- Produces:
  ```ts
  export type CellChange = { value: Emoji | undefined; x: number; y: number }
  export type Operation = { changes: readonly CellChange[]; label: string }

  export function applyOperation(scene: Scene, op: Operation): void
  export function invertOperation(scene: Scene, op: Operation): Operation

  export class StrokeRecorder {
    commit(label: string): null | { inverse: Operation; op: Operation }
    record(scene: Scene, x: number, y: number, value: Emoji | undefined): boolean
    rollback(scene: Scene): void
  }
  ```
  `invertOperation` читает состояние сцены **до** применения операции.

- [ ] **Step 1: Написать падающий тест**

Создать `src/core/operations.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  applyOperation,
  invertOperation,
  StrokeRecorder,
} from './operations'
import { Scene } from './scene'

describe('applyOperation', () => {
  it('writes every change into the scene', () => {
    const scene = new Scene()

    applyOperation(scene, {
      changes: [
        { value: 'a', x: 0, y: 0 },
        { value: 'b', x: 1, y: 1 },
      ],
      label: 'draw',
    })

    expect(scene.get(0, 0)).toBe('a')
    expect(scene.get(1, 1)).toBe('b')
  })

  it('erases where the change carries undefined', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')

    applyOperation(scene, {
      changes: [{ value: undefined, x: 0, y: 0 }],
      label: 'erase',
    })

    expect(scene.has(0, 0)).toBe(false)
  })
})

describe('invertOperation', () => {
  it('captures the state before the operation is applied', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'old')

    const op = {
      changes: [
        { value: 'new', x: 0, y: 0 },
        { value: 'fresh', x: 5, y: 5 },
      ],
      label: 'draw',
    }
    const inverse = invertOperation(scene, op)

    expect(inverse.changes).toEqual([
      { value: 'old', x: 0, y: 0 },
      { value: undefined, x: 5, y: 5 },
    ])
  })

  it('restores the exact previous state when applied after the operation', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'old')
    scene.writeCell(9, 9, 'kept')

    const op = {
      changes: [
        { value: 'new', x: 0, y: 0 },
        { value: 'fresh', x: 5, y: 5 },
      ],
      label: 'draw',
    }
    const inverse = invertOperation(scene, op)

    applyOperation(scene, op)
    applyOperation(scene, inverse)

    expect(scene.get(0, 0)).toBe('old')
    expect(scene.has(5, 5)).toBe(false)
    expect(scene.get(9, 9)).toBe('kept')
    expect(scene.size).toBe(2)
  })
})

describe('StrokeRecorder', () => {
  it('reports whether a cell actually changed', () => {
    const scene = new Scene()
    const recorder = new StrokeRecorder()

    expect(recorder.record(scene, 0, 0, 'a')).toBe(true)
    expect(recorder.record(scene, 0, 0, 'a')).toBe(false)
  })

  it('writes through to the scene immediately', () => {
    const scene = new Scene()
    const recorder = new StrokeRecorder()

    recorder.record(scene, 2, 2, 'a')

    expect(scene.get(2, 2)).toBe('a')
  })

  it('keeps the earliest previous value when a cell is touched twice', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'original')

    const recorder = new StrokeRecorder()
    recorder.record(scene, 0, 0, 'first')
    recorder.record(scene, 0, 0, 'second')

    const committed = recorder.commit('draw')

    expect(committed).not.toBeNull()
    expect(committed!.op.changes).toEqual([{ value: 'second', x: 0, y: 0 }])
    expect(committed!.inverse.changes).toEqual([
      { value: 'original', x: 0, y: 0 },
    ])
  })

  it('returns null when the stroke changed nothing', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'a')

    const recorder = new StrokeRecorder()
    recorder.record(scene, 0, 0, 'a')

    expect(recorder.commit('draw')).toBeNull()
  })

  it('restores the scene on rollback', () => {
    const scene = new Scene()
    scene.writeCell(0, 0, 'original')

    const recorder = new StrokeRecorder()
    recorder.record(scene, 0, 0, 'changed')
    recorder.record(scene, 3, 3, 'added')
    recorder.rollback(scene)

    expect(scene.get(0, 0)).toBe('original')
    expect(scene.has(3, 3)).toBe(false)
    expect(scene.size).toBe(1)
  })

  it('starts a fresh stroke after commit', () => {
    const scene = new Scene()
    const recorder = new StrokeRecorder()

    recorder.record(scene, 0, 0, 'a')
    recorder.commit('first')
    recorder.record(scene, 1, 1, 'b')

    const second = recorder.commit('second')

    expect(second!.op.changes).toEqual([{ value: 'b', x: 1, y: 1 }])
  })

  it('starts a fresh stroke after rollback', () => {
    const scene = new Scene()
    const recorder = new StrokeRecorder()

    recorder.record(scene, 0, 0, 'a')
    recorder.rollback(scene)

    expect(recorder.commit('after rollback')).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test`
Expected: FAIL — модуль `./operations` не найден.

- [ ] **Step 3: Реализовать операции**

Создать `src/core/operations.ts`:

```ts
import type { Emoji } from './types'

import { Scene } from './scene'

export type CellChange = { value: Emoji | undefined; x: number; y: number }
export type Operation = { changes: readonly CellChange[]; label: string }

/** Writes every change of the operation into the scene. */
export function applyOperation(scene: Scene, op: Operation): void {
  for (const change of op.changes) {
    scene.writeCell(change.x, change.y, change.value)
  }
}

/**
 * Builds the operation that undoes `op`. Must be called BEFORE `op` is
 * applied, because it reads the values the operation is about to replace.
 */
export function invertOperation(scene: Scene, op: Operation): Operation {
  return {
    changes: op.changes.map(change => ({
      value: scene.get(change.x, change.y),
      x: change.x,
      y: change.y,
    })),
    label: op.label,
  }
}

/**
 * Accumulates a single stroke. Changes reach the scene immediately, so the
 * drawing stays responsive, while the recorder remembers what to write back
 * if the stroke is undone or abandoned.
 */
export class StrokeRecorder {
  private before = new Map<string, Emoji | undefined>()
  private changes = new Map<string, CellChange>()

  /**
   * Discards the stroke and returns the operation plus its inverse, or null
   * when nothing actually changed.
   */
  commit(label: string): null | { inverse: Operation; op: Operation } {
    if (this.changes.size === 0) {
      this.reset()
      return null
    }

    const changes = [...this.changes.values()]
    const inverse: CellChange[] = changes.map(change => ({
      value: this.before.get(`${change.x},${change.y}`),
      x: change.x,
      y: change.y,
    }))

    this.reset()

    return {
      inverse: { changes: inverse, label },
      op: { changes, label },
    }
  }

  /**
   * Writes one cell and remembers its previous value. Returns false when the
   * cell already held this value, so callers can skip redundant repaints.
   */
  record(scene: Scene, x: number, y: number, value: Emoji | undefined): boolean {
    const current = scene.get(x, y)

    if (current === value) return false

    const key = `${x},${y}`

    if (!this.before.has(key)) {
      this.before.set(key, current)
    }

    this.changes.set(key, { value, x, y })
    scene.writeCell(x, y, value)

    return true
  }

  /** Puts the scene back as it was before the stroke started. */
  rollback(scene: Scene): void {
    for (const [key, value] of this.before) {
      const comma = key.indexOf(',')
      const x = Number(key.slice(0, comma))
      const y = Number(key.slice(comma + 1))

      scene.writeCell(x, y, value)
    }

    this.reset()
  }

  private reset(): void {
    this.before.clear()
    this.changes.clear()
  }
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS.

Если тест «keeps the earliest previous value» не сошёлся, проверьте, что `before`
записывается только при первом касании клетки (`if (!this.before.has(key))`), а
`changes` перезаписывается каждый раз.

- [ ] **Step 5: Проверить линт**

Run: `npm run lint`
Expected: проходит.

- [ ] **Step 6: Commit**

```bash
git add src/core/operations.ts src/core/operations.test.ts
git commit -m "feat: add reversible operations and stroke recorder"
```

---

### Task 3: History — отмена и повтор

**Files:**
- Create: `src/core/history.ts`
- Test: `src/core/history.test.ts`

**Interfaces:**
- Consumes: `Operation`, `applyOperation` из `src/core/operations.ts`; `Scene`
- Produces:
  ```ts
  export const DEFAULT_HISTORY_LIMIT = 100

  export class History {
    constructor(limit?: number)
    get canRedo(): boolean
    get canUndo(): boolean
    clear(): void
    commit(op: Operation, inverse: Operation): void
    redo(scene: Scene): boolean
    undo(scene: Scene): boolean
  }
  ```
  `commit` принимает операцию, которая **уже применена** к сцене.

- [ ] **Step 1: Написать падающий тест**

Создать `src/core/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { History } from './history'
import { applyOperation, type Operation } from './operations'
import { Scene } from './scene'

function draw(x: number, value: string): Operation {
  return { changes: [{ value, x, y: 0 }], label: 'draw' }
}

function erase(x: number): Operation {
  return { changes: [{ value: undefined, x, y: 0 }], label: 'erase' }
}

describe('History', () => {
  it('has nothing to undo or redo when empty', () => {
    const history = new History()

    expect(history.canRedo).toBe(false)
    expect(history.canUndo).toBe(false)
    expect(history.undo(new Scene())).toBe(false)
    expect(history.redo(new Scene())).toBe(false)
  })

  it('undoes an applied operation', () => {
    const scene = new Scene()
    const history = new History()
    const op = draw(0, 'a')

    applyOperation(scene, op)
    history.commit(op, erase(0))

    expect(history.canUndo).toBe(true)
    expect(history.undo(scene)).toBe(true)
    expect(scene.has(0, 0)).toBe(false)
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(true)
  })

  it('redoes what was undone', () => {
    const scene = new Scene()
    const history = new History()
    const op = draw(0, 'a')

    applyOperation(scene, op)
    history.commit(op, erase(0))
    history.undo(scene)

    expect(history.redo(scene)).toBe(true)
    expect(scene.get(0, 0)).toBe('a')
    expect(history.canRedo).toBe(false)
    expect(history.canUndo).toBe(true)
  })

  it('walks back through several operations in order', () => {
    const scene = new Scene()
    const history = new History()

    for (const [x, value] of [
      [0, 'a'],
      [1, 'b'],
      [2, 'c'],
    ] as const) {
      const op = draw(x, value)
      applyOperation(scene, op)
      history.commit(op, erase(x))
    }

    history.undo(scene)
    history.undo(scene)

    expect(scene.get(0, 0)).toBe('a')
    expect(scene.has(1, 0)).toBe(false)
    expect(scene.has(2, 0)).toBe(false)
  })

  it('drops the redo stack once a new operation is committed', () => {
    const scene = new Scene()
    const history = new History()
    const first = draw(0, 'a')

    applyOperation(scene, first)
    history.commit(first, erase(0))
    history.undo(scene)

    expect(history.canRedo).toBe(true)

    const second = draw(1, 'b')
    applyOperation(scene, second)
    history.commit(second, erase(1))

    expect(history.canRedo).toBe(false)
  })

  it('forgets the oldest operations beyond its limit', () => {
    const scene = new Scene()
    const history = new History(2)

    for (const [x, value] of [
      [0, 'a'],
      [1, 'b'],
      [2, 'c'],
    ] as const) {
      const op = draw(x, value)
      applyOperation(scene, op)
      history.commit(op, erase(x))
    }

    expect(history.undo(scene)).toBe(true)
    expect(history.undo(scene)).toBe(true)
    expect(history.undo(scene)).toBe(false)
    expect(scene.get(0, 0)).toBe('a')
  })

  it('clears both stacks', () => {
    const scene = new Scene()
    const history = new History()
    const op = draw(0, 'a')

    applyOperation(scene, op)
    history.commit(op, erase(0))
    history.clear()

    expect(history.canRedo).toBe(false)
    expect(history.canUndo).toBe(false)
  })
})
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test`
Expected: FAIL — модуль `./history` не найден.

- [ ] **Step 3: Реализовать History**

Создать `src/core/history.ts`:

```ts
import type { Operation } from './operations'

import { applyOperation } from './operations'
import { Scene } from './scene'

export const DEFAULT_HISTORY_LIMIT = 100

type Entry = { inverse: Operation; op: Operation }

/**
 * Undo/redo stack over already-applied operations. One stroke is one entry,
 * so undo steps back by a whole brush stroke rather than a single cell.
 */
export class History {
  private readonly limit: number
  private redoStack: Entry[] = []
  private undoStack: Entry[] = []

  constructor(limit: number = DEFAULT_HISTORY_LIMIT) {
    this.limit = limit
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  clear(): void {
    this.redoStack = []
    this.undoStack = []
  }

  /** Records an operation that has already been applied to the scene. */
  commit(op: Operation, inverse: Operation): void {
    this.undoStack.push({ inverse, op })
    this.redoStack = []

    if (this.undoStack.length > this.limit) {
      this.undoStack.shift()
    }
  }

  redo(scene: Scene): boolean {
    const entry = this.redoStack.pop()

    if (!entry) return false

    applyOperation(scene, entry.op)
    this.undoStack.push(entry)

    return true
  }

  undo(scene: Scene): boolean {
    const entry = this.undoStack.pop()

    if (!entry) return false

    applyOperation(scene, entry.inverse)
    this.redoStack.push(entry)

    return true
  }
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Проверить линт**

Run: `npm run lint`
Expected: проходит.

- [ ] **Step 6: Commit**

```bash
git add src/core/history.ts src/core/history.test.ts
git commit -m "feat: add undo/redo history over operations"
```

---

### Task 4: Camera — экран, клетки и масштаб

**Files:**
- Create: `src/core/camera.ts`
- Test: `src/core/camera.test.ts`

**Interfaces:**
- Consumes: `Cell`, `CellBounds` из `src/core/types.ts`
- Produces:
  ```ts
  export type Camera = { offsetX: number; offsetY: number; zoom: number }

  export const MAX_ZOOM = 4
  export const MIN_ZOOM = 0.1

  export function cellSizeAt(baseCellSize: number, zoom: number): number
  export function cellToScreen(
    camera: Camera,
    baseCellSize: number,
    x: number,
    y: number,
  ): { px: number; py: number }
  export function clampZoom(zoom: number): number
  export function createCamera(): Camera
  export function screenToCell(
    camera: Camera,
    baseCellSize: number,
    px: number,
    py: number,
  ): Cell
  export function visibleBounds(
    camera: Camera,
    baseCellSize: number,
    width: number,
    height: number,
  ): CellBounds
  export function zoomAt(
    camera: Camera,
    factor: number,
    anchorPx: number,
    anchorPy: number,
  ): Camera
  ```

**Координатная модель, которой обязана следовать реализация.** `offsetX`/`offsetY` —
это координаты левого верхнего угла экрана в пикселях мира. Значит экранная точка `px`
соответствует мировой `px + offsetX`, а номер клетки получается делением на текущий
размер клетки и округлением вниз. Обратное преобразование даёт левый верхний угол
клетки на экране.

- [ ] **Step 1: Написать падающий тест**

Создать `src/core/camera.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  cellSizeAt,
  cellToScreen,
  clampZoom,
  createCamera,
  MAX_ZOOM,
  MIN_ZOOM,
  screenToCell,
  visibleBounds,
  zoomAt,
} from './camera'

describe('cellSizeAt', () => {
  it('scales the base cell size by the zoom', () => {
    expect(cellSizeAt(30, 1)).toBe(30)
    expect(cellSizeAt(30, 2)).toBe(60)
    expect(cellSizeAt(30, 0.5)).toBe(15)
  })
})

describe('clampZoom', () => {
  it('keeps the zoom inside its allowed range', () => {
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(100)).toBe(MAX_ZOOM)
    expect(clampZoom(0.0001)).toBe(MIN_ZOOM)
  })
})

describe('screenToCell', () => {
  it('maps the origin to cell 0,0 at rest', () => {
    expect(screenToCell(createCamera(), 30, 0, 0)).toEqual({ x: 0, y: 0 })
  })

  it('keeps a point inside a cell within that cell', () => {
    const camera = createCamera()

    expect(screenToCell(camera, 30, 29, 29)).toEqual({ x: 0, y: 0 })
    expect(screenToCell(camera, 30, 30, 30)).toEqual({ x: 1, y: 1 })
  })

  it('produces negative cells above and left of the origin', () => {
    const camera = createCamera()

    expect(screenToCell(camera, 30, -1, -1)).toEqual({ x: -1, y: -1 })
    expect(screenToCell(camera, 30, -30, -30)).toEqual({ x: -1, y: -1 })
    expect(screenToCell(camera, 30, -31, -31)).toEqual({ x: -2, y: -2 })
  })

  it('accounts for the camera offset', () => {
    const camera = { offsetX: 60, offsetY: 30, zoom: 1 }

    expect(screenToCell(camera, 30, 0, 0)).toEqual({ x: 2, y: 1 })
  })

  it('accounts for the zoom', () => {
    const camera = { offsetX: 0, offsetY: 0, zoom: 2 }

    expect(screenToCell(camera, 30, 59, 0)).toEqual({ x: 0, y: 0 })
    expect(screenToCell(camera, 30, 60, 0)).toEqual({ x: 1, y: 0 })
  })
})

describe('cellToScreen', () => {
  it('returns the top-left corner of the cell', () => {
    expect(cellToScreen(createCamera(), 30, 2, 3)).toEqual({ px: 60, py: 90 })
  })

  it('round-trips with screenToCell', () => {
    const camera = { offsetX: 17, offsetY: -43, zoom: 1.5 }

    for (const cell of [
      { x: 0, y: 0 },
      { x: 7, y: -4 },
      { x: -12, y: 31 },
    ]) {
      const { px, py } = cellToScreen(camera, 30, cell.x, cell.y)

      expect(screenToCell(camera, 30, px, py)).toEqual(cell)
    }
  })
})

describe('visibleBounds', () => {
  it('covers exactly the cells touching the viewport at rest', () => {
    expect(visibleBounds(createCamera(), 30, 90, 60)).toEqual({
      maxX: 2,
      maxY: 1,
      minX: 0,
      minY: 0,
    })
  })

  it('includes the partially visible cell at the far edge', () => {
    expect(visibleBounds(createCamera(), 30, 91, 61)).toEqual({
      maxX: 3,
      maxY: 2,
      minX: 0,
      minY: 0,
    })
  })

  it('shifts with the camera offset', () => {
    const camera = { offsetX: -60, offsetY: -60, zoom: 1 }

    expect(visibleBounds(camera, 30, 90, 90)).toEqual({
      maxX: 0,
      maxY: 0,
      minX: -2,
      minY: -2,
    })
  })

  it('covers fewer cells when zoomed in', () => {
    const camera = { offsetX: 0, offsetY: 0, zoom: 2 }

    expect(visibleBounds(camera, 30, 120, 120)).toEqual({
      maxX: 1,
      maxY: 1,
      minX: 0,
      minY: 0,
    })
  })
})

describe('zoomAt', () => {
  it('keeps the anchored point over the same place in the scene', () => {
    const camera = { offsetX: 100, offsetY: 50, zoom: 1 }
    const anchorPx = 200
    const anchorPy = 150

    const worldXBefore = (anchorPx + camera.offsetX) / cellSizeAt(30, camera.zoom)
    const worldYBefore = (anchorPy + camera.offsetY) / cellSizeAt(30, camera.zoom)

    const zoomed = zoomAt(camera, 2, anchorPx, anchorPy)

    const worldXAfter = (anchorPx + zoomed.offsetX) / cellSizeAt(30, zoomed.zoom)
    const worldYAfter = (anchorPy + zoomed.offsetY) / cellSizeAt(30, zoomed.zoom)

    expect(worldXAfter).toBeCloseTo(worldXBefore, 10)
    expect(worldYAfter).toBeCloseTo(worldYBefore, 10)
  })

  it('multiplies the zoom by the factor', () => {
    expect(zoomAt(createCamera(), 2, 0, 0).zoom).toBe(2)
  })

  it('refuses to exceed the zoom limits', () => {
    expect(zoomAt(createCamera(), 1000, 0, 0).zoom).toBe(MAX_ZOOM)
    expect(zoomAt(createCamera(), 0.00001, 0, 0).zoom).toBe(MIN_ZOOM)
  })

  it('does not mutate the camera it was given', () => {
    const camera = createCamera()

    zoomAt(camera, 2, 10, 10)

    expect(camera).toEqual({ offsetX: 0, offsetY: 0, zoom: 1 })
  })
})
```

Обратите внимание: `zoomAt` использует `cellSizeAt` внутри теста, поэтому оба должны
быть экспортированы.

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test`
Expected: FAIL — модуль `./camera` не найден.

- [ ] **Step 3: Реализовать камеру**

Создать `src/core/camera.ts`:

```ts
import type { Cell, CellBounds } from './types'

/**
 * offsetX/offsetY are the world-pixel coordinates of the viewport's
 * top-left corner, so a screen point `px` sits at world pixel
 * `px + offsetX`. The canvas is the size of the window, never the size of
 * the drawing, which is what lets the grid be unbounded.
 */
export type Camera = { offsetX: number; offsetY: number; zoom: number }

export const MAX_ZOOM = 4
export const MIN_ZOOM = 0.1

export function cellSizeAt(baseCellSize: number, zoom: number): number {
  return baseCellSize * zoom
}

/** Top-left corner of the given cell, in screen pixels. */
export function cellToScreen(
  camera: Camera,
  baseCellSize: number,
  x: number,
  y: number,
): { px: number; py: number } {
  const cellSize = cellSizeAt(baseCellSize, camera.zoom)

  return {
    px: x * cellSize - camera.offsetX,
    py: y * cellSize - camera.offsetY,
  }
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function createCamera(): Camera {
  return { offsetX: 0, offsetY: 0, zoom: 1 }
}

/**
 * Cell containing the given screen point. Uses Math.floor, so a point
 * anywhere inside a cell — including in negative coordinates — belongs to
 * that cell.
 */
export function screenToCell(
  camera: Camera,
  baseCellSize: number,
  px: number,
  py: number,
): Cell {
  const cellSize = cellSizeAt(baseCellSize, camera.zoom)

  return {
    x: Math.floor((px + camera.offsetX) / cellSize),
    y: Math.floor((py + camera.offsetY) / cellSize),
  }
}

/**
 * Every cell touching the viewport, including partially visible ones at the
 * far edges. Rendering only this range is what keeps frame cost tied to the
 * window size rather than to the size of the drawing.
 */
export function visibleBounds(
  camera: Camera,
  baseCellSize: number,
  width: number,
  height: number,
): CellBounds {
  const topLeft = screenToCell(camera, baseCellSize, 0, 0)
  const bottomRight = screenToCell(camera, baseCellSize, width - 1, height - 1)

  return {
    maxX: bottomRight.x,
    maxY: bottomRight.y,
    minX: topLeft.x,
    minY: topLeft.y,
  }
}

/**
 * Scales around a fixed screen point: whatever part of the scene sits under
 * the cursor or the pinch centre stays under it. Returns a new camera.
 */
export function zoomAt(
  camera: Camera,
  factor: number,
  anchorPx: number,
  anchorPy: number,
): Camera {
  const zoom = clampZoom(camera.zoom * factor)
  const ratio = zoom / camera.zoom

  return {
    offsetX: (anchorPx + camera.offsetX) * ratio - anchorPx,
    offsetY: (anchorPy + camera.offsetY) * ratio - anchorPy,
    zoom,
  }
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS.

Если тест «includes the partially visible cell at the far edge» не сошёлся, проверьте,
что `visibleBounds` берёт `width - 1` и `height - 1`: пиксель с номером `width` лежит
уже за пределами окна.

- [ ] **Step 5: Проверить линт**

Run: `npm run lint`
Expected: проходит.

- [ ] **Step 6: Commit**

```bash
git add src/core/camera.ts src/core/camera.test.ts
git commit -m "feat: add camera mapping screen pixels to grid cells"
```

---

### Task 5: Текстовый экспорт

**Files:**
- Create: `src/core/export/text.ts`
- Test: `src/core/export/text.test.ts`

**Interfaces:**
- Consumes: `Scene` из `src/core/scene.ts`
- Produces:
  ```ts
  export const DEFAULT_FILLER = '〰️'
  export function toText(scene: Scene, filler?: string): string
  ```

**Почему филлер живёт здесь, а не в сцене.** Мессенджеры обрезают настоящие пробелы,
и рисунок рассыпается при вставке. Поэтому пустые клетки внутри рисунка заполняются
видимым символом `〰️`. В модели его нет: на бесконечном холсте пустых клеток
бесконечно много, поэтому филлер существует только как деталь текстового
представления. Обрезка пустых краёв получается сама собой — границы рисунка и есть
его содержимое.

Проект тестов `node` включает `src/core/**/*.test.ts`, поэтому вложенная папка
`export` подхватывается без изменений конфигурации.

- [ ] **Step 1: Написать падающий тест**

Создать `src/core/export/text.test.ts`:

```ts
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
```

Тесты про несквадратные области здесь не для полноты: старый движок держал матрицу
как `columnsCount` строк по `rowsCount` элементов и читал её как `matrix[j][i]`, из-за
чего работал только на квадратной сетке. Эти два теста закрывают тот дефект навсегда.

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test`
Expected: FAIL — модуль `./text` не найден.

- [ ] **Step 3: Реализовать экспорт**

Создать `src/core/export/text.ts`:

```ts
import { Scene } from '../scene'

/**
 * Messaging apps strip real spaces, which destroys the art on paste, so an
 * empty cell inside the drawing is written as a visible character instead.
 */
export const DEFAULT_FILLER = '〰️'

/**
 * Renders the scene as text, cropped to the drawing's bounding box. Empty
 * cells inside that box become the filler; there is nothing outside it to
 * trim, because the bounds are the content.
 */
export function toText(scene: Scene, filler: string = DEFAULT_FILLER): string {
  const bounds = scene.bounds()

  if (!bounds) return ''

  const rows: string[] = []

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    let row = ''

    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      row += scene.get(x, y) ?? filler
    }

    rows.push(row)
  }

  return rows.join('\n')
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Проверить линт**

Run: `npm run lint`
Expected: проходит.

- [ ] **Step 6: Commit**

```bash
git add src/core/export/text.ts src/core/export/text.test.ts
git commit -m "feat: add text export cropped to the drawing bounds"
```

---

### Task 6: Инструменты — кисть и ластик

**Files:**
- Create: `src/tools/types.ts`
- Create: `src/tools/brush.ts`
- Create: `src/tools/eraser.ts`
- Test: `src/tools/brush.test.ts`
- Test: `src/tools/eraser.test.ts`

**Interfaces:**
- Consumes: `Cell`, `Emoji` из `src/core/types.ts`; `Scene`; `StrokeRecorder` из
  `src/core/operations.ts`; `cellsBetween` из `src/core/line.ts`
- Produces:
  ```ts
  // src/tools/types.ts
  export type ToolContext = {
    brush: Emoji
    recorder: StrokeRecorder
    scene: Scene
  }

  export interface Tool {
    readonly id: string
    onDown(cell: Cell, ctx: ToolContext): void
    onMove(cell: Cell, ctx: ToolContext): void
    onUp(ctx: ToolContext): void
  }

  // src/tools/brush.ts
  export function createBrushTool(): Tool
  // src/tools/eraser.ts
  export function createEraserTool(): Tool
  ```

**Почему фабрики, а не константы.** Инструмент помнит последнюю пройденную клетку,
чтобы достроить путь между событиями указателя. Это состояние, поэтому каждый
инструмент создаётся вызовом фабрики, а не расшаривается как синглтон.

**Почему ластик — отдельный инструмент.** В старом коде стирание было «кистью, рисующей
филлером», из-за чего признак стирания приходилось выводить сравнением кисти с филлером.
В новой модели стирание — это удаление клетки, и ластик просто пишет `undefined`.

- [ ] **Step 1: Написать падающий тест для кисти**

Создать `src/tools/brush.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { StrokeRecorder } from '../core/operations'
import { Scene } from '../core/scene'
import { createBrushTool } from './brush'
import type { ToolContext } from './types'

function context(brush = '❤️'): ToolContext {
  return { brush, recorder: new StrokeRecorder(), scene: new Scene() }
}

describe('createBrushTool', () => {
  it('paints the cell where the stroke starts', () => {
    const tool = createBrushTool()
    const ctx = context()

    tool.onDown({ x: 2, y: 3 }, ctx)

    expect(ctx.scene.get(2, 3)).toBe('❤️')
  })

  it('paints a continuous path between pointer events', () => {
    const tool = createBrushTool()
    const ctx = context()

    tool.onDown({ x: 0, y: 0 }, ctx)
    tool.onMove({ x: 3, y: 0 }, ctx)

    expect(ctx.scene.get(0, 0)).toBe('❤️')
    expect(ctx.scene.get(1, 0)).toBe('❤️')
    expect(ctx.scene.get(2, 0)).toBe('❤️')
    expect(ctx.scene.get(3, 0)).toBe('❤️')
    expect(ctx.scene.size).toBe(4)
  })

  it('does not connect a new stroke to the previous one', () => {
    const tool = createBrushTool()
    const ctx = context()

    tool.onDown({ x: 0, y: 0 }, ctx)
    tool.onUp(ctx)
    tool.onDown({ x: 5, y: 0 }, ctx)

    expect(ctx.scene.size).toBe(2)
    expect(ctx.scene.has(3, 0)).toBe(false)
  })

  it('ignores movement before the stroke started', () => {
    const tool = createBrushTool()
    const ctx = context()

    tool.onMove({ x: 4, y: 4 }, ctx)

    expect(ctx.scene.size).toBe(0)
  })

  it('uses the brush from the context at the time of the event', () => {
    const tool = createBrushTool()
    const ctx = context('🔥')

    tool.onDown({ x: 0, y: 0 }, ctx)

    expect(ctx.scene.get(0, 0)).toBe('🔥')
  })

  it('leaves one committable operation for the whole stroke', () => {
    const tool = createBrushTool()
    const ctx = context()

    tool.onDown({ x: 0, y: 0 }, ctx)
    tool.onMove({ x: 2, y: 0 }, ctx)
    tool.onUp(ctx)

    const committed = ctx.recorder.commit('brush')

    expect(committed).not.toBeNull()
    expect(committed!.op.changes).toHaveLength(3)
  })
})
```

Последний тест фиксирует разделение обязанностей: инструмент только пишет в `recorder`
и никогда не вызывает `commit` сам. Мазок фиксирует владелец редактора уже после
`onUp` — поэтому накопитель к этому моменту полон, и `commit` отдаёт операцию из трёх
клеток, а не `null`.

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npm test`
Expected: FAIL — модули `./brush` и `./types` не найдены.

- [ ] **Step 3: Создать интерфейс инструмента**

Создать `src/tools/types.ts`:

```ts
import type { StrokeRecorder } from '../core/operations'
import type { Scene } from '../core/scene'
import type { Cell, Emoji } from '../core/types'

export type ToolContext = {
  brush: Emoji
  recorder: StrokeRecorder
  scene: Scene
}

/**
 * A tool turns pointer events, already expressed in grid cells, into writes
 * through the stroke recorder. Tools never touch history: the editor commits
 * the recorded stroke after onUp.
 */
export interface Tool {
  readonly id: string
  onDown(cell: Cell, ctx: ToolContext): void
  onMove(cell: Cell, ctx: ToolContext): void
  onUp(ctx: ToolContext): void
}
```

- [ ] **Step 4: Реализовать кисть**

Создать `src/tools/brush.ts`:

```ts
import type { Cell } from '../core/types'
import type { Tool, ToolContext } from './types'

import { cellsBetween } from '../core/line'

/**
 * Paints the current brush. Movement between two pointer events is filled in
 * with cellsBetween, so a fast drag leaves a continuous line rather than a
 * dotted trail.
 */
export function createBrushTool(): Tool {
  let last: Cell | null = null

  return {
    id: 'brush',

    onDown(cell, ctx) {
      last = cell
      ctx.recorder.record(ctx.scene, cell.x, cell.y, ctx.brush)
    },

    onMove(cell, ctx) {
      if (!last) return

      for (const step of cellsBetween(last, cell)) {
        ctx.recorder.record(ctx.scene, step.x, step.y, ctx.brush)
      }

      last = cell
    },

    onUp(_ctx: ToolContext) {
      last = null
    },
  }
}
```

- [ ] **Step 5: Запустить тесты кисти**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Написать падающий тест для ластика**

Создать `src/tools/eraser.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { StrokeRecorder } from '../core/operations'
import { Scene } from '../core/scene'
import { createEraserTool } from './eraser'
import type { ToolContext } from './types'

function context(): ToolContext {
  return { brush: '❤️', recorder: new StrokeRecorder(), scene: new Scene() }
}

describe('createEraserTool', () => {
  it('removes the cell where the stroke starts', () => {
    const tool = createEraserTool()
    const ctx = context()
    ctx.scene.writeCell(2, 3, '❤️')

    tool.onDown({ x: 2, y: 3 }, ctx)

    expect(ctx.scene.has(2, 3)).toBe(false)
    expect(ctx.scene.size).toBe(0)
  })

  it('erases a continuous path between pointer events', () => {
    const tool = createEraserTool()
    const ctx = context()

    for (let x = 0; x <= 3; x++) {
      ctx.scene.writeCell(x, 0, '❤️')
    }

    tool.onDown({ x: 0, y: 0 }, ctx)
    tool.onMove({ x: 3, y: 0 }, ctx)

    expect(ctx.scene.size).toBe(0)
  })

  it('ignores the brush entirely', () => {
    const tool = createEraserTool()
    const ctx = context()
    ctx.scene.writeCell(0, 0, '🔥')

    tool.onDown({ x: 0, y: 0 }, ctx)

    expect(ctx.scene.has(0, 0)).toBe(false)
  })

  it('leaves neighbouring cells alone', () => {
    const tool = createEraserTool()
    const ctx = context()
    ctx.scene.writeCell(0, 0, 'a')
    ctx.scene.writeCell(1, 0, 'b')

    tool.onDown({ x: 0, y: 0 }, ctx)

    expect(ctx.scene.get(1, 0)).toBe('b')
  })

  it('does not connect a new stroke to the previous one', () => {
    const tool = createEraserTool()
    const ctx = context()

    for (let x = 0; x <= 5; x++) {
      ctx.scene.writeCell(x, 0, '❤️')
    }

    tool.onDown({ x: 0, y: 0 }, ctx)
    tool.onUp(ctx)
    tool.onDown({ x: 5, y: 0 }, ctx)

    expect(ctx.scene.get(3, 0)).toBe('❤️')
    expect(ctx.scene.size).toBe(4)
  })
})
```

- [ ] **Step 7: Запустить тест и убедиться, что он падает**

Run: `npm test`
Expected: FAIL — модуль `./eraser` не найден.

- [ ] **Step 8: Реализовать ластик**

Создать `src/tools/eraser.ts`:

```ts
import type { Cell } from '../core/types'
import type { Tool, ToolContext } from './types'

import { cellsBetween } from '../core/line'

/**
 * Removes cells. Erasing is deleting a key, not painting a filler: the
 * filler exists only in the text export, so there is no "erasing mode" to
 * track anywhere in the model.
 */
export function createEraserTool(): Tool {
  let last: Cell | null = null

  return {
    id: 'eraser',

    onDown(cell, ctx) {
      last = cell
      ctx.recorder.record(ctx.scene, cell.x, cell.y, undefined)
    },

    onMove(cell, ctx) {
      if (!last) return

      for (const step of cellsBetween(last, cell)) {
        ctx.recorder.record(ctx.scene, step.x, step.y, undefined)
      }

      last = cell
    },

    onUp(_ctx: ToolContext) {
      last = null
    },
  }
}
```

- [ ] **Step 9: Запустить все тесты**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Проверить линт и сборку**

Run: `npm run lint && npm run build`
Expected: обе команды проходят.

- [ ] **Step 11: Commit**

```bash
git add src/tools
git commit -m "feat: add brush and eraser tools"
```

---

## Проверка готовности плана

После выполнения всех задач должно быть верно одновременно:

- [ ] `npm test` проходит; node-проект содержит тесты `line`, `scene`, `operations`,
      `history`, `camera`, `export/text`, `brush`, `eraser`
- [ ] `npm run lint` проходит без предупреждений
- [ ] `npm run build` проходит
- [ ] Ни один файл из `src/core` и `src/tools` не обращается к `window`, `document`,
      `canvas` или другим браузерным API — проверяется командой
      `grep -rn "window\.\|document\.\|canvas\|requestAnimationFrame" src/core src/tools`,
      которая должна ничего не найти
- [ ] Приложение в браузере работает как раньше: старый движок не тронут
- [ ] В `src/` нет ни одного символа кириллицы — проверяется командой
      `grep -rn "[а-яА-ЯёЁ]" src/`, которая должна ничего не найти

## Что дальше

План 3 берёт это ядро и достраивает вокруг него рендер (`render/glyphAtlas.ts`,
`render/scene.ts`, `render/theme.ts`), ввод с жестами (`input/pointer.ts`), фасад
`editor/Editor.ts` и переводит React-оболочку на новый движок, удаляя
`src/lib/EmojiCanvas.ts`. Требование оттуда, которое надо помнить уже сейчас:
обработчик указателя обязан приводить экранные координаты к целым клеткам через
`screenToCell` до вызова инструментов.

После плана 3 — разбор отложенных замечаний из `PROGRESS.md` и слияние ветки
`foundation` в `main`.
