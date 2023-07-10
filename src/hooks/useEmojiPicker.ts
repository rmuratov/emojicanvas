import { RefObject, useEffect } from 'react'
import { Picker } from 'emoji-picker-element'

export function useEmojiPicker(
  ref: RefObject<Picker>,
  onEmojiClick?: (emojiCode: string) => void,
) {
  // TODO: Fix adding meaningless callback
  useEffect(() => {
    if (ref.current && onEmojiClick) {
      ref.current.addEventListener('emoji-click', event => {
        if (!event.detail.unicode) return

        console.log(onEmojiClick)

        onEmojiClick(event.detail.unicode)
      })
    }
  }, [onEmojiClick, ref])
}
