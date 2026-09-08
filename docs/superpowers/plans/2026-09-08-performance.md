# Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the guessed level-of-detail thresholds with measured ones, and leave
behind a benchmark suite and a real-device measurement page that make the 16.7ms frame
budget checkable instead of merely declared.

**Architecture:** Three layers of evidence, from cheapest to most expensive. A
deterministic draw-call test runs in CI on every push and pins the invariant that levels of
detail actually bound the per-frame work — it measures counts, not time, so it cannot flake.
Vitest benchmarks in the `browser` project measure real frame time in real Chromium and are
run by hand, never in CI. A dev-only page (`bench.html`) runs the same scenario code on a
real phone, because `devicePixelRatio` and mobile GPU behaviour are not reproducible in an
emulator. The scenario fixtures live in one module, `src/bench/scenarios.ts`, so all three
measure the same thing.

**Tech Stack:** Vitest 5 (`browser` project, Playwright + Chromium), `vitest bench`
(Tinybench), Vite 8 dev server for the device page.

**Spec:** `docs/superpowers/specs/2026-09-07-foundation-design.md` — sections
"Performance", "Levels of detail", "Mobile devices", "Tests", step 7 of "Order of work".

**Executed on 2026-09-08.** Every task below is done, with two changes the measurements
forced and one step left for a human:

- Task 3's first numbers were wrong and had to be thrown away: a canvas nobody reads back
  is never rasterised, so the frames were timing command recording, not drawing. Every
  scenario now ends in a one-pixel `getImageData`. Relative margins of error went from
  13-70% to 0.2-1.8%, and the thresholds were re-derived from the second set.
- Those measurements exposed a defect worth its own task, inserted as **Task 4**: the
  renderer scanned every visible cell whether or not anything was drawn there, so an empty
  screen at minimum zoom cost 5.0ms a frame. Tasks that followed it are renumbered.
- Task 6, step 4 — the measurement on a real phone — is the one step an agent cannot do.
  The page is built and verified in a desktop browser; the phone run is left to a human.

## Global Constraints

- **Everything in the repository is English** — code, identifiers, comments, test names,
  commit messages, documents.
- The frame budget is **60fps, 16.7ms per frame**, on mobile too.
- **A benchmark regression is a reason to investigate, not to raise the threshold.**
- Prettier: no semicolons, single quotes, trailing commas, `arrowParens: 'avoid'`, 80 cols.
  `eslint-plugin-perfectionist` sorts object keys, imports, exports, interface members
  naturally; `npm run lint` runs with `--max-warnings 0`.
- Layering: dependencies point inward, `ui` → `editor` → `render`/`input`/`tools` → `core`.
  `src/bench/` is a new consumer at the `editor` level: it may import from `core`, `render`
  and `tools`, and nothing may import it.
- `vitest.config.ts` routes `src/{core,tools}/**/*.test.ts` to the `node` project and
  everything else to `browser`. A path matching both runs twice.
- `npm test` must not get slower: benchmarks are `vitest bench`, a separate command.
- Every write to a scene goes through an operation. Benchmark fixtures build scenes with
  `applyOperation`, never with `scene.writeCell`.

---

### Task 1: Benchmark harness and the three benchmarks the spec names

**Files:**

- Modify: `vitest.config.ts` (benchmark include per project)
- Modify: `package.json` (`bench` script)
- Create: `src/bench/scenarios.ts`
- Create: `src/render/scene.bench.ts`

**Interfaces:**

- Consumes: `renderScene(ctx, scene, opts)` from `src/render/scene.ts`; `GlyphAtlas`;
  `DEFAULT_THEME`, `Theme`; `createCamera`, `cellSizeAt`, `visibleBounds`, `MIN_ZOOM`;
  `Scene`, `applyOperation`; `createBrushTool`, `StrokeRecorder`.
- Produces, from `src/bench/scenarios.ts`:
  - `BENCH_EMOJI: readonly Emoji[]`
  - `type Viewport = { height: number; width: number }`
  - `DESKTOP_VIEWPORT: Viewport`, `PHONE_VIEWPORT: Viewport`
  - `createSurface(viewport: Viewport, dpr: number): CanvasRenderingContext2D`
  - `cameraForCellSize(theme: Theme, cellSizePx: number): Camera`
  - `filledViewport(camera: Camera, theme: Theme, viewport: Viewport): Scene`
  - `frameScenario(options: { cellSizePx: number; dpr?: number; theme?: Theme; viewport?: Viewport }): { draw: () => void; cells: number }`
  - `strokeScenario(options: { dpr?: number; theme?: Theme; viewport?: Viewport }): { draw: () => void; steps: number }`

