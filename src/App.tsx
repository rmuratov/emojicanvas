import { EmojiPicker } from './EmojiPicker.tsx'
import 'emoji-picker-element'
import {
  ButtonHTMLAttributes,
  PropsWithChildren,
  useCallback,
  useRef,
  useState,
} from 'react'
import { useEmojiCanvas } from './useEmojiCanvas.ts'

export function App() {
  const [isBrushSelecting, setIsBrushSelecting] = useState(false)
  const [brush, setBrush] = useState<string>('❤️')

  const ref = useRef<HTMLDivElement | null>(null)

  const { canvas: emojiCanvas, isErasing } = useEmojiCanvas(ref, brush)

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
      </Tools>
    </div>
  )
}

function Tools({ children }: PropsWithChildren) {
  return (
    <div className="flex space-x-3 md:flex-col md:space-x-0 md:space-y-3 md:mr-2">
      {children}
    </div>
  )
}

function Tool({
  children,
  className,
  onClick,
  isSelected,
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { isSelected?: boolean }
>) {
  return (
    <button
      className={`hover:bg-slate-100 border rounded px-1 ${className} ${
        isSelected && 'bg-slate-200'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
