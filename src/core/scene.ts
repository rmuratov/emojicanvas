import type { Cell, CellBounds, Emoji } from './types'

/**
 * The current SceneData format. Bumped whenever the serialised shape
 * changes in a way old readers can't tolerate; fromJSON rejects any other
 * stated version rather than guessing at its shape, and reads an absent
 * one as version 1.
 */
export const SCENE_DATA_VERSION = 1

export type SceneData = { cells: Record<string, Emoji>; version: number }

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

  /**
   * Restores a scene from serialised data. Entries whose key does not parse
   * to two finite integers, or whose value is not a non-empty string, are
   * skipped rather than throwing — this data may one day come from a
   * shareable link (a truncated URL, an old format, a hand-edited payload),
   * and a partially readable drawing is better than a crash or a blank
   * screen. A valid key is re-encoded through `keyOf` rather than stored
   * verbatim, because `parseKey` tolerates surrounding whitespace (via
   * `Number()`) that `keyOf` never produces — storing the raw key would
   * make the cell unreachable through `get`/`has`, which always look up
   * the canonical form.
   *
   * The same resilience applies to the envelope itself: a null payload, or
   * one whose `cells` is missing or not an object, yields an empty scene
   * rather than throwing — `Object.entries` on a null or undefined `cells`
   * throws a TypeError, and a hand-edited or truncated payload can easily
   * lose the envelope shape, not just individual entries. A payload whose
   * `version` isn't the one this build understands is treated the same
   * way: a future format may not be readable at all, so guessing at its
   * shape is worse than showing an empty scene. An *absent* version is the
   * one exception, and is read as version 1: the cell shape has never
   * changed, only the envelope gained the field, so a payload without it
   * can only be a version 1 body — rejecting it would discard a drawing
   * this build understands perfectly well.
   */
  static fromJSON(data: SceneData): Scene {
    const scene = new Scene()

    if (
      typeof data !== 'object' ||
      data === null ||
      (data.version !== undefined && data.version !== SCENE_DATA_VERSION) ||
      typeof data.cells !== 'object' ||
      data.cells === null
    ) {
      return scene
    }

    for (const [key, value] of Object.entries(data.cells)) {
      if (!isValidKey(key) || !isValidValue(value)) continue

      const { x, y } = parseKey(key)

      scene.cells.set(keyOf(x, y), value)
    }

    return scene
  }

  toJSON(): SceneData {
    return {
      cells: Object.fromEntries(this.cells),
      version: SCENE_DATA_VERSION,
    }
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

/**
 * The canonical string key for a cell. Exported so that other modules
 * needing their own cell-keyed maps (StrokeRecorder, in particular) share
 * this exact encoding instead of re-deriving it — the format is decided
 * here and nowhere else.
 */
export function keyOf(x: number, y: number): string {
  return `${x},${y}`
}

/** Inverse of `keyOf`, tolerant of surrounding whitespace via `Number()`. */
export function parseKey(key: string): Cell {
  const comma = key.indexOf(',')

  return {
    x: Number(key.slice(0, comma)),
    y: Number(key.slice(comma + 1)),
  }
}

function isValidKey(key: string): boolean {
  const comma = key.indexOf(',')

  if (comma === -1) return false

  const { x, y } = parseKey(key)

  return Number.isInteger(x) && Number.isInteger(y)
}

function isValidValue(value: unknown): value is Emoji {
  return typeof value === 'string' && value.length > 0
}