- [x] **Step 1: Write the scenario fixtures**

Create `src/bench/scenarios.ts`:

```ts
import type { Camera } from '../core/camera'
import type { Emoji } from '../core/types'
import type { Theme } from '../render/theme'

import { cellSizeAt, createCamera, visibleBounds } from '../core/camera'
import { applyOperation } from '../core/operations'
import { Scene } from '../core/scene'
import { GlyphAtlas } from '../render/glyphAtlas'
import { renderScene } from '../render/scene'
import { DEFAULT_THEME } from '../render/theme'
import { createBrushTool } from '../tools/brush'
import { StrokeRecorder } from '../core/operations'

export type Viewport = { height: number; width: number }

/**
 * A dozen glyphs rather than one, so the atlas holds a realistic number of
 * buffers and the average-colour cache is exercised the way a real drawing
 * exercises it. One repeated emoji would measure a warmer cache than any
 * user ever gets.
 */
export const BENCH_EMOJI: readonly Emoji[] = [
  '❤️',
  '😀',
  '🌈',
  '🔥',
  '🍕',
  '🐙',
  '⭐',
  '🌊',
  '🎩',
  '🧩',
  '🚀',
  '🥑',
]

export const DESKTOP_VIEWPORT: Viewport = { height: 800, width: 1440 }
/** A common phone in CSS pixels; DPR is a separate argument. */
export const PHONE_VIEWPORT: Viewport = { height: 800, width: 390 }

/**
 * A camera whose zoom renders cells at exactly the requested size. The
 * benchmarks sweep cell size, not zoom, because the level-of-detail
 * thresholds are expressed in rendered pixels.
 */
export function cameraForCellSize(theme: Theme, cellSizePx: number): Camera {
  return { ...createCamera(), zoom: cellSizePx / theme.baseCellSize }
}

/**
 * A context of the given size, scaled for the device pixel ratio exactly as
 * the Editor scales its own canvas — the frame cost of a phone at DPR 3 is
 * the number this whole plan exists to find out.
 */
export function createSurface(
  viewport: Viewport,
  dpr: number,
): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width * dpr)
  canvas.height = Math.round(viewport.height * dpr)

  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  return ctx
}

/** Every visible cell drawn — the worst case a frame can be asked to render. */
export function filledViewport(
  camera: Camera,
  theme: Theme,
  viewport: Viewport,
): Scene {
  const scene = new Scene()
  const bounds = visibleBounds(
    camera,
    theme.baseCellSize,
    viewport.width,
    viewport.height,
  )
  const changes = []

  let i = 0

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      changes.push({ value: BENCH_EMOJI[i++ % BENCH_EMOJI.length], x, y })
    }
  }

  applyOperation(scene, { changes, label: 'bench' })

  return scene
}

/**
 * One full frame of a full screen at the given rendered cell size, ready to
 * be timed. The atlas is warmed first: the first frame pays for rasterising
 * every glyph, and that cost belongs to a different measurement than the
 * steady-state frame time.
 */
export function frameScenario(options: {
  cellSizePx: number
  dpr?: number
  theme?: Theme
  viewport?: Viewport
}): { cells: number; draw: () => void } {
  const theme = options.theme ?? DEFAULT_THEME
  const viewport = options.viewport ?? DESKTOP_VIEWPORT
  const dpr = options.dpr ?? 1
  const camera = cameraForCellSize(theme, options.cellSizePx)
  const scene = filledViewport(camera, theme, viewport)
  const ctx = createSurface(viewport, dpr)
  const atlas = new GlyphAtlas(dpr, theme.fontStack)
  const draw = () =>
    renderScene(ctx, scene, {
      atlas,
      camera,
      height: viewport.height,
      theme,
      width: viewport.width,
    })

  draw()

  return { cells: scene.size, draw }
}

/**
 * A stroke drawn diagonally across the whole screen, redrawing after every
 * pointer step, which is what the app actually does while a finger moves.
 * Measures the interactive path — recording plus redraw — not rendering
 * alone.
 */
export function strokeScenario(
  options: {
    dpr?: number
    theme?: Theme
    viewport?: Viewport
  } = {},
): { draw: () => void; steps: number } {
  const theme = options.theme ?? DEFAULT_THEME
  const viewport = options.viewport ?? DESKTOP_VIEWPORT
  const dpr = options.dpr ?? 1
  const camera = createCamera()
  const ctx = createSurface(viewport, dpr)
  const atlas = new GlyphAtlas(dpr, theme.fontStack)
  const cellSize = cellSizeAt(theme.baseCellSize, camera.zoom)
  const steps = Math.round(viewport.width / cellSize)
  const tool = createBrushTool()

  const draw = () => {
    const scene = new Scene()
    const recorder = new StrokeRecorder()
    const ctxTool = { brush: BENCH_EMOJI[0], recorder, scene }

    tool.onDown({ x: 0, y: 0 }, ctxTool)

    for (let i = 1; i <= steps; i++) {
      tool.onMove(
        { x: i, y: Math.round((i * viewport.height) / viewport.width) },
        ctxTool,
      )
      renderScene(ctx, scene, {
        atlas,
        camera,
        height: viewport.height,
        theme,
        width: viewport.width,
      })
    }

    tool.onUp(ctxTool)
    recorder.commit('bench')
  }

  draw()

  return { draw, steps }
}
```

