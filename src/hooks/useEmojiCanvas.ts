import { MutableRefObject, useEffect, useMemo, useState } from 'react'
import { EmojiCanvas } from '../lib'

export function useEmojiCanvas(
  ref: MutableRefObject<HTMLElement | null>,
  initialBrush?: string,
) {
  const [canvas, setCanvas] = useState<EmojiCanvas>()
  const [isErasing, setIsErasing] = useState(false)

  useEffect(() => {
    if (ref && ref.current && !ref.current.hasChildNodes()) {
      const emojiCanvas = new EmojiCanvas(
        ref.current,
        initialBrush,
        setIsErasing,
      )

      if (!canvas) {
        setCanvas(emojiCanvas)
      }
    }

    return () => canvas?.remove()
  }, [ref, canvas, initialBrush])

  return useMemo(() => ({ canvas, isErasing }), [canvas, isErasing])
}
