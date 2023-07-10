import { EmojiPicker } from '../EmojiPicker'
import { useCallback, useRef, useState } from 'react'
import { useEmojiCanvas } from '../../hooks'
import { Tools } from '../Tools'
import { Tool } from '../Tool'

export function App() {
  const initialBrush = '❤️'
  const [isBrushSelecting, setIsBrushSelecting] = useState(false)
  const [brush, setBrush] = useState<string>(initialBrush)

  const ref = useRef<HTMLDivElement | null>(null)

  const { canvas: emojiCanvas, isErasing } = useEmojiCanvas(ref, initialBrush)

  const handleEmojiClick = useCallback(
    (emojiCode: string) => {
      setIsBrushSelecting(false)
      setBrush(emojiCode)
      emojiCanvas?.setBrush(emojiCode)
    },
    [emojiCanvas],
  )

  return (
    <div className="flex flex-col space-y-2 items-center pt-7 min-w-fit md:space-y-0 md:flex-row-reverse md:justify-center md:items-start">
      <div ref={ref} />

      <Tools>
        <Tool
          isSelected={!isErasing}
          className="relative"
          onClick={() => setIsBrushSelecting(true)}
        >
          {brush}
          <EmojiPicker
            isHidden={!isBrushSelecting}
            onEmojiClick={handleEmojiClick}
          />
        </Tool>
        <Tool
          isSelected={isErasing}
          onClick={() => emojiCanvas?.setErasingMode()}
        >
          Eraser
        </Tool>
        <Tool onClick={() => emojiCanvas?.clear()}>Clear</Tool>
        <Tool
          onClick={async () => {
            const str = emojiCanvas?.getDrawingAsString()

            if (str) {
              await navigator.clipboard.writeText(str)
            }
          }}
        >
          Copy
        </Tool>
      </Tools>

      {/*<dialog open className="border rounded px-1">*/}
      {/*  <p>Copied!</p>*/}
      {/*  <form method="dialog">*/}
      {/*    <button className="hover:bg-slate-100 border rounded px-1">OK</button>*/}
      {/*  </form>*/}
      {/*</dialog>*/}
    </div>
  )
}