import { useRef, useEffect } from 'react'
import { Picker } from 'emoji-picker-element'

export function EmojiPicker({ isHidden, onEmojiClick }: IEmojiPickerProps) {
  const ref = useRef<Picker>(null)

  // TODO: Fix doubling if listener
  useEffect(() => {
    if (ref.current && onEmojiClick) {
      ref.current.addEventListener('emoji-click', event => {
        if (!event.detail.unicode) return

        onEmojiClick(event.detail.unicode)
      })
    }
  }, [onEmojiClick])

  return (
    <div className={`absolute top-8 -left-0 ${isHidden ? 'hidden' : ''}`}>
      {/*@ts-ignore*/}
      <emoji-picker ref={ref} class="light" />
    </div>
  )
}

export interface IEmojiPickerProps {
  isHidden?: boolean
  onEmojiClick?: (emojiCode: string) => void
}
