import type { Picker } from 'emoji-picker-element'
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'emoji-picker': DetailedHTMLProps<
        HTMLAttributes<Picker>,
        Picker
      > & { class?: string }
    }
  }
}
