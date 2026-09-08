import type { Picker } from 'emoji-picker-element'
import type { EmojiClickEvent } from 'emoji-picker-element/shared'
import type { RefObject } from 'react'

import { useEffect } from 'react'

export function useEmojiPicker(
  ref: RefObject<null | Picker>,
  onEmojiClick?: (emojiCode: string) => void,
) {
  useEffect(() => {
    const picker = ref.current

    if (!picker || !onEmojiClick) return

    // The package declares its own event type on the element; using ours
    // would not match the addEventListener overload it contributes.
    const handle = (event: EmojiClickEvent) => {
      if (!event.detail.unicode) return

      onEmojiClick(event.detail.unicode)
    }

    picker.addEventListener('emoji-click', handle)

    return () => picker.removeEventListener('emoji-click', handle)
  }, [onEmojiClick, ref])
}
