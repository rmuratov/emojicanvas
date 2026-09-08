import { Scene } from '../scene'

/**
 * Messaging apps strip real spaces, which destroys the art on paste, so an
 * empty cell inside the drawing is written as a visible character instead.
 */
export const DEFAULT_FILLER = '〰️'

/**
 * Renders the scene as text, cropped to the drawing's bounding box. Empty
 * cells inside that box become the filler; there is nothing outside it to
 * trim, because the bounds are the content.
 */
export function toText(scene: Scene, filler: string = DEFAULT_FILLER): string {
  const bounds = scene.bounds()

  if (!bounds) return ''

  const rows: string[] = []

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    let row = ''

    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      row += scene.get(x, y) ?? filler
    }

    rows.push(row)
  }

  return rows.join('\n')
}
