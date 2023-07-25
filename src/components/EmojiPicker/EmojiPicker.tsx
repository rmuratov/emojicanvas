import { Picker } from 'emoji-picker-element'
import { useRef } from 'react'

import { useEmojiPicker } from '../../hooks'

export function EmojiPicker({ isHidden, onEmojiClick }: IEmojiPickerProps) {
  const ref = useRef<Picker>(null)

  useEmojiPicker(ref, onEmojiClick)

  return (
    <div
      className={`fixed w-full bottom-0 left-0 md:w-auto md:absolute md:top-full md:-left-0 ${
        isHidden ? 'hidden' : ''
      }`}
    >
      {/*@ts-ignore*/}
      <emoji-picker class="light w-full" ref={ref} />
    </div>
  )
}

export interface IEmojiPickerProps {
  isHidden?: boolean
  onEmojiClick?: (emojiCode: string) => void
}
