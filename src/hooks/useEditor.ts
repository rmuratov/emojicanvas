import type { RefObject } from 'react'

import { useEffect, useState } from 'react'

import type { Theme } from '../render/theme'

import { Editor } from '../editor'

/**
 * One Editor per mount. StrictMode mounts, unmounts and mounts again in
 * development, so the cleanup must fully undo the setup — the old
 * useEmojiCanvas depended on state it set itself, and its cleanup closed
 * over the previous value, which is how a second canvas appeared.
 */
export function useEditor(
  ref: RefObject<HTMLElement | null>,
  theme?: Partial<Theme>,
): Editor | null {
  const [editor, setEditor] = useState<Editor | null>(null)

  useEffect(() => {
    const container = ref.current

    if (!container) return

    const instance = new Editor(container, { theme })

    setEditor(instance)

    return () => {
      setEditor(null)
      instance.destroy()
    }
  }, [ref, theme])

  return editor
}
