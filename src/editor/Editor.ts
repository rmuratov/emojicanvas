import type { Camera } from '../core/camera'
import type { Emoji } from '../core/types'
import type { Theme } from '../render/theme'
import type { Tool, ToolContext } from '../tools/types'

import { createCamera, screenToCell, zoomAt } from '../core/camera'
import { toText } from '../core/export/text'
import { History } from '../core/history'
import {
  applyOperation,
  createClearOperation,
  invertOperation,
  StrokeRecorder,
} from '../core/operations'
import { Scene } from '../core/scene'
import { attachPointerInput } from '../input/pointer'
import { GlyphAtlas } from '../render/glyphAtlas'
import { renderScene } from '../render/scene'
import { DEFAULT_THEME } from '../render/theme'
import { createBrushTool } from '../tools/brush'
import { createEraserTool } from '../tools/eraser'

/** Everything the React shell is allowed to know about the engine. */
export type EditorState = {
  brush: Emoji
  canRedo: boolean
  canUndo: boolean
  isEmpty: boolean
  toolId: string
  zoom: number
}

const INITIAL_BRUSH = '❤️'

/**
 * Assembles the layers and owns their lifecycle. Everything imperative lives
 * behind this class, so React holds one reference and never re-renders
 * because of drawing.
 *
 * `subscribe` and `getSnapshot` are shaped for useSyncExternalStore. The old
 * engine mirrored its state into React through a callback and the two copies
 * drifted; there is one copy now, and React reads it.
 */
export class Editor {
  private readonly camera: Camera = createCamera()
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly history = new History()
  private readonly listeners = new Set<() => void>()
  private readonly recorder = new StrokeRecorder()
  private readonly resizeObserver: ResizeObserver
  private readonly scene = new Scene()
  private readonly theme: Theme
  private readonly tools = new Map<string, Tool>()

  private atlas: GlyphAtlas
  private brush: Emoji = INITIAL_BRUSH
  private destroyed = false
  private detachInput: () => void
  private dirty = true
  private dpr = 0
  private frame = 0
  private height = 0
  private snapshot: EditorState | null = null
  private tool: Tool
  private width = 0

  constructor(container: HTMLElement, options?: { theme?: Partial<Theme> }) {
    this.theme = { ...DEFAULT_THEME, ...options?.theme }

    this.canvas = document.createElement('canvas')
    this.canvas.style.display = 'block'
    container.append(this.canvas)

    this.ctx = this.canvas.getContext('2d')!
    this.atlas = new GlyphAtlas(deviceRatio(), this.theme.fontStack)

    const brushTool = createBrushTool()
    const eraserTool = createEraserTool()

    this.tools.set(brushTool.id, brushTool)
    this.tools.set(eraserTool.id, eraserTool)
    this.tool = brushTool

    this.detachInput = attachPointerInput(this.canvas, {
      onDrawCancel: () => this.cancelStroke(),
      onDrawEnd: () => this.endStroke(),
      onDrawMove: (px, py) => {
        this.tool.onMove(this.toCell(px, py), this.toolContext())
        // markDirty, not invalidate: a drag fires far more often than the
        // display refreshes, and nothing on the toolbar changes mid-stroke.
        // Notifying here would mean a React render per pointer event.
        this.markDirty()
      },
      onDrawStart: (px, py) => {
        this.tool.onDown(this.toCell(px, py), this.toolContext())
        this.invalidate()
      },
      onPan: (dx, dy) => this.panBy(dx, dy),
      onZoom: (factor, px, py) => this.zoomBy(factor, px, py),
    })

    this.resizeObserver = new ResizeObserver(() => this.resize(container))
    this.resizeObserver.observe(container)
    this.resize(container)
    this.scheduleFrame()
  }

  /** Erases everything, as one undoable operation. */
  clear(): void {
    const op = createClearOperation(this.scene)

    if (op.changes.length === 0) return

    const inverse = invertOperation(this.scene, op)

    applyOperation(this.scene, op)
    this.history.commit(op, inverse)
    this.invalidate()
  }

  destroy(): void {
    if (this.destroyed) return

    this.destroyed = true
    this.detachInput()
    this.resizeObserver.disconnect()
    cancelAnimationFrame(this.frame)
    this.canvas.remove()
    this.listeners.clear()
  }

