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
  /**
   * Abandons the in-progress stroke, e.g. when a second finger turns a
   * drawing stroke into a pinch gesture. Resets whatever the tool
   * remembers between events (such as the last painted cell), so the next
   * stroke does not interpolate from a stale position. Does NOT touch the
   * scene: the caller owns rollback and must call `recorder.rollback(scene)`
   * before calling this method.
   */
  onCancel(ctx: ToolContext): void
  onDown(cell: Cell, ctx: ToolContext): void

  onMove(cell: Cell, ctx: ToolContext): void

  onUp(ctx: ToolContext): void
}

export type ToolContext = {
  brush: Emoji
  recorder: StrokeRecorder
  scene: Scene
}
