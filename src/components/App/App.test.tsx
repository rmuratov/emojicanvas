import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'

import { App } from './App'
import '../../index.css'

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
