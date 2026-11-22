import { expect, it } from 'vitest'
import { page } from 'vitest/browser'

it('starts the editor at the browser entry point', async () => {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.append(root)

  await import('./main')

  await expect.element(page.getByLabelText('Drawing canvas')).toBeVisible()
  expect(customElements.get('emoji-picker')).toBeDefined()
})
