import { MutableRefObject, useEffect, useState } from 'react'
import { EmojiCanvas } from './EmojiCanvas.ts'

export function useEmojiCanvas(
  ref: MutableRefObject<HTMLElement | null>,
  brush?: string,
) {
  const [canvas, setCanvas] = useState<EmojiCanvas>()

  useEffect(() => {
    if (ref && ref.current && !ref.current.hasChildNodes()) {
      const emojiCanvas = new EmojiCanvas(ref.current, brush)

      if (!canvas) {
        setCanvas(emojiCanvas)
      }
    }
  }, [ref, canvas, brush])

  return canvas
}
