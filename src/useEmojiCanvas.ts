import { MutableRefObject, useEffect, useMemo, useState } from 'react'
import { EmojiCanvas } from './EmojiCanvas.ts'

export function useEmojiCanvas(
  ref: MutableRefObject<HTMLElement | null>,
  brush?: string,
) {
  const [canvas, setCanvas] = useState<EmojiCanvas>()
  const [isErasing, setIsErasing] = useState(false)

  useEffect(() => {
    if (ref && ref.current && !ref.current.hasChildNodes()) {
      const emojiCanvas = new EmojiCanvas(
        ref.current,
        brush,
        (isErasing: boolean) => setIsErasing(isErasing),
      )

      if (!canvas) {
        setCanvas(emojiCanvas)
      }
    }
  }, [ref, canvas, brush])

  return useMemo(() => ({ canvas, isErasing }), [canvas, isErasing])
}
