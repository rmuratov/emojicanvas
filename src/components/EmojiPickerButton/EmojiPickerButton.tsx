import { FC } from 'react'

import { EmojiPicker } from '../EmojiPicker'
import { Tool } from '../Tool'

export const EmojiPickerButton: FC<EmojiPickerButtonProps> = ({
  brush,
  isEmojiPickerHidden,
  isSelected,
  onClick,
  onEmojiClick,
}) => (
  <Tool className="relative" isSelected={!isSelected} onClick={onClick}>
    {brush}
    <EmojiPicker isHidden={isEmojiPickerHidden} onEmojiClick={onEmojiClick} />
  </Tool>
)

export interface EmojiPickerButtonProps {
  brush: string
  isEmojiPickerHidden: boolean
  isSelected: boolean
  onClick: () => void
  onEmojiClick: (emojiCode: string) => void
}
