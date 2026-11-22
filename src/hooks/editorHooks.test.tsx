import { expect, it, vi } from 'vitest'
import { renderHook } from 'vitest-browser-react'

import { useEditor, useEmojiPicker } from './index'

it('waits for a mounted editor container', async () => {
  const hook = await renderHook(() => useEditor({ current: null }))

  expect(hook.result.current).toBeNull()
})

it('accepts a picker that has not mounted or has no selection handler', async () => {
  const callback = vi.fn()
  const empty = await renderHook(() =>
    useEmojiPicker({ current: null }, callback),
  )

  await empty.unmount()

  const picker = document.createElement('emoji-picker')
  await renderHook(() => useEmojiPicker({ current: picker }))
  picker.dispatchEvent(
    new CustomEvent('emoji-click', { detail: { unicode: '🦊' } }),
  )

  expect(callback).not.toHaveBeenCalled()
})