No barrel: `src/bench/` is a leaf that nothing else imports, and the repository's other
barrels exist for layers that are consumed. An unused re-export file would be dead code.

- [x] **Step 2: Route benchmarks to the browser project**

In `vitest.config.ts`, give each project an explicit `benchmark.include`. Without this,
Vitest's default benchmark glob matches in both projects and every `.bench.ts` runs twice —
once in `node`, where `document` does not exist.

```ts
      {
        test: {
          benchmark: { include: ['src/{core,tools}/**/*.bench.ts'] },
          environment: 'node',
          include: ['src/{core,tools}/**/*.test.ts'],
          name: 'node',
        },
      },
      {
        test: {
          benchmark: {
            exclude: ['src/{core,tools}/**/*.bench.ts'],
            include: ['src/**/*.bench.ts'],
          },
          browser: { ... unchanged ... },
          exclude: ['src/{core,tools}/**/*.test.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          name: 'browser',
        },
      },
```

Add to `package.json` scripts, keeping the existing order of the test scripts:

```json
    "bench": "vitest bench --reporter=verbose",
```

The reporter is not optional: the default reporter prints pass/fail and no numbers, so a
`bench` script without it reports nothing.

- [x] **Step 3: Write the three benchmarks the spec names**

Create `src/render/scene.bench.ts`. **Vitest 5 has no top-level `bench` export**: a
benchmark is registered through the `bench` fixture of an ordinary test, and
`bench.compare(...)` runs a group and prints one table for it. Importing `bench` from
`vitest` fails with `does not provide an export named 'bench'`.

```ts
import { test } from 'vitest'

import {
  DESKTOP_VIEWPORT,
  frameScenario,
  PHONE_VIEWPORT,
  strokeScenario,
} from '../bench/scenarios'
import { MIN_ZOOM } from '../core/camera'
import { DEFAULT_THEME } from './theme'

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
```

- [x] **Step 4: Run the benchmarks and confirm they measure something**

Run: `npm run bench -- --reporter=verbose` — the default reporter prints no table
Expected: six benchmarks report times under the `browser (chromium)` project, and
`npm test` still reports 186 passing tests without running any benchmark.

- [x] **Step 5: Verify lint, types and formatting**

Run: `npm run lint && npm run format:check && npm run build`
Expected: all pass.

- [x] **Step 6: Commit**

```bash
git add vitest.config.ts package.json src/bench src/render/scene.bench.ts
git commit -m "perf: add browser benchmarks for frame time and a full-screen stroke"
```

---

### Task 2: A draw-call budget test that CI can run

Benchmarks measure time, which is machine-dependent and cannot gate a build. What _can_
gate a build is the count of drawing calls per frame: levels of detail exist to bound that
count, and the way they break is silently — a threshold edited to zero, or a `continue`
lost from the block loop, still renders a correct-looking picture, only slower. These tests
pin the bound.

**Files:**

- Create: `src/render/drawBudget.test.ts`

**Interfaces:**

- Consumes: `frameScenario`, `cameraForCellSize`, `filledViewport`, `createSurface`,
  `DESKTOP_VIEWPORT` from `src/bench/scenarios.ts`; `renderScene`; `DEFAULT_THEME`;
  `GlyphAtlas`.
- Produces: nothing other tasks consume.

