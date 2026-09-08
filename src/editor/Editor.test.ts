import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_THEME } from '../render/theme'
import { Editor } from './Editor'

function down(canvas: HTMLCanvasElement, px: number, py: number) {
  const box = canvas.getBoundingClientRect()

  canvas.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      clientX: box.left + px,
      clientY: box.top + py,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'touch',
    }),
  )
}

function mount() {
  const container = document.createElement('div')
  container.style.width = '300px'
  container.style.height = '300px'
  document.body.append(container)

  const editor = new Editor(container)
  const canvas = container.querySelector('canvas')!

  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()
  canvas.hasPointerCapture = vi.fn(() => false)

  return { canvas, container, editor }
}

function move(canvas: HTMLCanvasElement, px: number, py: number) {
  const box = canvas.getBoundingClientRect()

  canvas.dispatchEvent(
    new PointerEvent('pointermove', {
      bubbles: true,
      clientX: box.left + px,
      clientY: box.top + py,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'touch',
    }),
  )
}

function tap(canvas: HTMLCanvasElement, px: number, py: number) {
  down(canvas, px, py)
  up(canvas)
}

function up(canvas: HTMLCanvasElement) {
  canvas.dispatchEvent(
    new PointerEvent('pointerup', {
      bubbles: true,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'touch',
    }),
  )
}

