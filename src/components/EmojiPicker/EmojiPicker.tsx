import type { Picker } from 'emoji-picker-element'

import { useRef } from 'react'

import { useEmojiPicker } from '../../hooks'

export function EmojiPicker({
  onEmojiClick,
}: {
  onEmojiClick: (emoji: string) => void
}) {
  const ref = useRef<Picker>(null)

  useEmojiPicker(ref, onEmojiClick)

  return (
    <div className="picker-popover">
      <emoji-picker class="light" ref={ref} />
    </div>
  )
}
