import type { StrokeRecorder } from '../core/operations'
import type { Scene } from '../core/scene'
import type { Cell, Emoji } from '../core/types'

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

export type ToolContext = {
  brush: Emoji
  recorder: StrokeRecorder
  scene: Scene
}