- [x] **Step 1: Write the failing tests**

Create `src/render/drawBudget.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  cameraForCellSize,
  createSurface,
  DESKTOP_VIEWPORT,
  filledViewport,
} from '../bench/scenarios'
import { GlyphAtlas } from './glyphAtlas'
import { renderScene } from './scene'
import { DEFAULT_THEME } from './theme'

/**
 * Counts the drawing calls one frame makes. Times vary with the machine and
 * cannot gate a build; these counts are the same everywhere, and they are
 * what the levels of detail exist to bound.
 */
function countingContext(ctx: CanvasRenderingContext2D) {
  const counts = { drawImage: 0, fillRect: 0 }

  const proxy = new Proxy(ctx, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target)

      if (typeof value !== 'function') return value

      return (...args: unknown[]) => {
        if (prop === 'drawImage') counts.drawImage++
        if (prop === 'fillRect') counts.fillRect++

        return (value as (...a: unknown[]) => unknown).apply(target, args)
      }
    },
    set(target, prop, value) {
      Reflect.set(target, prop, value, target)

      return true
    },
  })

  return { counts, ctx: proxy }
}

function drawOneFrame(cellSizePx: number) {
  const camera = cameraForCellSize(DEFAULT_THEME, cellSizePx)
  const scene = filledViewport(camera, DEFAULT_THEME, DESKTOP_VIEWPORT)
  const { counts, ctx } = countingContext(createSurface(DESKTOP_VIEWPORT, 1))

  renderScene(ctx, scene, {
    atlas: new GlyphAtlas(1, DEFAULT_THEME.fontStack),
    camera,
    height: DESKTOP_VIEWPORT.height,
    theme: DEFAULT_THEME,
    width: DESKTOP_VIEWPORT.width,
  })

  return { cells: scene.size, counts }
}

describe('per-frame drawing budget', () => {
  it('draws one glyph per visible cell at the glyph level of detail', () => {
    const { cells, counts } = drawOneFrame(DEFAULT_THEME.baseCellSize)

    expect(counts.drawImage).toBe(cells)
    // Only the background fill; glyphs are drawImage, not fillRect.
    expect(counts.fillRect).toBe(1)
  })

  it('stops rasterising glyphs below the colour threshold', () => {
    const { cells, counts } = drawOneFrame(
      DEFAULT_THEME.colorLodThresholdPx - 0.5,
    )

    expect(counts.drawImage).toBe(0)
    expect(counts.fillRect).toBe(cells + 1)
  })

  it('bounds block fills by the block threshold, not by the cell count', () => {
    const cellSizePx = DEFAULT_THEME.blockLodThresholdPx / 4
    const { cells, counts } = drawOneFrame(cellSizePx)
    // Blocks are at least blockLodThresholdPx across, so the screen holds at
    // most this many of them however far the camera zooms out.
    const perRow = DESKTOP_VIEWPORT.width / DEFAULT_THEME.blockLodThresholdPx
    const perColumn =
      DESKTOP_VIEWPORT.height / DEFAULT_THEME.blockLodThresholdPx
    const budget = Math.ceil(perRow + 1) * Math.ceil(perColumn + 1)

    expect(counts.fillRect - 1).toBeLessThanOrEqual(budget)
    expect(counts.fillRect - 1).toBeLessThan(cells / 4)
  })
})
```

- [x] **Step 2: Run the tests**

Run: `npx vitest run --project browser src/render/drawBudget.test.ts`
Expected: three tests pass. If the third fails, `drawBlocks` is not bounding its fills and
that is a defect to investigate, not a test to relax.

- [x] **Step 3: Prove the tests bite, by mutation**

Temporarily set `blockLodThresholdPx: 0` and `colorLodThresholdPx: 0` in
`src/render/theme.ts`, re-run the file, and confirm the second and third tests fail. Then
revert the edit and confirm they pass again.

- [x] **Step 4: Commit**

```bash
git add src/render/drawBudget.test.ts
git commit -m "test: pin the per-frame drawing budget the levels of detail promise"
```

---

### Task 3: Measure frame time against cell size

The two thresholds in `render/theme.ts` are the spec's starting guesses. This task produces
the numbers that replace them: the rendered cell size at which a full screen of glyphs stops
fitting the 16.7ms budget (which sets `colorLodThresholdPx`) and the size at which a full
screen of per-cell colour fills stops fitting it (which sets `blockLodThresholdPx`).

**Files:**

