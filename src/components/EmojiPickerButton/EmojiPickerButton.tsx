import { Tool } from '../Tool'
import { EmojiPicker } from '../EmojiPicker'
import { FC } from 'react'

export const EmojiPickerButton: FC<EmojiPickerButtonProps> = ({
  brush,
  isEmojiPickerHidden,
  isSelected,
  onClick,
  onEmojiClick,
}) => (
  <Tool isSelected={!isSelected} className="relative" onClick={onClick}>
    {brush}
    <EmojiPicker isHidden={isEmojiPickerHidden} onEmojiClick={onEmojiClick} />
  </Tool>
)

export interface EmojiPickerButtonProps {
  onClick: () => void
  brush: string
  isEmojiPickerHidden: boolean
  isSelected: boolean
  onEmojiClick: (emojiCode: string) => void
}
