import { test } from 'vitest'

import type { CellChange } from '../core/operations'

import {
  BENCH_EMOJI,
  cameraForCellSize,
  createSurface,
  DESKTOP_VIEWPORT,
  filledViewport,
} from '../bench/scenarios'
import { MIN_ZOOM, visibleBounds } from '../core/camera'
import { applyOperation } from '../core/operations'
import { Scene } from '../core/scene'
import { GlyphAtlas } from './glyphAtlas'
import { renderScene } from './scene'
import { DEFAULT_THEME } from './theme'

/**
 * The one scenario still over budget: every visible cell drawn at minimum
 * zoom. These three split its cost into the scan of the viewport and the
 * block fills, by holding one of them fixed while the other shrinks.
 */
const CELL_PX = DEFAULT_THEME.baseCellSize * MIN_ZOOM
const CAMERA = cameraForCellSize(DEFAULT_THEME, CELL_PX)
const BOUNDS = visibleBounds(
  CAMERA,
  DEFAULT_THEME.baseCellSize,
  DESKTOP_VIEWPORT.width,
  DESKTOP_VIEWPORT.height,
)
const VISIBLE =
  (BOUNDS.maxX - BOUNDS.minX + 1) * (BOUNDS.maxY - BOUNDS.minY + 1)

function scenario(scene: Scene, theme = DEFAULT_THEME) {
  const ctx = createSurface(DESKTOP_VIEWPORT, 2)
  const atlas = new GlyphAtlas(2, theme.fontStack)
  const draw = () => {
    renderScene(ctx, scene, {
      atlas,
      camera: CAMERA,
      height: DESKTOP_VIEWPORT.height,
      theme,
      width: DESKTOP_VIEWPORT.width,
    })
    ctx.getImageData(0, 0, 1, 1)
  }

  draw()

  return draw
}

test('where a full screen at minimum zoom spends its frame', async ({
  bench,
}) => {
  const full = filledViewport(CAMERA, DEFAULT_THEME, DESKTOP_VIEWPORT)

  // Enough cells to take the dense walk, all of them out of sight: the scan
  // happens, no block is ever filled.
  const offscreen = new Scene()
  const changes: CellChange[] = []

  for (let i = 0; i <= VISIBLE; i++) {
    changes.push({
      value: BENCH_EMOJI[i % BENCH_EMOJI.length],
      x: i,
      y: 100_000,
    })
  }

  applyOperation(offscreen, { changes, label: 'bench' })

  // Same scan, a hundredth of the fills.
  const bigBlocks = { ...DEFAULT_THEME, blockLodThresholdPx: 60 }

  await bench.compare(
    bench(`everything: ${full.size} cells, ${VISIBLE} visible`, scenario(full)),
    bench(
      'scan only: nothing in view, the walk still happens',
      scenario(offscreen),
    ),
    bench('same scan, 10x wider blocks', scenario(full, bigBlocks)),
  )
})
