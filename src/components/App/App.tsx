import { useCallback, useRef, useState } from 'react'

import { useEditor, useEditorState } from '../../hooks'
import { EmojiPickerButton } from '../EmojiPickerButton'
import { Tool } from '../Tool'
import { Tools } from '../Tools'

export function App() {
  const [isBrushSelecting, setIsBrushSelecting] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  const editor = useEditor(ref)
  const { brush, canRedo, canUndo, isEmpty, toolId } = useEditorState(editor)

  const handleEmojiClick = useCallback(
    (emojiCode: string) => {
      setIsBrushSelecting(false)
      editor?.setBrush(emojiCode)
      editor?.setTool('brush')
    },
    [editor],
  )

  return (
    <div className="flex flex-col space-y-2 items-center pt-7 min-w-fit md:space-y-0 md:flex-row-reverse md:justify-center md:items-start">
      <div className="w-full h-[70vh] md:w-[600px] md:h-[600px]" ref={ref} />

      <Tools>
        <EmojiPickerButton
          brush={brush}
          isEmojiPickerHidden={!isBrushSelecting}
          isSelected={toolId === 'brush'}
          onClick={() => setIsBrushSelecting(true)}
          onEmojiClick={handleEmojiClick}
        />
        <Tool
          isSelected={toolId === 'eraser'}
          onClick={() => editor?.setTool('eraser')}
        >
          Eraser
        </Tool>
        <Tool disabled={!canUndo} onClick={() => editor?.undo()}>
          Undo
        </Tool>
        <Tool disabled={!canRedo} onClick={() => editor?.redo()}>
          Redo
        </Tool>
        <Tool onClick={() => editor?.resetView()}>Reset view</Tool>
        <Tool disabled={isEmpty} onClick={() => editor?.clear()}>
          Clear
        </Tool>
        <Tool
          disabled={isEmpty}
          onClick={async () => {
            const text = editor?.toText()

            if (text) {
              await navigator.clipboard.writeText(text)
            }
          }}
        >
          Copy
        </Tool>
      </Tools>
    </div>
  )
}
