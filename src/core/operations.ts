import type { Emoji } from './types'

import { keyOf, parseKey, Scene } from './scene'

export type CellChange = { value: Emoji | undefined; x: number; y: number }
export type Operation = { changes: readonly CellChange[]; label: string }

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
   * when nothing actually changed. A cell that was touched during the
   * stroke but ended up back at its pre-stroke value is dropped: it would
   * otherwise produce a no-op undo step that reads as a broken undo button.
   */
  commit(label: string): null | { inverse: Operation; op: Operation } {
    const changes: CellChange[] = []
    const inverse: CellChange[] = []

    for (const change of this.changes.values()) {
      const key = keyOf(change.x, change.y)
      const previous = this.before.get(key)

      if (previous === change.value) continue

      changes.push(change)
      inverse.push({ value: previous, x: change.x, y: change.y })
    }

    this.reset()

    if (changes.length === 0) return null

    return {
      inverse: { changes: inverse, label },
      op: { changes, label },
    }
  }

  /**
   * Writes one cell and remembers its previous value. Returns false when the
   * cell already held this value, so callers can skip redundant repaints.
   */
  record(
    scene: Scene,
    x: number,
    y: number,
    value: Emoji | undefined,
  ): boolean {
    const current = scene.get(x, y)

    if (current === value) return false

    const key = keyOf(x, y)

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
      const { x, y } = parseKey(key)

      scene.writeCell(x, y, value)
    }

    this.reset()
  }

  private reset(): void {
    this.before.clear()
    this.changes.clear()
  }
}

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