  /**
   * The same object until something actually changes. useSyncExternalStore
   * calls this on every render and compares by identity, so a fresh object
   * each time would loop forever.
   */
  getSnapshot(): EditorState {
    if (!this.snapshot) {
      this.snapshot = {
        brush: this.brush,
        canRedo: this.history.canRedo,
        canUndo: this.history.canUndo,
        // scene.size, never bounds(): bounds() scans every drawn cell, and
        // this runs on every React render.
        isEmpty: this.scene.size === 0,
        toolId: this.tool.id,
        zoom: this.camera.zoom,
      }
    }

    return this.snapshot
  }

  /** Moves the content by (dx, dy) screen pixels; the camera goes the other way. */
  panBy(dx: number, dy: number): void {
    this.camera.offsetX -= dx
    this.camera.offsetY -= dy
    // No snapshot field depends on the offset, so this never wakes React.
    this.markDirty()
  }

  redo(): void {
    if (this.history.redo(this.scene)) this.invalidate()
  }

  resetView(): void {
    this.camera.offsetX = 0
    this.camera.offsetY = 0
    this.camera.zoom = 1
    this.invalidate()
  }

  setBrush(emoji: Emoji): void {
    if (this.brush === emoji) return

    this.brush = emoji
    this.invalidate()
  }

  setTool(id: string): void {
    const next = this.tools.get(id)

    if (!next || next === this.tool) return

    this.tool = next
    this.invalidate()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  toText(): string {
    return toText(this.scene)
  }

  undo(): void {
    if (this.history.undo(this.scene)) this.invalidate()
  }

  zoomBy(factor: number, anchorPx?: number, anchorPy?: number): void {
    const next = zoomAt(
      this.camera,
      factor,
      anchorPx ?? this.width / 2,
      anchorPy ?? this.height / 2,
    )

    // zoomAt has already clamped to the camera's limits.
    this.camera.offsetX = next.offsetX
    this.camera.offsetY = next.offsetY
    this.camera.zoom = next.zoom
    this.invalidate()
  }

  /**
   * Abandons the stroke. Two calls, and both are needed: the recorder puts
   * the scene back, the tool forgets the cell it last painted. Neither does
   * the other's job.
   */
  private cancelStroke(): void {
    this.recorder.rollback(this.scene)
    this.tool.onCancel(this.toolContext())
    this.invalidate()
  }

  private draw(): void {
    renderScene(this.ctx, this.scene, {
      atlas: this.atlas,
      camera: this.camera,
      height: this.height,
      theme: this.theme,
      width: this.width,
    })
  }

  private endStroke(): void {
    this.tool.onUp(this.toolContext())

    const committed = this.recorder.commit(this.tool.id)

    if (committed) {
      this.history.commit(committed.op, committed.inverse)
    }

    this.invalidate()
  }

  /** Marks the frame dirty and tells React the toolbar may have changed. */
  private invalidate(): void {
    this.markDirty()
    this.snapshot = null

    for (const listener of this.listeners) listener()
  }

  /** Asks for a redraw without waking React. */
  private markDirty(): void {
    this.dirty = true
  }

  private resize(container: HTMLElement): void {
    const dpr = deviceRatio()

    if (dpr !== this.dpr) {
      // Every buffer in the atlas was rasterised for the old ratio; moving
      // the window to a display with a different one would otherwise leave
      // every glyph soft.
      this.dpr = dpr
      this.atlas = new GlyphAtlas(dpr, this.theme.fontStack)
    }

    this.width = container.clientWidth
    this.height = container.clientHeight
    this.canvas.width = Math.round(this.width * dpr)
    this.canvas.height = Math.round(this.height * dpr)
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.markDirty()
  }

  /**
   * One draw per frame regardless of how many pointer events arrived. A fast
   * drag fires far more often than the display refreshes.
   */
  private scheduleFrame(): void {
    this.frame = requestAnimationFrame(() => {
      if (this.destroyed) return

      if (this.dirty) {
        this.dirty = false
        this.draw()
      }

      this.scheduleFrame()
    })
  }

  private toCell(px: number, py: number) {
    return screenToCell(this.camera, this.theme.baseCellSize, px, py)
  }

  private toolContext(): ToolContext {
    return { brush: this.brush, recorder: this.recorder, scene: this.scene }
  }
}

function deviceRatio(): number {
  return window.devicePixelRatio || 1
}
