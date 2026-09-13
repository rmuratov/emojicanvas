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