- Create: `src/render/lod.bench.ts`

**Interfaces:**

- Consumes: `frameScenario`, `PHONE_VIEWPORT` from `src/bench/scenarios.ts`;
  `DEFAULT_THEME`, `Theme`.
- Produces: measurement numbers, recorded in `docs/superpowers/PROGRESS.md` by Task 5.

- [x] **Step 1: Write the sweep**

Create `src/render/lod.bench.ts`. Both sweeps disable the levels of detail under test by
setting the thresholds to zero, so each measures the cost of the _richer_ mode at a size
where the app would normally have switched away from it. That is the whole question: how
small can a cell get before the richer mode stops paying for itself?

```ts
import type { Theme } from './theme'

import { bench, describe } from 'vitest'

import { frameScenario, PHONE_VIEWPORT } from '../bench/scenarios'
import { DEFAULT_THEME } from './theme'

/** Levels of detail off: every cell is drawn in the mode under test. */
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

const GLYPH_SIZES = [24, 16, 12, 10, 8, 6, 4]
const COLOUR_SIZES = [8, 6, 4, 3, 2, 1.5, 1]

describe('glyphs at shrinking cell sizes, phone viewport at DPR 3', () => {
  for (const cellSizePx of GLYPH_SIZES) {
    const scenario = frameScenario({
      cellSizePx,
      dpr: 3,
      theme: GLYPHS_ALWAYS,
      viewport: PHONE_VIEWPORT,
    })

    bench(`${cellSizePx}px cells, ${scenario.cells} glyphs`, () => {
      scenario.draw()
    })
  }
})

describe('colour fills at shrinking cell sizes, phone viewport at DPR 3', () => {
  for (const cellSizePx of COLOUR_SIZES) {
    const scenario = frameScenario({
      cellSizePx,
      dpr: 3,
      theme: COLOURS_ALWAYS,
      viewport: PHONE_VIEWPORT,
    })

    bench(`${cellSizePx}px cells, ${scenario.cells} fills`, () => {
      scenario.draw()
    })
  }
})
```

Sweep both viewports, not just the phone: a threshold is one number for every window, so it
has to hold in the largest one, and a 1440x800 desktop window holds 3.7 times as many cells
as a 390x800 phone screen at the same cell size. The desktop turned out to be the binding
case in both sweeps.

- [x] **Step 2: Run the sweep and record the numbers**

Run: `npm run bench -- src/render/lod.bench.ts`
Write down, for each sweep, the mean time per frame at each cell size, and the hardware the
numbers came from. The threshold to adopt is the smallest swept size whose mean frame time
still fits 16.7ms, with the next size down exceeding it.

- [x] **Step 3: Commit**

```bash
git add src/render/lod.bench.ts
git commit -m "perf: sweep frame time against rendered cell size for both levels of detail"
```

---

### Task 4: Make a sparse drawing cost what it draws

Task 3's sweep compared a full screen at minimum zoom with a sparse one and an almost empty
one: 14.6ms, 6.3ms and 5.0ms. Five milliseconds of a 16.7ms budget went on a screen with one
cell drawn on it. The renderer looked up all 1,152,000 visible cells and built a string key
for each, and the spec's first claim — that frame cost follows the window and not the
drawing — was true only in the direction that flatters it.

**Files:**

- Modify: `src/render/scene.ts`
- Modify: `src/render/drawBudget.test.ts`, `src/render/scene.test.ts`
- Modify: `src/bench/scenarios.ts` (a `drawnCells` option, for sparse fixtures)

**Interfaces:**

- Consumes: `Scene.size`, `Scene.entries()`, `GlyphAtlas.averageColorRgb`.
- Produces: no new exports. `renderScene` gains a private choice of walk.

- [x] **Step 1: Write the failing lookup-budget tests**

In `src/render/drawBudget.test.ts`, wrap the scene in a counting Proxy the way the context
is already wrapped, and assert that rendering a one-cell drawing at the block level and at
the colour level makes fewer than a hundredth as many lookups as the viewport has cells,
while a drawing that fills the viewport still makes exactly one per visible cell.

- [x] **Step 2: Run them and watch them fail**

Run: `npx vitest run --project browser src/render/drawBudget.test.ts`
Expected: `expected 1152000 to be less than 11520`.

- [x] **Step 3: Walk whichever side is smaller**

