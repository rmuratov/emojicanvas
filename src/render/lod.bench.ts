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

const GLYPH_SIZES = [24, 20, 16, 14, 12, 10]
const COLOUR_SIZES = [8, 7, 6, 5, 4]
/**
 * A threshold is one number for every window, so it has to be safe in the
 * largest one. A desktop viewport is 3.7 times the area of the phone, which
 * at the same cell size is 3.7 times as many cells to draw.
 */
const DESKTOP_DPR = 2
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

test('glyphs at shrinking cell sizes, desktop at DPR 2', async ({ bench }) => {
  const scenarios = GLYPH_SIZES.map(cellSizePx => ({
    cellSizePx,
    scenario: frameScenario({
      cellSizePx,
      dpr: DESKTOP_DPR,
      theme: GLYPHS_ALWAYS,
      viewport: DESKTOP_VIEWPORT,
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

test('colour fills at shrinking cell sizes, desktop at DPR 2', async ({
  bench,
}) => {
  const scenarios = COLOUR_SIZES.map(cellSizePx => ({
    cellSizePx,
    scenario: frameScenario({
      cellSizePx,
      dpr: DESKTOP_DPR,
      theme: COLOURS_ALWAYS,
      viewport: DESKTOP_VIEWPORT,
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
