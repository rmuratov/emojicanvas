import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'

import { Editor } from '../../editor'
import { App } from './App'
import '../../index.css'

afterEach(() => vi.restoreAllMocks())

describe('App', () => {
  it('renders a canvas', async () => {
    const screen = await render(<App />)

    await expect
      .element(screen.getByRole('button', { name: 'Clear' }))
      .toBeVisible()
    expect(document.querySelectorAll('canvas')).toHaveLength(1)
  })

  it('disables undo and redo until something is drawn', async () => {
    const screen = await render(<App />)

    await expect
      .element(screen.getByRole('button', { name: 'Undo' }))
      .toBeDisabled()
    await expect
      .element(screen.getByRole('button', { name: 'Redo' }))
      .toBeDisabled()
  })

  it('fits a drawing from the zoom toolbar once the canvas has content', async () => {
    const screen = await render(<App />)
    const fit = screen.getByRole('button', { name: 'Fit drawing' })

    await expect.element(fit).toBeDisabled()
    await screen.getByLabelText('Drawing canvas').click()
    await expect.element(fit).toBeEnabled()
    await fit.click()
    await expect
      .element(screen.getByText('400%', { exact: true }))
      .toBeVisible()
    await screen.getByRole('button', { name: 'Reset view' }).click()
    await expect
      .element(screen.getByText('100%', { exact: true }))
      .toBeVisible()
  })

  it('uses a different cursor for each tool only over the canvas', async () => {
    const screen = await render(<App />)
    const canvas = screen.getByLabelText('Drawing canvas')
    const cursors = new Set<string>()

    for (const name of [
      'Brush',
      'Eraser',
      'Fill',
      'Line',
      'Rectangle',
      'Ellipse',
      'Hand',
    ]) {
      const tool = screen.getByRole('button', { exact: true, name })

      await tool.click()
      await expect.element(tool).toHaveAttribute('aria-pressed', 'true')
      expect(getComputedStyle(await tool.element()).cursor).toBe('pointer')
      expect(getComputedStyle(await canvas.element()).cursor).toBe('auto')

      await canvas.hover()
      const cursor = getComputedStyle(await canvas.element()).cursor

      const [, encodedSvg = ''] =
        cursor.match(/data:image\/svg\+xml,([^"]+)/) ?? []
      const svg = new DOMParser().parseFromString(
        decodeURIComponent(encodedSvg),
        'image/svg+xml',
      )

      expect(svg.querySelector('svg')?.children).toHaveLength(1)
      expect(cursor).toMatch(name === 'Hand' ? /, grab$/ : /, default$/)
      cursors.add(cursor)
    }

    expect(cursors.size).toBe(7)
  })

  it('copies, undoes, redoes, and clears artwork from the toolbar', async () => {
    const screen = await render(<App />)
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const copy = screen.getByRole('button', { name: 'Copy drawing as text' })
    const button = (name: string) =>
      screen.getByRole('button', { exact: true, name })

    await button('3 × 3 cells').click()
    await screen.getByLabelText('Drawing canvas').click()
    await copy.click()
    expect(write).toHaveBeenCalledWith('❤️❤️❤️\n❤️❤️❤️\n❤️❤️❤️')
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Drawing copied as text.')

    write.mockRejectedValueOnce(new Error('Permission denied'))
    await copy.click()
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent(
        'Could not copy the drawing. Check clipboard permissions.',
      )

    vi.spyOn(Editor.prototype, 'toText').mockReturnValueOnce('')
    await copy.click()
    expect(write).toHaveBeenCalledTimes(2)

    await button('Undo').click()
    await expect.element(copy).toBeDisabled()
    await button('Redo').click()
    await expect.element(copy).toBeEnabled()
    await button('Clear').click()
    await expect.element(copy).toBeDisabled()
  })

  it('changes tools and edits with keyboard shortcuts', async () => {
    const screen = await render(<App />)
    const button = (name: string) =>
      screen.getByRole('button', { exact: true, name })
    const undo = button('Undo')

    await screen.getByLabelText('Drawing canvas').click()
    await userEvent.keyboard('e')
    await expect
      .element(button('Eraser'))
      .toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('{Control>}z{/Control}')
    await expect.element(undo).toBeDisabled()
    await userEvent.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')
    await expect.element(undo).toBeEnabled()
    await userEvent.keyboard('{Meta>}z{/Meta}{Control>}y{/Control}')
    await expect.element(undo).toBeEnabled()
    await userEvent.keyboard('{Control>}b{/Control}{Alt>}b{/Alt}q')

    const text = document.createElement('input')
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    for (const element of [text, editable]) {
      document.body.append(element)
      element.focus()
      await userEvent.keyboard('b')
      element.remove()
    }

    const blocked = new KeyboardEvent('keydown', { cancelable: true, key: 'b' })
    blocked.preventDefault()
    window.dispatchEvent(blocked)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }))
    await expect
      .element(button('Eraser'))
      .toHaveAttribute('aria-pressed', 'true')
  })

  it('picks an emoji, restores the brush, and dismisses the full picker', async () => {
    const screen = await render(<App />)
    const button = (name: string) =>
      screen.getByRole('button', { exact: true, name })
    const more = button('More emojis')

    await button('Eraser').click()
    await button('Star').click()
    await expect
      .element(button('Brush'))
      .toHaveAttribute('aria-pressed', 'true')
    await button('Hand').click()
    await more.click()
    await userEvent.keyboard('b')
    await expect.element(button('Hand')).toHaveAttribute('aria-pressed', 'true')
    const picker = document.querySelector('emoji-picker')!
    picker.dispatchEvent(new CustomEvent('emoji-click', { detail: {} }))
    await expect.element(more).toHaveAttribute('aria-expanded', 'true')
    picker.dispatchEvent(
      new CustomEvent('emoji-click', { detail: { unicode: '🦊' } }),
    )
    await expect.element(more).toHaveAttribute('aria-expanded', 'false')
    await expect
      .element(button('Brush'))
      .toHaveAttribute('aria-pressed', 'true')
    await expect.element(screen.getByText('Custom emoji')).toBeVisible()
    await expect.element(more).toHaveFocus()

    await more.click()
    await more.click()
    await expect.element(more).toHaveAttribute('aria-expanded', 'false')
    await more.click()
    await userEvent.keyboard('{Escape}')
    await expect.element(more).toHaveAttribute('aria-expanded', 'false')
    await more.click()
    await button('Fill').click()
    await expect.element(more).toHaveAttribute('aria-expanded', 'false')
    await button('Moon').click()
    await expect.element(button('Fill')).toHaveAttribute('aria-pressed', 'true')
  })

  it('zooms in and out and shows fractional percentages for distant content', async () => {
    const screen = await render(<App />)
    const button = (name: string) =>
      screen.getByRole('button', { exact: true, name })
    const canvas = screen.getByLabelText('Drawing canvas')

    await button('Zoom in').click()
    await expect
      .element(screen.getByText('125%', { exact: true }))
      .toBeVisible()
    await button('Zoom out').click()
    await expect
      .element(screen.getByText('100%', { exact: true }))
      .toBeVisible()
    await canvas.click()
    const target = await canvas.element()
    target.dispatchEvent(
      new WheelEvent('wheel', { cancelable: true, deltaX: 300_000 }),
    )
    await canvas.click()
    await button('Fit drawing').click()
    await expect.element(screen.getByText('<1%', { exact: true })).toBeVisible()
  })

  it('never puts the string false into a class list', async () => {
    const screen = await render(<App />)
    // The eraser is the button that carries an explicit isSelected={false}
    // while the brush is active. Defect 9: `${isSelected && '...'}`
    // interpolates the literal string "false" into className.
    const eraser = screen.getByRole('button', { name: 'Eraser' })

    await expect.element(eraser).toBeVisible()
    expect((await eraser.element()).className).not.toContain('false')
  })

  it('creates exactly one canvas under StrictMode double-mounting', async () => {
    await render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    // StrictMode mounts, unmounts and mounts again in development. The old
    // useEmojiCanvas depended on state it set itself and its cleanup closed
    // over the previous value, which is how a second canvas appeared.
    expect(document.querySelectorAll('canvas')).toHaveLength(1)
  })

  it('tears the editor down on unmount', async () => {
    const screen = await render(<App />)

    await screen.unmount()

    // Defect 6 in the spec was a listener that outlived its component. If
    // destroy did not run, the canvas would still be in the document.
    expect(document.querySelectorAll('canvas')).toHaveLength(0)
  })
})