In `renderScene`, compute `scene.size < cellCount(bounds)` once and branch on it: the block
level gets `drawSparseBlocks`, which accumulates each drawn cell into the block it falls in
and fills each block once; the glyph and colour levels get `drawSparseCells`, one step per
drawn cell. Block alignment, block size and averaged colour must match the dense path
exactly. The sparse block path's sums live in module-level scratch buffers, emptied per
frame, because allocating them per frame would put an allocation back in the draw loop.

- [x] **Step 4: Pin that both walks draw the same picture**

In `src/render/scene.test.ts`, render the same visible drawing twice: once as itself, and
once with enough off-screen cells added to push `scene.size` past the visible count and
force the other walk. The two surfaces must be equal byte for byte. Put the cluster off a
block boundary — one aligned with a block hides a block drawn at its first cell's
coordinates instead of at the block's own.

- [x] **Step 5: Verify by mutation**

Misalign a sparse block, then drop the colour averaging. Each must fail the block
equivalence test. (Both did.)

- [x] **Step 6: Confirm the win, and check the equal-density case**

Run: `npm run bench -- src/render/lod.bench.ts`
Measured: an almost empty screen went 5.0ms → 0.09ms, a 500-cell drawing 6.3ms → 0.22ms,
and a full one was unchanged. Flipping the comparison to `<=` so that an exactly-full
screen also takes the scene walk changed nothing (13.9ms against 14.0ms), so the strict
comparison stands.

- [x] **Step 7: Commit**

```bash
git add src/render/scene.ts src/render/drawBudget.test.ts src/render/scene.test.ts src/bench/scenarios.ts
git commit -m "perf: walk the scene, not the viewport, when the drawing is the smaller one"
```

---

### Task 5: Set the thresholds from the measurements

**Files:**

- Modify: `src/render/theme.ts` (threshold values and the comments that justify them)
- Modify: `src/render/theme.test.ts` if, and only if, a relation between values changes

**Interfaces:**

- Consumes: the numbers from Task 3.
- Produces: `DEFAULT_THEME.colorLodThresholdPx` and `DEFAULT_THEME.blockLodThresholdPx`,
  read by `levelOfDetail`, `renderScene`, and Task 2's budget test.

- [x] **Step 1: Edit the values, and say where they came from**

Replace the two threshold fields' doc comments with the measured basis — the viewport, the
device pixel ratio, the hardware, and the frame time at the chosen size and at the size
below it. A number without its measurement is another guess.

Adopted: `colorLodThresholdPx` 12 → **16**, `blockLodThresholdPx` 4 → **6**. Both old
values sat below the budget line rather than above it. 16 is also an atlas step, which is
why it is so much cheaper than its neighbours — one buffer pixel per screen pixel is a
copy, anything else is a resample, and 2,880 glyphs at 20px cost 14.5ms against 4,500 at
16px for 5.4ms.

- [x] **Step 2: Run the full suite**

One guard in `drawBudget.test.ts` had to move with the threshold: it asserted the viewport
holds more than 5,000 cells at the probe size, which a 16px threshold makes 4,836. The
guard is there to keep the viewport far larger than the one-cell drawing, so it now asks
for a thousand.

Run: `npm test`
Expected: all tests pass. `theme.test.ts` asserts relations between the thresholds, not
literal values, so tuning must not break it; `drawBudget.test.ts` derives its budget from
the thresholds and must not break either. If either fails, the new values contradict an
invariant and the failure is the finding.

- [x] **Step 3: Confirm the app still looks right**

Run `npm run dev`, draw, and zoom out through both thresholds. The switch to colour and to
blocks should be invisible as a change of content — the picture stays the same picture, only
coarser.

- [x] **Step 4: Commit**

```bash
git add src/render/theme.ts
git commit -m "perf: set the level-of-detail thresholds from measured frame times"
```

---

### Task 6: Real-device measurement page, and the documents

`devicePixelRatio`, thermal throttling and mobile GPU behaviour are not reproducible in
headless Chromium on a laptop, and the spec asks for verification on a real device. This
page runs the same scenarios from `src/bench/scenarios.ts` in whatever browser opens it.
It is dev-only: Vite serves any HTML file in the project root during `npm run dev`, and
because it is not listed in `build.rollupOptions.input` it never reaches `dist/` or
GitHub Pages.

**Files:**

- Create: `bench.html`
- Create: `src/bench/main.ts`
- Modify: `docs/superpowers/PROGRESS.md`
- Modify: `CLAUDE.md` (the commands section)
- Modify: `README.md` (drop "measure the thresholds" from the TODO list if it appears there)

