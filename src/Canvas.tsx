import { useEffect, useRef, useState } from 'react'

import { EmojiCanvas } from './EmojiCanvas.ts'

export function Canvas({ brush }: ICanvasProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [canvas, setCanvas] = useState<EmojiCanvas>()

  useEffect(() => {
    const container = ref.current
    if (container && !container.hasChildNodes()) {
      const emojiCanvas = new EmojiCanvas(container, brush)

      if (!canvas) {
        setCanvas(emojiCanvas)
      }
    }
  }, [canvas, brush])

  useEffect(() => {
    canvas?.setBrush(brush)
  }, [canvas, brush])

  return <div ref={ref} />
}

export interface ICanvasProps {
  brush: string
}
