import type { CSSProperties } from 'react'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { BrushSize } from '../../editor'

import { MAX_ZOOM, MIN_ZOOM } from '../../core/camera'
import { useEditor, useEditorState } from '../../hooks'
import { EmojiPicker } from '../EmojiPicker'
import { Icon } from './Icon'
import { toolCursor } from './icons'

const CANVAS_THEME = {
  backgroundColor: '#f9f8ff',
  gridColor: '#dcdced',
}

const TOOLS = [
  { id: 'brush', key: 'B', label: 'Brush' },
  { id: 'eraser', key: 'E', label: 'Eraser' },
  { id: 'fill', key: 'F', label: 'Fill' },
  { id: 'line', key: 'L', label: 'Line' },
  { id: 'rectangle', key: 'R', label: 'Rectangle' },
  { id: 'ellipse', key: 'O', label: 'Ellipse' },
  { id: 'pan', key: 'H', label: 'Hand' },
] as const

const PALETTE = [
  ['❤️', 'Red heart'],
  ['🧡', 'Orange heart'],
  ['💛', 'Yellow heart'],
  ['💚', 'Green heart'],
  ['💙', 'Blue heart'],
  ['💜', 'Purple heart'],
  ['🟥', 'Red square'],
  ['🟧', 'Orange square'],
  ['🟨', 'Yellow square'],
  ['🟩', 'Green square'],
  ['🟦', 'Blue square'],
  ['🟪', 'Purple square'],
  ['⬛', 'Black square'],
  ['⬜', 'White square'],
  ['🟫', 'Brown square'],
  ['⭐', 'Star'],
  ['✨', 'Sparkles'],
  ['🌙', 'Moon'],
  ['🍄', 'Mushroom'],
  ['🌷', 'Tulip'],
  ['🌿', 'Herb'],
  ['👾', 'Alien monster'],
  ['🛸', 'Flying saucer'],
  ['🔥', 'Fire'],
] as const

const BRUSH_SIZES: BrushSize[] = [1, 3, 5]