**Interfaces:**

- Consumes: `frameScenario`, `strokeScenario`, `PHONE_VIEWPORT`, `DESKTOP_VIEWPORT`,
  `cameraForCellSize` from `src/bench/scenarios.ts`; `MIN_ZOOM`; `DEFAULT_THEME`.
- Produces: a page at `/bench.html` on the dev server.

- [x] **Step 1: Write the page entry**

Create `src/bench/main.ts`. It measures the median of a fixed number of frames rather than
the mean: a phone will throttle or hit a garbage collection somewhere in the run, and one
such frame moves a mean but not a median.

```ts
import { MIN_ZOOM } from '../core/camera'
import { DEFAULT_THEME } from '../render/theme'
import { frameScenario, strokeScenario } from './scenarios'

const FRAME_BUDGET_MS = 16.7
const RUNS = 30

type Result = { budget: number; label: string; medianMs: number }

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)

  return sorted[Math.floor(sorted.length / 2)]
}

function measure(run: () => void): number {
  const samples: number[] = []

  for (let i = 0; i < RUNS; i++) {
    const started = performance.now()

    run()
    samples.push(performance.now() - started)
  }

  return median(samples)
}

function viewport() {
  return { height: window.innerHeight, width: window.innerWidth }
}

function run(): Result[] {
  const dpr = window.devicePixelRatio || 1
  const size = viewport()
  const results: Result[] = []

  const atOneToOne = frameScenario({
    cellSizePx: DEFAULT_THEME.baseCellSize,
    dpr,
    viewport: size,
  })

  results.push({
    budget: FRAME_BUDGET_MS,
    label: `frame, full screen at 1x zoom (${atOneToOne.cells} cells)`,
    medianMs: measure(atOneToOne.draw),
  })

  const atMinZoom = frameScenario({
    cellSizePx: DEFAULT_THEME.baseCellSize * MIN_ZOOM,
    dpr,
    viewport: size,
  })

  results.push({
    budget: FRAME_BUDGET_MS,
    label: `frame, full screen at minimum zoom (${atMinZoom.cells} cells)`,
    medianMs: measure(atMinZoom.draw),
  })

  const stroke = strokeScenario({ dpr, viewport: size })

  results.push({
    // The stroke is one redraw per step, so its budget is the frame budget
    // times the number of steps.
    budget: FRAME_BUDGET_MS * stroke.steps,
    label: `stroke across the screen, ${stroke.steps} steps with a redraw each`,
    medianMs: measure(stroke.draw),
  })

  return results
}

function render(results: Result[]): void {
  const output = document.querySelector<HTMLElement>('#results')!

  output.textContent = [
    `${window.innerWidth}x${window.innerHeight} CSS px, DPR ${window.devicePixelRatio}`,
    navigator.userAgent,
    '',
    ...results.map(
      result =>
        `${result.medianMs.toFixed(2)}ms / ${result.budget.toFixed(1)}ms  ` +
        `${result.medianMs <= result.budget ? 'PASS' : 'OVER BUDGET'}  ${result.label}`,
    ),
  ].join('\n')
}

document
  .querySelector<HTMLButtonElement>('#run')!
  .addEventListener('click', () => {
    const output = document.querySelector<HTMLElement>('#results')!

    output.textContent = 'measuring...'
    // A frame between the label and the work, so the phone paints the
    // "measuring" text before the main thread is blocked for seconds.
    requestAnimationFrame(() => requestAnimationFrame(() => render(run())))
  })
```

Create `bench.html` in the project root:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EmojiCanvas performance</title>
  </head>
  <body style="font: 14px/1.5 system-ui; margin: 1rem">
    <h1 style="font-size: 1rem">EmojiCanvas performance</h1>
    <p>
      Measures the render paths against the 16.7ms frame budget on this device.
      Dev-only: this page is not part of the production build.
    </p>
    <button id="run" style="font: inherit; min-height: 44px; padding: 0 1rem">
      Measure
    </button>
    <pre id="results" style="white-space: pre-wrap"></pre>
    <script type="module" src="/src/bench/main.ts"></script>
  </body>
</html>
```

- [x] **Step 2: Check the page in a desktop browser**

Run: `npm run dev`, open `http://localhost:5173/bench.html`, press Measure.
Expected: three lines with times, a budget and PASS or OVER BUDGET. No console errors.

- [x] **Step 3: Check that it stays out of the production build**

