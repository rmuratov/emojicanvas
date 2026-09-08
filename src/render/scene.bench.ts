import { test } from 'vitest'

import {
  DESKTOP_VIEWPORT,
  frameScenario,
  PHONE_VIEWPORT,
  strokeScenario,
} from '../bench/scenarios'
import { MIN_ZOOM } from '../core/camera'
import { DEFAULT_THEME } from './theme'

/**
 * The budget the spec sets: 60 frames per second, on a phone too. These
 * benchmarks report time; whether a number fits is a judgement made when
 * reading them, because a benchmark that fails a build on timing would fail
 * it on a loaded machine as well.
 *
 * Vitest 5 registers benchmarks through the `bench` fixture of a test rather
 * than through a top-level `bench` import, and `bench.compare` prints one
 * table for the group.
 */
const MIN_ZOOM_CELL_PX = DEFAULT_THEME.baseCellSize * MIN_ZOOM

test('frame time for a full screen', async ({ bench }) => {
  const desktop = frameScenario({ cellSizePx: DEFAULT_THEME.baseCellSize })
  const desktopZoomedOut = frameScenario({ cellSizePx: MIN_ZOOM_CELL_PX })
  const phone = frameScenario({
    cellSizePx: DEFAULT_THEME.baseCellSize,
    dpr: 3,
    viewport: PHONE_VIEWPORT,
  })
  const phoneZoomedOut = frameScenario({
    cellSizePx: MIN_ZOOM_CELL_PX,
    dpr: 3,
    viewport: PHONE_VIEWPORT,
  })

  await bench.compare(
    bench(`desktop, 1x zoom, ${desktop.cells} cells`, () => {
      desktop.draw()
    }),
    bench(`desktop, minimum zoom, ${desktopZoomedOut.cells} cells`, () => {
      desktopZoomedOut.draw()
    }),
    bench(`phone at DPR 3, 1x zoom, ${phone.cells} cells`, () => {
      phone.draw()
    }),
    bench(`phone at DPR 3, minimum zoom, ${phoneZoomedOut.cells} cells`, () => {
      phoneZoomedOut.draw()
    }),
  )
})

test('time for a stroke across the whole screen', async ({ bench }) => {
  const desktop = strokeScenario({ viewport: DESKTOP_VIEWPORT })
  const phone = strokeScenario({ dpr: 3, viewport: PHONE_VIEWPORT })

  await bench.compare(
    bench(`desktop, ${desktop.steps} steps, a redraw each`, () => {
      desktop.draw()
    }),
    bench(`phone at DPR 3, ${phone.steps} steps, a redraw each`, () => {
      phone.draw()
    }),
  )
})