describe('Editor', () => {
  it('creates its own canvas inside the container', () => {
    const { container } = mount()

    expect(container.querySelectorAll('canvas')).toHaveLength(1)
  })

  it('starts empty, with nothing to undo', () => {
    const { editor } = mount()
    const state = editor.getSnapshot()

    expect(state.isEmpty).toBe(true)
    expect(state.canUndo).toBe(false)
    expect(state.canRedo).toBe(false)
    expect(state.zoom).toBe(1)
  })

  it('returns the same snapshot object until something changes', () => {
    const { editor } = mount()

    expect(editor.getSnapshot()).toBe(editor.getSnapshot())
  })

  it('returns a new snapshot object after a change', () => {
    const { editor } = mount()
    const before = editor.getSnapshot()

    editor.setBrush('🔥')

    expect(editor.getSnapshot()).not.toBe(before)
    expect(editor.getSnapshot().brush).toBe('🔥')
  })

  it('notifies subscribers when state changes', () => {
    const { editor } = mount()
    const listener = vi.fn()

    editor.subscribe(listener)
    editor.setBrush('🔥')

    expect(listener).toHaveBeenCalled()
  })

  it('stops notifying after unsubscribe', () => {
    const { editor } = mount()
    const listener = vi.fn()

    editor.subscribe(listener)()
    editor.setBrush('🔥')

    expect(listener).not.toHaveBeenCalled()
  })

  it('draws a cell from a single tap', () => {
    const { canvas, editor } = mount()

    tap(canvas, 5, 5)

    expect(editor.getSnapshot().isEmpty).toBe(false)
    expect(editor.toText()).toBe('❤️')
  })

  it('makes a whole stroke one undo step', () => {
    const { canvas, editor } = mount()
    const size = DEFAULT_THEME.baseCellSize

    down(canvas, 5, 5)
    move(canvas, 5 + size * 3, 5)
    up(canvas)

    expect(editor.getSnapshot().canUndo).toBe(true)

    editor.undo()

    expect(editor.getSnapshot().isEmpty).toBe(true)
    expect(editor.getSnapshot().canUndo).toBe(false)
    expect(editor.getSnapshot().canRedo).toBe(true)
  })

  it('leaves no gaps in a fast drag', () => {
    const { canvas, editor } = mount()
    const size = DEFAULT_THEME.baseCellSize

    // One jump of four cells with no intermediate events at all — exactly
    // what a fast drag looks like. Defect 5: the old engine drew only at the
    // event points and left a dotted trail.
    down(canvas, size / 2, size / 2)
    move(canvas, size * 4 + size / 2, size / 2)
    up(canvas)

    expect(editor.toText()).toBe('❤️❤️❤️❤️❤️')
  })

  it('rolls the stroke back when a second finger starts a pinch', () => {
    const { canvas, editor } = mount()
    const box = canvas.getBoundingClientRect()

    down(canvas, 5, 5)

    expect(editor.getSnapshot().isEmpty).toBe(false)

    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: box.left + 120,
        clientY: box.top + 5,
        isPrimary: false,
        pointerId: 2,
        pointerType: 'touch',
      }),
    )

    // The stroke is abandoned, not committed: an attempt to zoom must not
    // leave a stray cell behind.
    expect(editor.getSnapshot().isEmpty).toBe(true)
    expect(editor.getSnapshot().canUndo).toBe(false)
  })

  it('redoes what it undid', () => {
    const { canvas, editor } = mount()

    tap(canvas, 5, 5)
    editor.undo()
    editor.redo()

    expect(editor.toText()).toBe('❤️')
  })

  it('drops the redo stack after a new stroke', () => {
    const { canvas, editor } = mount()

    tap(canvas, 5, 5)
    editor.undo()
    tap(canvas, 5, 5)

    expect(editor.getSnapshot().canRedo).toBe(false)
  })

  it('erases with the eraser tool', () => {
    const { canvas, editor } = mount()

    tap(canvas, 5, 5)
    editor.setTool('eraser')
    tap(canvas, 5, 5)

    expect(editor.getSnapshot().isEmpty).toBe(true)
    expect(editor.getSnapshot().toolId).toBe('eraser')
  })

  it('makes clearing undoable', () => {
    const { canvas, editor } = mount()

    tap(canvas, 5, 5)
    editor.clear()

    expect(editor.getSnapshot().isEmpty).toBe(true)

    editor.undo()

    expect(editor.toText()).toBe('❤️')
  })

  it('records nothing for a clear on an empty scene', () => {
    const { editor } = mount()

    editor.clear()

    expect(editor.getSnapshot().canUndo).toBe(false)
  })

  it('exports the drawing as text with the filler between cells', () => {
    const { canvas, editor } = mount()
    const size = DEFAULT_THEME.baseCellSize

    tap(canvas, 5, 5)
    tap(canvas, 5 + size * 2, 5)

    expect(editor.toText()).toBe('❤️〰️❤️')
  })

  it('clamps zoom to the camera limits', () => {
    const { editor } = mount()

    editor.zoomBy(1000)

    expect(editor.getSnapshot().zoom).toBe(4)

    editor.zoomBy(0.00001)

    expect(editor.getSnapshot().zoom).toBe(0.1)
  })

  it('returns to zoom 1 on resetView', () => {
    const { editor } = mount()

    editor.zoomBy(2)
    editor.panBy(50, 50)
    editor.resetView()

    expect(editor.getSnapshot().zoom).toBe(1)
  })

  it('draws in the cell the pointer is over after panning', () => {
    const { canvas, editor } = mount()
    const size = DEFAULT_THEME.baseCellSize

    // Move the content one cell right, so screen x=5 is now cell -1.
    editor.panBy(size, 0)
    tap(canvas, 5, 5)
    editor.panBy(-size, 0)
    tap(canvas, 5, 5)

    // Two adjacent cells, so the export is two cells wide with no filler.
    expect(editor.toText()).toBe('❤️❤️')
  })

  it('removes its canvas and listeners on destroy', () => {
    const { canvas, container, editor } = mount()

    editor.destroy()

    expect(container.querySelector('canvas')).toBeNull()

    tap(canvas, 5, 5)

    expect(editor.getSnapshot().isEmpty).toBe(true)
  })

  it('survives destroy being called twice', () => {
    const { editor } = mount()

    editor.destroy()

    expect(() => editor.destroy()).not.toThrow()
  })
})
