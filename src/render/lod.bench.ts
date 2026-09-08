import { test } from 'vitest'

import type { Theme } from './theme'

import {
  DESKTOP_VIEWPORT,
  frameScenario,
  PHONE_VIEWPORT,
} from '../bench/scenarios'
import { MIN_ZOOM } from '../core/camera'
import { DEFAULT_THEME } from './theme'

/**
 * The sweeps that decide where the levels of detail belong. Each disables
 * the level of detail under test, so a cell is drawn in the *richer* mode at
 * a size where the app would normally have switched away from it. The
 * question each answers is the same: how small can a cell get before the
 * richer mode stops paying for itself inside the 16.7ms frame budget?
 */
const GLYPHS_ALWAYS: Theme = {
  ...DEFAULT_THEME,
  blockLodThresholdPx: 0,
  colorLodThresholdPx: 0,
}

const COLOURS_ALWAYS: Theme = {
  ...DEFAULT_THEME,
  blockLodThresholdPx: 0,
  colorLodThresholdPx: Infinity,
}

const GLYPH_SIZES = [24, 16, 12, 10, 8, 6]
const COLOUR_SIZES = [8, 6, 4, 3, 2]
const MIN_ZOOM_CELL_PX = DEFAULT_THEME.baseCellSize * MIN_ZOOM

test('glyphs at shrinking cell sizes, phone at DPR 3', async ({ bench }) => {
  const scenarios = GLYPH_SIZES.map(cellSizePx => ({
    cellSizePx,
    scenario: frameScenario({
      cellSizePx,
      dpr: 3,
      theme: GLYPHS_ALWAYS,
      viewport: PHONE_VIEWPORT,
    }),
  }))

  await bench.compare(
    ...scenarios.map(({ cellSizePx, scenario }) =>
      bench(`${cellSizePx}px cells, ${scenario.cells} glyphs`, () => {
        scenario.draw()
      }),
    ),
  )
})

test('colour fills at shrinking cell sizes, phone at DPR 3', async ({
  bench,
}) => {
  const scenarios = COLOUR_SIZES.map(cellSizePx => ({
    cellSizePx,
    scenario: frameScenario({
      cellSizePx,
      dpr: 3,
      theme: COLOURS_ALWAYS,
      viewport: PHONE_VIEWPORT,
    }),
  }))

  await bench.compare(
    ...scenarios.map(({ cellSizePx, scenario }) =>
      bench(`${cellSizePx}px cells, ${scenario.cells} fills`, () => {
        scenario.draw()
      }),
    ),
  )
})

/**
 * The same viewport at the same zoom, drawn full and drawn sparsely. The
 * spec claims frame cost follows window size and not drawing size; if these
 * two differ by much, the cost is following the drawing, and if they do not
 * differ at all, a nearly empty screen is paying the full screen's price.
 */
test('a full screen against a sparse one at minimum zoom', async ({
  bench,
}) => {
  const full = frameScenario({
    cellSizePx: MIN_ZOOM_CELL_PX,
    viewport: DESKTOP_VIEWPORT,
  })
  const sparse = frameScenario({
    cellSizePx: MIN_ZOOM_CELL_PX,
    drawnCells: 500,
    viewport: DESKTOP_VIEWPORT,
  })
  const empty = frameScenario({
    cellSizePx: MIN_ZOOM_CELL_PX,
    drawnCells: 1,
    viewport: DESKTOP_VIEWPORT,
  })

  await bench.compare(
    bench(`full, ${full.cells} cells drawn`, () => {
      full.draw()
    }),
    bench(`sparse, ${sparse.cells} cells drawn`, () => {
      sparse.draw()
    }),
    bench(`almost empty, ${empty.cells} cells drawn`, () => {
      empty.draw()
    }),
  )
})