Run: `npm run build && ls dist`
Expected: `dist/index.html` exists and `dist/bench.html` does not.

- [ ] **Step 4: Measure on a real phone** — the one step still open

`npm run dev` already binds to the network (`vite --host`). Open
`http://<your-lan-ip>:5173/emojicanvas/bench.html` on the phone — the base path applies —
and press Measure. Record the numbers, the device and its DPR. If a scenario is over
budget, that is a finding to investigate before the thresholds move.

Desktop Safari 26 has been measured and stands in for a second engine, not for a phone:
1470x833 at DPR 2, all four scenarios passing, the worst at 9ms of 16.7ms. A phone is
slower per core and usually runs at DPR 3. Worth doing in the same session as the mobile
layout check deferred out of plan 3 — the toolbar against the picker, and the 44px tap
targets — since both need the same device in hand.

- [x] **Step 5: Update the documents**

In `CLAUDE.md`, add `npm run bench` to the commands block, with a line saying benchmarks
are the `browser` project and are not part of `npm test`, and a line for the dev-only
`/bench.html` page. In `docs/superpowers/PROGRESS.md`, record: plan 4 done, the measured
numbers and the hardware they came from, the thresholds adopted, and whether the real-device
measurement has been taken or is still outstanding.

- [x] **Step 6: Verify everything**

Run: `npm test && npm run lint && npm run format:check && npm run build`
Expected: all pass.

- [x] **Step 7: Commit**

```bash
git add bench.html src/bench/main.ts CLAUDE.md README.md docs/superpowers/PROGRESS.md
git commit -m "perf: add a dev-only page for measuring frame time on a real device"
```

---

### Task 7: The block level as one image, after Safari

Added after the plan was otherwise complete. A run of the page from Task 6 in desktop
Safari 26 (1470x833 at device pixel ratio 2) reported a full screen at minimum zoom —
136,220 cells — at 20ms against the 16.7ms budget. Everything else passed, and the
ordinary case, a 500-cell drawing at the same zoom, took 2ms. The spec's rule is that a
regression is a reason to investigate.

**Files:**

- Create: `src/render/blockCost.bench.ts`
- Modify: `src/render/scene.ts`, `src/render/drawBudget.test.ts`

- [x] **Step 1: Split the frame before changing anything**

`blockCost.bench.ts` measures three variants of the same frame: everything; the scan alone,
with a scene whose cells are all off-screen so the walk still happens and no block is ever
filled; and the same scan with blocks ten times wider, so a hundredth as many fills. In
headless Chromium: 15.9ms, 6.8ms, 7.8ms. The frame was half viewport scan and half block
fills, and the fills were mostly `ctx.fillStyle = \`rgb(...)\`` — a string built and parsed
for each of thirty-odd thousand blocks.

- [x] **Step 2: Paint the blocks as one image**

Both block walks now accumulate into one `Uint32Array` of sums indexed by block, write a
pixel per block into a reused `ImageData`, and blit it with a single `drawImage` scaled to
the block grid, `imageSmoothingEnabled` off so each block stays one flat colour. One
contiguous image also has no seams, which is what the per-block fills needed their extra
pixel of overlap for. Only the part of the grid anything was drawn into is written and
blitted, so a small drawing on a zoomed-out screen does not pay for a screen-sized blit.

- [x] **Step 3: Re-point the draw-call test**

`drawBudget.test.ts` asserted that block fills were bounded by the block threshold; with
one blit that passes trivially. It now asserts the stronger thing: half a million cells in
view reach the canvas as exactly one `drawImage` and one `fillRect`, the background. The
equivalence tests in `scene.test.ts` are unchanged and still pass — both walks produce the
same picture byte for byte, now through the same blit.

- [x] **Step 4: Measure again**

Worst case 15.9ms → 8.6ms, and block count stopped mattering: ten times wider blocks
measure the same as the real ones. An almost empty screen at minimum zoom stays at 0.09ms,
a 500-cell drawing costs 0.62ms. What remains of the worst case is the scan, about 7ms of
the 8.6ms, which is the string key `Scene.get` builds per visible cell — recorded as a
finding rather than fixed, because removing it means keying cells by number and putting a
range limit on a grid the spec calls unbounded.

- [x] **Step 5: Commit**

```bash
git add src/render/scene.ts src/render/drawBudget.test.ts src/render/blockCost.bench.ts
git commit -m "perf: paint the block level of detail as one image"
```
