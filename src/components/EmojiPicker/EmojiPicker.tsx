import { useRef } from 'react'
import 'emoji-picker-element'
import { Picker } from 'emoji-picker-element'
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
      <emoji-picker ref={ref} class="light w-full" />
    </div>
  )
}

export interface IEmojiPickerProps {
  isHidden?: boolean
  onEmojiClick?: (emojiCode: string) => void
}