export function App() {
  const [isPickerOpen, setPickerOpen] = useState(false)
  const [status, setStatus] = useState('')
  const canvasRef = useRef<HTMLDivElement>(null)
  const pickerButtonRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const editor = useEditor(canvasRef, CANVAS_THEME)
  const {
    brush,
    brushSize,
    canRedo,
    canUndo,
    isEmpty,
    toolId,
    toolMessage,
    zoom,
  } = useEditorState(editor)
  const brushName =
    PALETTE.find(([emoji]) => emoji === brush)?.[1] ?? 'Custom emoji'
  const hasBrushSize = toolId === 'brush' || toolId === 'eraser'

  const selectEmoji = useCallback(
    (emoji: string) => {
      editor?.setBrush(emoji)

      if (
        editor?.getSnapshot().toolId === 'eraser' ||
        editor?.getSnapshot().toolId === 'pan'
      ) {
        editor?.setTool('brush')
      }
    },
    [editor],
  )

  const handlePickerSelection = useCallback(
    (emoji: string) => {
      selectEmoji(emoji)
      setPickerOpen(false)
      pickerButtonRef.current?.focus()
    },
    [selectEmoji],
  )

  useEffect(() => {
    if (!isPickerOpen) return

    function dismiss(event: PointerEvent) {
      if (!event.composedPath().includes(pickerRef.current!))
        setPickerOpen(false)
    }

    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [isPickerOpen])

  useEffect(() => {
    if (!editor) return

    const handleKey = (event: KeyboardEvent) => {
      if (isPickerOpen) {
        if (event.key === 'Escape') {
          setPickerOpen(false)
          pickerButtonRef.current?.focus()
        }

        return
      }

      if (event.defaultPrevented || event.altKey) return

      const target = event.target

      if (
        target instanceof HTMLElement &&
        (target.matches('input, textarea, select') || target.isContentEditable)
      )
        return

      const key = event.key.toLowerCase()

      if (event.ctrlKey || event.metaKey) {
        if (key === 'z' || key === 'y') {
          event.preventDefault()
          setStatus('')
          if (key === 'y' || event.shiftKey) editor.redo()
          else editor.undo()
        }

        return
      }

      const tool = TOOLS.find(item => item.key.toLowerCase() === key)

      if (tool) {
        setStatus('')
        editor.setTool(tool.id)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [editor, isPickerOpen])

  async function copyDrawing() {
    const text = editor?.toText()

    if (!text) return

    try {
      await navigator.clipboard.writeText(text)
      setStatus('Drawing copied as text.')
    } catch {
      setStatus('Could not copy the drawing. Check clipboard permissions.')
    }
  }

  return (
    <main className="studio">
      <aside aria-label="Drawing tools" className="tools-panel">
        <div className="tool-list">
          {TOOLS.map(tool => (
            <button
              aria-keyshortcuts={tool.key}
              aria-label={tool.label}
              aria-pressed={toolId === tool.id}
              className="tool-button"
              key={tool.id}
              onClick={() => {
                setStatus('')
                editor?.setTool(tool.id)
              }}
              title={`${tool.label} (${tool.key})`}
              type="button"
            >
              <Icon name={tool.id} />
            </button>
          ))}
        </div>

        <div aria-label="Brush size" className="size-options" role="group">
          {BRUSH_SIZES.map(size => (
            <button
              aria-label={`${size} × ${size} cells`}
              aria-pressed={brushSize === size}
              className="size-button"
              disabled={!hasBrushSize}
              key={size}
              onClick={() => editor?.setBrushSize(size)}
              title={`Brush size: ${size} × ${size} cells`}
              type="button"
            >
              <i
                aria-hidden="true"
                style={{ height: 4 + size * 2, width: 4 + size * 2 }}
              />
              {size}
            </button>
          ))}
        </div>
      </aside>

      <section aria-label="Canvas workspace" className="canvas-panel">
        <div className="canvas-header">
          <header className="brand-plate">
            <h1>
              Emoji<span>Canvas</span>
            </h1>
          </header>
          <div className="canvas-controls">
            <div
              aria-label="Drawing actions"
              className="drawing-actions"
              role="group"
            >
              <button
                aria-label="Undo"
                className="icon-button"
                disabled={!canUndo}
                onClick={() => {
                  setStatus('')
                  editor?.undo()
                }}
                title="Undo (Cmd/Ctrl+Z)"
                type="button"
              >
                <Icon name="undo" />
              </button>
              <button
                aria-label="Redo"
                className="icon-button"
                disabled={!canRedo}
                onClick={() => {
                  setStatus('')
                  editor?.redo()
                }}
                title="Redo (Cmd/Ctrl+Shift+Z)"
                type="button"
              >
                <Icon name="redo" />
              </button>
              <button
                aria-label="Clear"
                className="icon-button"
                disabled={isEmpty}
                onClick={() => {
                  setStatus('')
                  editor?.clear()
                }}
                title="Clear drawing"
                type="button"
              >
                <Icon name="clear" />
              </button>
              <button
                aria-label="Copy drawing as text"
                className="icon-button copy-button"
                disabled={isEmpty}
                onClick={() => void copyDrawing()}
                title="Copy drawing as text"
                type="button"
              >
                <Icon name="copy" />
              </button>
            </div>
            <div
              aria-label="Zoom controls"
              className="zoom-controls"
              role="group"
            >
              <button
                aria-label="Zoom out"
                className="icon-button"
                disabled={zoom <= MIN_ZOOM}
                onClick={() => editor?.zoomBy(1 / 1.25)}
                type="button"
              >
                <Icon name="minus" />
              </button>
              <span>{zoom < 0.01 ? '<1%' : `${Math.round(zoom * 100)}%`}</span>
              <button
                aria-label="Zoom in"
                className="icon-button"
                disabled={zoom >= MAX_ZOOM}
                onClick={() => editor?.zoomBy(1.25)}
                type="button"
              >
                <Icon name="plus" />
              </button>
              <button
                aria-label="Reset view"
                className="icon-button reset-button"
                onClick={() => editor?.resetView()}
                title="Reset view"
                type="button"
              >
                <Icon name="reset" />
              </button>
              <button
                aria-label="Fit drawing"
                className="icon-button"
                disabled={isEmpty}
                onClick={() => editor?.fitDrawing()}
                title="Fit drawing to view"
                type="button"
              >
                <Icon name="fit" />
              </button>
            </div>
          </div>
        </div>
        <div className="canvas-stage">
          <div
            className="canvas-mount"
            data-tool={toolId}
            onPointerDown={() => setStatus('')}
            ref={canvasRef}
            style={
              {
                '--tool-cursor': toolCursor(toolId),
              } as CSSProperties
            }
          />
          <p className="canvas-status" role="status">
            {status || toolMessage}
          </p>
        </div>
      </section>

      <aside aria-label="Emoji palette" className="palette-panel">
        <h2 className="panel-label">Emoji palette</h2>
        <div className="brush-preview">
          <div aria-hidden="true" className="brush-tile">
            {brush}
          </div>
          <div>
            <span>Active emoji</span>
            <strong>{brushName}</strong>
          </div>
        </div>
        <div className="swatches">
          {PALETTE.map(([emoji, name]) => (
            <button
              aria-label={name}
              aria-pressed={brush === emoji}
              className="swatch"
              key={emoji}
              onClick={() => {
                setStatus('')
                selectEmoji(emoji)
              }}
              title={name}
              type="button"
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="picker-anchor" ref={pickerRef}>
          <button
            aria-expanded={isPickerOpen}
            className="action-button more-button"
            onClick={() => setPickerOpen(!isPickerOpen)}
            ref={pickerButtonRef}
            type="button"
          >
            <Icon name="plus" /> More emojis
          </button>
          {isPickerOpen && <EmojiPicker onEmojiClick={handlePickerSelection} />}
        </div>
      </aside>
    </main>
  )
}
