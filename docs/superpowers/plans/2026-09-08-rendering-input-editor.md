# Rendering, Input and the Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the engine core built in plan 2 on screen — a canvas renderer with a glyph
atlas and levels of detail, Pointer Events input with two-finger gestures, an `Editor`
facade, and a React shell ported onto it — then delete the old engine.

**Architecture:** The canvas is the size of its container, never the size of the drawing,
so frame cost follows window size. Each frame fills the background, then walks only the
cells inside `visibleBounds`, drawing each one as a pre-rasterised glyph from an atlas.
Pointer Events arrive as screen pixels; the `Editor` owns the camera and is the one place
that converts them to cells. React never re-renders while drawing: it subscribes to the
`Editor` through `useSyncExternalStore` and sees only toolbar-shaped state.

**Tech Stack:** TypeScript 5.9, canvas 2D, Pointer Events, React 19, Vitest 5
(the `browser` project — real Chromium via Playwright).

**Spec:** `docs/superpowers/specs/2026-09-07-foundation-design.md`

**Status:** `docs/superpowers/PROGRESS.md`

**Scope:** the spec's order of work, steps 4 (rendering), 5 (input — the tools half is
already done), 6 (editor and UI), plus removing the old engine from step 8. Benchmarks and
real-device measurement (step 7) are a later plan; nothing here may raise a performance
threshold, and nothing here needs one.

## Global Constraints

- **Everything in the repository is English** — identifiers, comments, test names, commit
  messages, docs. No exceptions.
- Branch **`foundation`**. Commits are allowed, pushing is not; leave `main` alone.
- `npm run lint` passes with `--max-warnings 0`; `npm test` and `npm run build` pass before
  any task is called done.
- Prettier: no semicolons, single quotes, 80-column width, `arrowParens: 'avoid'`,
  `trailingComma: 'all'`.
- `eslint-plugin-perfectionist` in natural mode: object keys, type members, interface
  members, JSX props, imports and exports sort naturally. `sort-classes` is disabled, so
  class member order is free-form. Object and type keys in this plan's code blocks are
  already sorted — do not reorder them.
- **Import order in this plan is not verified.** After creating each file run
  `npx eslint src --fix` and commit the fixed result. If the autofix does not settle it,
  the problem is not sorting — read the message.
- **Every write to the scene goes through an operation.** There is no `Scene.clear()`;
  clearing is `createClearOperation`. Nothing in this plan may call `scene.writeCell`
  directly except through `StrokeRecorder` or `applyOperation`.
- **`src/core` and `src/tools` stay untouched.** They are finished and tested. If something
  there looks wrong, stop and report it rather than editing it.
- Tests for everything this plan creates run in the **browser project**: `vitest.config.ts`
  routes `src/{core,tools}/**/*.test.ts` to the node project and *everything else* to the
  browser project. Do not add `src/render`, `src/input`, `src/editor` or `src/components`
  to the node project's `include` — a path matching both projects runs twice.
- The finished app must look and behave like the old one for everything the old one did:
  same toolbar markup, same Tailwind classes, `❤️` as the starting brush, `〰️` as the
  export filler, white background, `darkgrey` grid. What is *added* is undo, redo, reset
  view, panning and zooming.

## Existing contract

Everything below is already written and tested. Use it; do not rewrite it.

```ts
// src/core/types.ts
export type Cell = { x: number; y: number }
export type CellBounds = { maxX: number; maxY: number; minX: number; minY: number }
export type Emoji = string

// src/core/scene.ts
export const SCENE_DATA_VERSION = 1
export type SceneData = { cells: Record<string, Emoji>; version: number }
export class Scene {
  get size(): number
  bounds(): CellBounds | null
  entries(): IterableIterator<[Cell, Emoji]>
  get(x: number, y: number): Emoji | undefined
  has(x: number, y: number): boolean
  static fromJSON(data: SceneData): Scene
  toJSON(): SceneData
  writeCell(x: number, y: number, value: Emoji | undefined): void
}

// src/core/operations.ts
export type CellChange = { value: Emoji | undefined; x: number; y: number }
export type Operation = { changes: readonly CellChange[]; label: string }
export class StrokeRecorder {
  commit(label: string): null | { inverse: Operation; op: Operation }
  record(scene: Scene, x: number, y: number, value: Emoji | undefined): boolean
  rollback(scene: Scene): void
}
export function applyOperation(scene: Scene, op: Operation): void
export function createClearOperation(scene: Scene): Operation
export function invertOperation(scene: Scene, op: Operation): Operation

// src/core/history.ts
export class History {
  constructor(limit?: number)
  get canRedo(): boolean
  get canUndo(): boolean
  clear(): void
  commit(op: Operation, inverse: Operation): void
  redo(scene: Scene): boolean
  undo(scene: Scene): boolean
}

// src/core/camera.ts
export type Camera = { offsetX: number; offsetY: number; zoom: number }
export const MAX_ZOOM = 4
export const MIN_ZOOM = 0.1
export function cellSizeAt(baseCellSize: number, zoom: number): number
export function cellToScreen(camera, baseCellSize, x, y): { px: number; py: number }
export function clampZoom(zoom: number): number
export function createCamera(): Camera
export function screenToCell(camera, baseCellSize, px, py): Cell
export function visibleBounds(camera, baseCellSize, width, height): CellBounds
export function zoomAt(camera, factor, anchorPx, anchorPy): Camera

// src/core/export/text.ts
export const DEFAULT_FILLER = '〰️'
export function toText(scene: Scene, filler?: string): string

// src/tools/types.ts
export interface Tool {
  readonly id: string
  onCancel(ctx: ToolContext): void
  onDown(cell: Cell, ctx: ToolContext): void
  onMove(cell: Cell, ctx: ToolContext): void
  onUp(ctx: ToolContext): void
}
export type ToolContext = { brush: Emoji; recorder: StrokeRecorder; scene: Scene }

// src/tools/brush.ts, src/tools/eraser.ts
export function createBrushTool(): Tool
export function createEraserTool(): Tool
```

Three facts about that contract that this plan depends on, carried over from plan 2's
review:

- **`camera.offsetX`/`offsetY` are the world-pixel coordinates of the viewport's top-left
  corner.** A screen point `px` is world pixel `px + offsetX`. Increasing the offset moves
  the viewport right, which moves the *content* left.
- **Cancelling a stroke takes two calls:** `recorder.rollback(scene)` and then
  `tool.onCancel(ctx)`. The recorder restores the scene; the tool forgets its last cell.
  Neither does the other's job, and both are needed.
- **Never call `scene.bounds()` per frame.** It is an O(n) scan of every drawn cell. The
  renderer uses `visibleBounds` plus `get`. `getSnapshot().isEmpty` must be
  `scene.size === 0`, because `useSyncExternalStore` calls `getSnapshot` on every render.
  `bounds()` is for text export only.

## One deliberate deviation from the spec

The spec sketches the input layer as taking cells:

```ts
onDrawStart(cell: Cell): void
```

**This plan reports screen pixels instead** — `onDrawStart(px: number, py: number)`. The
reason: converting to a cell needs the camera and the base cell size, and the camera lives
in the `Editor` because pan and zoom mutate it. Giving `pointer.ts` a camera would either
duplicate that state or make the input layer own it, and either way `input/` starts
depending on `core/camera` and `render/theme`. Keeping it in pixels leaves `pointer.ts`
knowing nothing but the element and the events, and puts the single `screenToCell` call in
the `Editor`, which is where the requirement "floor screen coordinates to whole cells via
`screenToCell` before calling tools" is actually satisfied.

One smaller shape change follows from the same reasoning: the spec writes
`zoomBy(factor, anchor?: { px, py })`, and this plan writes
`zoomBy(factor, anchorPx?: number, anchorPy?: number)`. `core/camera`'s `zoomAt` already
takes two numbers, and a wheel event would otherwise allocate an anchor object per notch.

Nothing else in the spec changes.

## File structure

| File | Responsibility |
|---|---|
| `src/render/theme.ts` | Colours, base cell size, font stack, level-of-detail thresholds and the pure function that picks a level. No canvas. |
| `src/render/glyphAtlas.ts` | Rasterises each emoji once per size step; caches the buffer and the glyph's average colour. |
| `src/render/scene.ts` | `renderScene` — one full frame into a supplied 2D context, confined to `visibleBounds`. |
| `src/render/index.ts` | Barrel. |
| `src/input/pointer.ts` | Pointer Events, wheel and space/middle-button drag → drawing, pan and zoom callbacks in screen pixels. Returns a detach function. |
| `src/input/index.ts` | Barrel. |
| `src/editor/Editor.ts` | The facade: owns canvas, camera, scene, history, atlas, tools, the rAF loop and the `useSyncExternalStore` contract. |
| `src/editor/index.ts` | Barrel. |
| `src/hooks/useEditor.ts` | Creates one `Editor` per mount, StrictMode-safe, destroys it on unmount. |
| `src/hooks/useEditorState.ts` | `useSyncExternalStore` over an `Editor`. |
| `src/components/App/App.tsx` | Rewritten against `Editor`; gains undo, redo and reset-view buttons. |
| `src/components/Tool/Tool.tsx` | Class-list construction fixed; gains `disabled`. |
| `src/components/EmojiPicker/EmojiPicker.tsx` | `@ts-ignore` replaced by a typed custom element. |
| `src/hooks/useEmojiPicker.ts` | Listener removed on unmount; `console.log` deleted. |
| `src/types/emoji-picker.d.ts` | The `emoji-picker` JSX declaration. |

Deleted in the last task: `src/lib/EmojiCanvas.ts`, `src/lib/index.ts`,
`src/hooks/useEmojiCanvas.ts`, `src/render/glyphAtlas.smoke.test.ts`.

---

### Task 1: The theme and levels of detail

**Files:**
- Create: `src/render/theme.ts`
- Create: `src/render/theme.test.ts`
- Create: `src/render/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Theme`, `DEFAULT_THEME`, `LevelOfDetail`, `levelOfDetail(theme, cellSizePx)`.

The level-of-detail rule from the spec: at a rendered cell size of 12 logical pixels or
more, draw the glyph; below 12, fill the cell with the emoji's average colour and draw no
grid; below 4, merge cells into blocks. The thresholds are starting values and live in the
theme so the later performance plan can tune them without touching rendering logic.

- [ ] **Step 1: Write the failing test**

`src/render/theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { DEFAULT_THEME, levelOfDetail } from './theme'

describe('levelOfDetail', () => {
  it('draws glyphs at the default base cell size', () => {
    expect(levelOfDetail(DEFAULT_THEME, DEFAULT_THEME.baseCellSize)).toBe('glyph')
  })

  it('draws glyphs exactly at the colour threshold', () => {
    expect(levelOfDetail(DEFAULT_THEME, DEFAULT_THEME.colorLodThresholdPx)).toBe('glyph')
  })

  it('falls back to average colour just below the colour threshold', () => {
    expect(
      levelOfDetail(DEFAULT_THEME, DEFAULT_THEME.colorLodThresholdPx - 0.01),
    ).toBe('color')
  })

  it('draws blocks exactly at the block threshold', () => {
    expect(levelOfDetail(DEFAULT_THEME, DEFAULT_THEME.blockLodThresholdPx)).toBe('color')
  })

  it('merges cells into blocks below the block threshold', () => {
    expect(
      levelOfDetail(DEFAULT_THEME, DEFAULT_THEME.blockLodThresholdPx - 0.01),
    ).toBe('block')
  })

  it('smooths scaled glyph buffers by default', () => {
    expect(DEFAULT_THEME.antialias).toBe(true)
  })

  it('keeps the block threshold below the colour threshold', () => {
    expect(DEFAULT_THEME.blockLodThresholdPx).toBeLessThan(
      DEFAULT_THEME.colorLodThresholdPx,
    )
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --project browser src/render/theme.test.ts`
Expected: FAIL — the module `./theme` does not exist.

- [ ] **Step 3: Write the implementation**

`src/render/theme.ts`:

```ts
/**
 * How a cell is drawn at the current zoom. Below a certain rendered size a
 * glyph is physically indistinguishable, so drawing one is wasted work: the
 * cell becomes a patch of the emoji's average colour, and below that whole
 * blocks of cells collapse into one patch. This is what turns the
 * zoomed-out view into a usable minimap instead of tens of thousands of
 * glyph draws.
 */
export type LevelOfDetail = 'block' | 'color' | 'glyph'

/**
 * Everything the renderer needs to know about appearance, in one place. The
 * planned pixel-art redesign is an edit to this module and the React shell,
 * not to rendering logic.
 */
export type Theme = {
  /**
   * Whether scaled atlas buffers are smoothed. The planned pixel-art
   * redesign turns this off; until then a 32px buffer drawn at 30px wants
   * smoothing.
   */
  antialias: boolean
  backgroundColor: string
  /** Cell size in logical pixels at zoom 1. */
  baseCellSize: number
  /** Below this rendered cell size, cells merge into blocks. */
  blockLodThresholdPx: number
  /** Below this rendered cell size, glyphs give way to average colour. */
  colorLodThresholdPx: number
  fontStack: string
  gridColor: string
  gridLineWidth: number
}

export const DEFAULT_THEME: Theme = {
  antialias: true,
  backgroundColor: 'white',
  baseCellSize: 30,
  blockLodThresholdPx: 4,
  colorLodThresholdPx: 12,
  fontStack:
    '"Twemoji Mozilla", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", "EmojiOne Color", "Android Emoji", sans-serif',
  gridColor: 'darkgrey',
  gridLineWidth: 1,
}

/**
 * Picks the drawing mode for a rendered cell size. Both thresholds are
 * inclusive lower bounds of the *richer* mode, so a cell exactly at
 * `colorLodThresholdPx` still gets a glyph — the cheaper mode starts strictly
 * below the threshold.
 */
export function levelOfDetail(theme: Theme, cellSizePx: number): LevelOfDetail {
  if (cellSizePx < theme.blockLodThresholdPx) return 'block'
  if (cellSizePx < theme.colorLodThresholdPx) return 'color'

  return 'glyph'
}
```

`src/render/index.ts`:

```ts
export { DEFAULT_THEME, levelOfDetail } from './theme'
export type { LevelOfDetail, Theme } from './theme'
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run --project browser src/render/theme.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Lint, then commit**

```bash
npx eslint src --fix
npm run lint
git add src/render/theme.ts src/render/theme.test.ts src/render/index.ts
git commit -m "feat: add the render theme and level-of-detail selection"
```

---

### Task 2: The glyph atlas

**Files:**
- Create: `src/render/glyphAtlas.ts`
- Create: `src/render/glyphAtlas.test.ts`
- Modify: `src/render/index.ts`
- Delete: `src/render/glyphAtlas.smoke.test.ts`

**Interfaces:**
- Consumes: `Emoji` from `src/core/types`, `Theme` from `./theme`.
- Produces:
  ```ts
  export const ATLAS_STEPS: readonly number[]           // [16, 32, 64, 128]
  export function nearestAtlasStep(cellSizePx: number): number
  export class GlyphAtlas {
    constructor(dpr: number, fontStack: string)
    averageColor(emoji: Emoji): string                       // 'rgb(r, g, b)'
    averageColorRgb(emoji: Emoji): readonly [number, number, number]
    clear(): void
    get(emoji: Emoji, cellSizePx: number): CanvasImageSource
  }
  ```

Rasterising at an arbitrary cell size would re-rasterise every glyph on every frame of a
pinch. So glyphs are rasterised at fixed steps and the renderer scales with `drawImage`.

`averageColorRgb` returns the same cached tuple on every call for a given emoji — the
renderer reads it inside the draw loop, so it must not allocate. `averageColor` is the
CSS-string form the spec names; both come from the same cached value.

- [ ] **Step 1: Write the failing test**

`src/render/glyphAtlas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { DEFAULT_THEME } from './theme'
import { ATLAS_STEPS, GlyphAtlas, nearestAtlasStep } from './glyphAtlas'

function atlas(): GlyphAtlas {
  return new GlyphAtlas(1, DEFAULT_THEME.fontStack)
}

/** Counts pixels with any opacity, and their centre of mass. */
function opaquePixels(source: CanvasImageSource, size: number) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0)

  const { data } = ctx.getImageData(0, 0, size, size)

  let count = 0
  let sumX = 0
  let sumY = 0

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue

    const pixel = i / 4

    count++
    sumX += pixel % size
    sumY += Math.floor(pixel / size)
  }

  return { centreX: sumX / count, centreY: sumY / count, count }
}

describe('nearestAtlasStep', () => {
  it('returns a step from the fixed list', () => {
    expect(ATLAS_STEPS).toContain(nearestAtlasStep(30))
  })

  it('picks the nearest step rather than rounding down', () => {
    expect(nearestAtlasStep(30)).toBe(32)
  })

  it('clamps a size below the smallest step', () => {
    expect(nearestAtlasStep(3)).toBe(16)
  })

  it('clamps a size above the largest step', () => {
    expect(nearestAtlasStep(4000)).toBe(128)
  })
})

describe('GlyphAtlas', () => {
  it('rasterises a glyph into a non-empty buffer', () => {
    const step = nearestAtlasStep(32)
    const { count } = opaquePixels(atlas().get('❤️', 32), step)

    expect(count).toBeGreaterThan(0)
  })

  it('centres the glyph inside the cell', () => {
    const step = nearestAtlasStep(64)
    const { centreX, centreY } = opaquePixels(atlas().get('❤️', 64), step)

    // Within a tenth of the cell of the middle, in both axes. The old engine
    // needed a hand-tuned per-glyph nudge to get this far, and only for
    // Apple metrics.
    expect(Math.abs(centreX - step / 2)).toBeLessThan(step / 10)
    expect(Math.abs(centreY - step / 2)).toBeLessThan(step / 10)
  })

  it('centres a native emoji as well as one with a variation selector', () => {
    const step = nearestAtlasStep(64)
    const heart = opaquePixels(atlas().get('❤️', 64), step)
    const grin = opaquePixels(atlas().get('😀', 64), step)

    expect(Math.abs(heart.centreY - grin.centreY)).toBeLessThan(step / 10)
  })

  it('keeps the glyph inside the cell bounds', () => {
    const step = nearestAtlasStep(32)
    const canvas = document.createElement('canvas')
    canvas.width = step
    canvas.height = step

    const ctx = canvas.getContext('2d')!
    ctx.drawImage(atlas().get('😀', 32), 0, 0)

    const { data } = ctx.getImageData(0, 0, step, step)

    // No opaque pixel in the outermost row or column: nothing spills into
    // the neighbouring cell, which is defect 2 in the spec.
    for (let x = 0; x < step; x++) {
      expect(data[(0 * step + x) * 4 + 3]).toBe(0)
      expect(data[((step - 1) * step + x) * 4 + 3]).toBe(0)
    }
  })

  it('reuses the buffer for a repeat request at the same step', () => {
    const instance = atlas()

    expect(instance.get('❤️', 30)).toBe(instance.get('❤️', 31))
  })

  it('rasterises separately for a different step', () => {
    const instance = atlas()

    expect(instance.get('❤️', 16)).not.toBe(instance.get('❤️', 128))
  })

  it('reports a reddish average colour for a red glyph', () => {
    const [r, g, b] = atlas().averageColorRgb('❤️')

    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })

  it('formats the average colour as a CSS rgb string', () => {
    expect(atlas().averageColor('❤️')).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })

  it('returns the same tuple instance on every call, so the draw loop allocates nothing', () => {
    const instance = atlas()

    expect(instance.averageColorRgb('❤️')).toBe(instance.averageColorRgb('❤️'))
  })

  it('rasterises again after clear', () => {
    const instance = atlas()
    const before = instance.get('❤️', 32)

    instance.clear()

    expect(instance.get('❤️', 32)).not.toBe(before)
  })

  it('scales the buffer by the device pixel ratio', () => {
    const step = nearestAtlasStep(32)
    const buffer = new GlyphAtlas(2, DEFAULT_THEME.fontStack).get(
      '❤️',
      32,
    ) as HTMLCanvasElement

    expect(buffer.width).toBe(step * 2)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --project browser src/render/glyphAtlas.test.ts`
Expected: FAIL — the module `./glyphAtlas` does not exist.

- [ ] **Step 3: Write the implementation**

`src/render/glyphAtlas.ts`:

```ts
import type { Emoji } from '../core/types'

/**
 * The sizes, in logical pixels, at which glyphs are actually rasterised.
 * The renderer asks for the nearest step and scales the result with
 * drawImage, so a smooth pinch never re-rasterises the glyph set — which it
 * would have to do on every frame if the atlas honoured arbitrary sizes.
 */
export const ATLAS_STEPS: readonly number[] = [16, 32, 64, 128]

/** Fraction of the cell kept clear on each side, so glyphs never touch. */
const PADDING_RATIO = 0.06

/** The step used when an average colour is wanted before any glyph is drawn. */
const DEFAULT_COLOR_STEP = 32

type Rgb = readonly [number, number, number]

/**
 * Rasterises each emoji once per size step and hands out the buffer, so the
 * draw loop calls drawImage instead of fillText — no font matching and no
 * colour-glyph rasterisation per frame.
 *
 * The atlas belongs to one device pixel ratio and one font stack. When
 * either changes, the owner builds a new atlas rather than mutating this
 * one.
 */
export class GlyphAtlas {
  private readonly averages = new Map<Emoji, Rgb>()
  private readonly buffers = new Map<string, HTMLCanvasElement>()
  private readonly dpr: number
  private readonly fontStack: string

  constructor(dpr: number, fontStack: string) {
    this.dpr = dpr
    this.fontStack = fontStack
  }

  /** The glyph's mean colour as a CSS colour, for the colour level of detail. */
  averageColor(emoji: Emoji): string {
    const [r, g, b] = this.averageColorRgb(emoji)

    return `rgb(${r}, ${g}, ${b})`
  }

  /**
   * The glyph's mean colour as a cached tuple. The same instance comes back
   * every time, because the renderer reads this inside the draw loop and
   * must not allocate there.
   */
  averageColorRgb(emoji: Emoji): Rgb {
    const cached = this.averages.get(emoji)

    if (cached) return cached

    this.rasterise(emoji, DEFAULT_COLOR_STEP)

    return this.averages.get(emoji)!
  }

  clear(): void {
    this.averages.clear()
    this.buffers.clear()
  }

  /**
   * The buffer for this emoji at the step nearest the requested cell size.
   * The caller scales it to the exact size it needs.
   */
  get(emoji: Emoji, cellSizePx: number): CanvasImageSource {
    const step = nearestAtlasStep(cellSizePx)
    const key = `${step}:${emoji}`
    const cached = this.buffers.get(key)

    if (cached) return cached

    return this.rasterise(emoji, step)
  }

  private rasterise(emoji: Emoji, step: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(step * this.dpr)
    canvas.height = Math.round(step * this.dpr)

    const ctx = canvas.getContext('2d')!
    ctx.scale(this.dpr, this.dpr)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    const padding = step * PADDING_RATIO * 2
    let fontSize = step

    ctx.font = `${fontSize}px ${this.fontStack}`

    let metrics = ctx.measureText(emoji)
    let width = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight
    let height =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent

    if (!(width > 0) || !(height > 0)) {
      // The browser reported no glyph box. Fall back to centring on the
      // baseline, which is what the old engine did for every glyph.
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(emoji, step / 2, step / 2)
    } else {
      const fit = Math.min(1, (step - padding) / Math.max(width, height))

      if (fit < 1) {
        fontSize *= fit
        ctx.font = `${fontSize}px ${this.fontStack}`
        metrics = ctx.measureText(emoji)
        width = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight
        height =
          metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
      }

      // Centred on the glyph's own ink, not on a shared constant: this is
      // what makes a variation-selector emoji and a native one line up.
      ctx.fillText(
        emoji,
        step / 2 -
          (metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft) / 2,
        step / 2 +
          (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) /
            2,
      )
    }

    this.buffers.set(`${step}:${emoji}`, canvas)

    if (!this.averages.has(emoji)) {
      this.averages.set(emoji, meanColor(ctx, canvas.width, canvas.height))
    }

    return canvas
  }
}

/**
 * The rasterisation step nearest the requested size, clamped to the ends of
 * the list.
 */
export function nearestAtlasStep(cellSizePx: number): number {
  let best = ATLAS_STEPS[0]

  for (const step of ATLAS_STEPS) {
    if (Math.abs(step - cellSizePx) < Math.abs(best - cellSizePx)) {
      best = step
    }
  }

  return best
}

/**
 * Alpha-weighted mean colour of everything drawn in the buffer. Weighting by
 * alpha keeps a glyph's anti-aliased fringe from washing the colour towards
 * the transparent background.
 */
function meanColor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): Rgb {
  const { data } = ctx.getImageData(0, 0, width, height)

  let alpha = 0
  let b = 0
  let g = 0
  let r = 0

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]

    if (a === 0) continue

    alpha += a
    r += data[i] * a
    g += data[i + 1] * a
    b += data[i + 2] * a
  }

  if (alpha === 0) return [0, 0, 0]

  return [Math.round(r / alpha), Math.round(g / alpha), Math.round(b / alpha)]
}
```

Add to `src/render/index.ts`:

```ts
export { ATLAS_STEPS, GlyphAtlas, nearestAtlasStep } from './glyphAtlas'
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run --project browser src/render/glyphAtlas.test.ts`
Expected: PASS.

If "keeps the glyph inside the cell bounds" fails, raise `PADDING_RATIO` — do not delete
the test. It pins defect 2 from the spec.

If "picks the nearest step rather than rounding down" fails at exactly-halfway sizes,
note that `nearestAtlasStep` keeps the first of two equally distant steps, i.e. the
smaller. That is fine; no test depends on the tie.

- [ ] **Step 5: Delete the smoke test**

Its two assertions — that the browser project has a real 2D context and returns real glyph
metrics — are now made by the atlas tests themselves.

```bash
git rm src/render/glyphAtlas.smoke.test.ts
```

- [ ] **Step 6: Lint, run the whole suite, commit**

```bash
npx eslint src --fix
npm run lint
npm test
git add src/render/glyphAtlas.ts src/render/glyphAtlas.test.ts src/render/index.ts
git commit -m "feat: rasterise emoji into a glyph atlas centred by real metrics"
```

---

### Task 3: renderScene

**Files:**
- Create: `src/render/scene.ts`
- Create: `src/render/scene.test.ts`
- Modify: `src/render/index.ts`

**Interfaces:**
- Consumes: `Scene`, `Camera`, `cellSizeAt`, `visibleBounds`, `GlyphAtlas`, `Theme`,
  `levelOfDetail`.
- Produces:
  ```ts
  export type RenderOptions = {
    atlas: GlyphAtlas
    camera: Camera
    height: number
    theme: Theme
    width: number
  }
  export function renderScene(
    ctx: CanvasRenderingContext2D,
    scene: Scene,
    opts: RenderOptions,
  ): void
  ```

The context comes from outside so that a future PNG export is this same function with a
different context, not a second rendering path. `width` and `height` are **logical**
pixels; the caller has already applied the device pixel ratio to the context transform.

Rules the implementation must hold to:
- Only cells inside `visibleBounds` are touched. Frame cost follows window size, never
  drawing size.
- `scene.bounds()` is never called.
- No allocation inside the loops: no `cellToScreen` (it returns a fresh object), no
  closures, no array literals. Coordinates are computed as numbers.

- [ ] **Step 1: Write the failing test**

`src/render/scene.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { createCamera } from '../core/camera'
import { Scene } from '../core/scene'
import { GlyphAtlas } from './glyphAtlas'
import { renderScene } from './scene'
import { DEFAULT_THEME } from './theme'

const WIDTH = 120
const HEIGHT = 120

function surface() {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT

  return canvas.getContext('2d')!
}

function pixel(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const { data } = ctx.getImageData(x, y, 1, 1)

  return [data[0], data[1], data[2], data[3]]
}

function options(overrides: Partial<Parameters<typeof renderScene>[2]> = {}) {
  return {
    atlas: new GlyphAtlas(1, DEFAULT_THEME.fontStack),
    camera: createCamera(),
    height: HEIGHT,
    theme: DEFAULT_THEME,
    width: WIDTH,
    ...overrides,
  }
}

describe('renderScene', () => {
  it('fills the background across the whole surface', () => {
    const ctx = surface()

    renderScene(ctx, new Scene(), options())

    expect(pixel(ctx, WIDTH - 1, HEIGHT - 1)).toEqual([255, 255, 255, 255])
  })

  it('draws grid lines at the glyph level of detail', () => {
    const ctx = surface()
    const empty = surface()

    renderScene(ctx, new Scene(), options())
    empty.fillStyle = DEFAULT_THEME.backgroundColor
    empty.fillRect(0, 0, WIDTH, HEIGHT)

    // Somewhere on the surface a pixel differs from a plain background fill:
    // that is the grid. The old engine erased its own grid lines and never
    // redrew them (defect 3).
    const drawn = ctx.getImageData(0, 0, WIDTH, HEIGHT).data
    const blank = empty.getImageData(0, 0, WIDTH, HEIGHT).data

    expect(Array.from(drawn)).not.toEqual(Array.from(blank))
  })

  it('makes a filled cell differ from an empty one', () => {
    const filled = surface()
    const blank = surface()
    const scene = new Scene()
    scene.writeCell(1, 1, '❤️')

    renderScene(filled, scene, options())
    renderScene(blank, new Scene(), options())

    const size = DEFAULT_THEME.baseCellSize
    const centre = Math.round(size * 1.5)

    expect(pixel(filled, centre, centre)).not.toEqual(pixel(blank, centre, centre))
  })

  it('leaves no trace of an erased cell after a redraw', () => {
    const ctx = surface()
    const scene = new Scene()

    scene.writeCell(1, 1, '❤️')
    renderScene(ctx, scene, options())

    scene.writeCell(1, 1, undefined)
    renderScene(ctx, scene, options())

    const reference = surface()
    renderScene(reference, new Scene(), options())

    expect(Array.from(ctx.getImageData(0, 0, WIDTH, HEIGHT).data)).toEqual(
      Array.from(reference.getImageData(0, 0, WIDTH, HEIGHT).data),
    )
  })

  it('ignores cells outside the viewport', () => {
    const near = surface()
    const far = surface()
    const withFar = new Scene()

    withFar.writeCell(10_000, 10_000, '❤️')

    renderScene(near, new Scene(), options())
    renderScene(far, withFar, options())

    expect(Array.from(far.getImageData(0, 0, WIDTH, HEIGHT).data)).toEqual(
      Array.from(near.getImageData(0, 0, WIDTH, HEIGHT).data),
    )
  })

  it('draws a cell that is only partly visible at the edge', () => {
    const ctx = surface()
    const scene = new Scene()
    const camera = createCamera()

    // Half a cell scrolled away, so cell (0,0) starts off-screen.
    camera.offsetX = DEFAULT_THEME.baseCellSize / 2
    scene.writeCell(0, 0, '❤️')

    renderScene(ctx, scene, options({ camera }))

    const blank = surface()
    renderScene(blank, new Scene(), options({ camera }))

    expect(Array.from(ctx.getImageData(0, 0, WIDTH, HEIGHT).data)).not.toEqual(
      Array.from(blank.getImageData(0, 0, WIDTH, HEIGHT).data),
    )
  })

  it('switches to average colour below the colour threshold', () => {
    const ctx = surface()
    const scene = new Scene()
    const camera = createCamera()

    scene.writeCell(0, 0, '❤️')
    // Rendered cell size lands under colorLodThresholdPx.
    camera.zoom = (DEFAULT_THEME.colorLodThresholdPx - 2) / DEFAULT_THEME.baseCellSize

    renderScene(ctx, scene, options({ camera }))

    const [r, g, b, a] = pixel(ctx, 1, 1)

    expect(a).toBe(255)
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })

  it('draws no grid below the colour threshold', () => {
    const ctx = surface()
    const camera = createCamera()

    camera.zoom = (DEFAULT_THEME.colorLodThresholdPx - 2) / DEFAULT_THEME.baseCellSize

    renderScene(ctx, new Scene(), options({ camera }))

    const blank = surface()
    blank.fillStyle = DEFAULT_THEME.backgroundColor
    blank.fillRect(0, 0, WIDTH, HEIGHT)

    expect(Array.from(ctx.getImageData(0, 0, WIDTH, HEIGHT).data)).toEqual(
      Array.from(blank.getImageData(0, 0, WIDTH, HEIGHT).data),
    )
  })

  it('still paints filled cells below the block threshold', () => {
    const ctx = surface()
    const scene = new Scene()
    const camera = createCamera()

    for (let x = 0; x < 40; x++) {
      for (let y = 0; y < 40; y++) {
        scene.writeCell(x, y, '❤️')
      }
    }

    camera.zoom =
      (DEFAULT_THEME.blockLodThresholdPx - 1) / DEFAULT_THEME.baseCellSize

    renderScene(ctx, scene, options({ camera }))

    const [r, g, b, a] = pixel(ctx, 1, 1)

    expect(a).toBe(255)
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })

  it('applies the theme antialiasing flag to the context', () => {
    const ctx = surface()

    ctx.imageSmoothingEnabled = true
    renderScene(ctx, new Scene(), options({
      theme: { ...DEFAULT_THEME, antialias: false },
    }))

    expect(ctx.imageSmoothingEnabled).toBe(false)
  })

  it('survives a zero-sized viewport without throwing', () => {
    const ctx = surface()

    expect(() =>
      renderScene(ctx, new Scene(), options({ height: 0, width: 0 })),
    ).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --project browser src/render/scene.test.ts`
Expected: FAIL — the module `./scene` does not exist.

- [ ] **Step 3: Write the implementation**

`src/render/scene.ts`:

```ts
import type { Camera } from '../core/camera'
import type { Scene } from '../core/scene'
import type { GlyphAtlas } from './glyphAtlas'
import type { Theme } from './theme'

import { cellSizeAt, visibleBounds } from '../core/camera'
import { levelOfDetail } from './theme'

export type RenderOptions = {
  atlas: GlyphAtlas
  camera: Camera
  /** Viewport height in logical pixels. */
  height: number
  theme: Theme
  /** Viewport width in logical pixels. */
  width: number
}

/**
 * Draws one full frame into the supplied context. Full, but confined to the
 * cells the viewport can actually see, so frame cost follows window size and
 * not the size of the drawing: a scene with a million cells costs the same
 * as one with a hundred.
 *
 * The context is a parameter rather than something this module owns, so that
 * raster export later becomes a call with a different context instead of a
 * second rendering path.
 *
 * Nothing in the loops below allocates — no cellToScreen (it returns a fresh
 * object per call), no closures, no temporaries. At the smallest zoom this
 * loop runs over tens of thousands of cells per frame.
 */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  opts: RenderOptions,
): void {
  const { atlas, camera, height, theme, width } = opts

  ctx.imageSmoothingEnabled = theme.antialias
  ctx.fillStyle = theme.backgroundColor
  ctx.fillRect(0, 0, width, height)

  if (width <= 0 || height <= 0) return

  const cellSize = cellSizeAt(theme.baseCellSize, camera.zoom)
  const bounds = visibleBounds(camera, theme.baseCellSize, width, height)
  const detail = levelOfDetail(theme, cellSize)

  if (detail === 'glyph') {
    drawGrid(ctx, theme, camera, cellSize, bounds, width, height)
  }

  if (detail === 'block') {
    drawBlocks(ctx, scene, atlas, camera, cellSize, bounds, theme)
    return
  }

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const value = scene.get(x, y)

      if (value === undefined) continue

      const px = x * cellSize - camera.offsetX
      const py = y * cellSize - camera.offsetY

      if (detail === 'glyph') {
        ctx.drawImage(atlas.get(value, cellSize), px, py, cellSize, cellSize)
      } else {
        ctx.fillStyle = atlas.averageColor(value)
        ctx.fillRect(px, py, cellSize + 1, cellSize + 1)
      }
    }
  }
}

/**
 * At the smallest zoom levels a single cell is a fraction of a pixel, so
 * cells are merged into blocks big enough to see and each block is filled
 * with the mean colour of what it contains. Without this, zooming out would
 * mean tens of thousands of sub-pixel fills per frame.
 */
function drawBlocks(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  atlas: GlyphAtlas,
  camera: Camera,
  cellSize: number,
  bounds: { maxX: number; maxY: number; minX: number; minY: number },
  theme: Theme,
): void {
  const span = Math.max(1, Math.ceil(theme.blockLodThresholdPx / cellSize))
  const blockSize = cellSize * span

  for (let by = bounds.minY; by <= bounds.maxY; by += span) {
    for (let bx = bounds.minX; bx <= bounds.maxX; bx += span) {
      let b = 0
      let g = 0
      let filled = 0
      let r = 0

      for (let y = by; y < by + span && y <= bounds.maxY; y++) {
        for (let x = bx; x < bx + span && x <= bounds.maxX; x++) {
          const value = scene.get(x, y)

          if (value === undefined) continue

          const rgb = atlas.averageColorRgb(value)

          filled++
          r += rgb[0]
          g += rgb[1]
          b += rgb[2]
        }
      }

      if (filled === 0) continue

      ctx.fillStyle = `rgb(${Math.round(r / filled)}, ${Math.round(
        g / filled,
      )}, ${Math.round(b / filled)})`
      ctx.fillRect(
        bx * cellSize - camera.offsetX,
        by * cellSize - camera.offsetY,
        blockSize + 1,
        blockSize + 1,
      )
    }
  }
}

/**
 * The grid is redrawn as part of every frame rather than once at startup.
 * The old engine drew it only on clear and then erased pieces of it with
 * every cell fill, which is why grid lines used to disappear as you drew.
 */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  theme: Theme,
  camera: Camera,
  cellSize: number,
  bounds: { maxX: number; maxY: number; minX: number; minY: number },
  width: number,
  height: number,
): void {
  ctx.beginPath()
  ctx.lineWidth = theme.gridLineWidth
  ctx.strokeStyle = theme.gridColor

  for (let x = bounds.minX; x <= bounds.maxX + 1; x++) {
    // The half-pixel offset puts a one-pixel line on a pixel rather than
    // straddling two, which would render as a two-pixel blur.
    const px = Math.round(x * cellSize - camera.offsetX) + 0.5

    ctx.moveTo(px, 0)
    ctx.lineTo(px, height)
  }

  for (let y = bounds.minY; y <= bounds.maxY + 1; y++) {
    const py = Math.round(y * cellSize - camera.offsetY) + 0.5

    ctx.moveTo(0, py)
    ctx.lineTo(width, py)
  }

  ctx.stroke()
}
```

Add to `src/render/index.ts`:

```ts
export { renderScene } from './scene'
export type { RenderOptions } from './scene'
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run --project browser src/render/scene.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, run the whole suite, commit**

```bash
npx eslint src --fix
npm run lint
npm test
git add src/render/scene.ts src/render/scene.test.ts src/render/index.ts
git commit -m "feat: render a scene frame confined to the visible bounds"
```

---

### Task 4: Pointer input — one pointer draws

**Files:**
- Create: `src/input/pointer.ts`
- Create: `src/input/pointer.test.ts`
- Create: `src/input/index.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  ```ts
  export type PointerHandlers = {
    /** The stroke was abandoned; the caller rolls the scene back. */
    onDrawCancel(): void
    onDrawEnd(): void
    onDrawMove(px: number, py: number): void
    onDrawStart(px: number, py: number): void
    /** The pointer moved by (dx, dy) screen pixels; content follows it. */
    onPan(dx: number, dy: number): void
    onZoom(factor: number, anchorPx: number, anchorPy: number): void
  }
  export function attachPointerInput(
    el: HTMLElement,
    handlers: PointerHandlers,
  ): () => void
  ```

All coordinates are screen pixels relative to the element's top-left corner. See "One
deliberate deviation from the spec" above for why this layer does not deal in cells.

This task covers the single-pointer path only: drawing starts on `pointerdown` — so a
single tap draws, which is defect 4 — the element captures the pointer so a stroke survives
leaving the canvas, and detaching removes every listener. Gestures come in task 5.

- [ ] **Step 1: Write the failing test**

`src/input/pointer.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

import { attachPointerInput } from './pointer'

function harness() {
  const el = document.createElement('div')
  el.style.width = '200px'
  el.style.height = '200px'
  document.body.append(el)

  // jsdom-free environment, but a real Chromium element still needs a stub
  // here: capture on a synthetic pointerId throws NotFoundError otherwise.
  el.setPointerCapture = vi.fn()
  el.releasePointerCapture = vi.fn()

  const handlers = {
    onDrawCancel: vi.fn(),
    onDrawEnd: vi.fn(),
    onDrawMove: vi.fn(),
    onDrawStart: vi.fn(),
    onPan: vi.fn(),
    onZoom: vi.fn(),
  }

  const detach = attachPointerInput(el, handlers)

  return { detach, el, handlers }
}

function pointer(type: string, init: PointerEventInit) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    pointerType: 'touch',
    ...init,
  })
}

describe('attachPointerInput', () => {
  it('starts a stroke on pointerdown, so a single tap draws', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(pointer('pointerdown', { clientX: 10, clientY: 20, pointerId: 1 }))

    expect(handlers.onDrawStart).toHaveBeenCalledTimes(1)
  })

  it('reports coordinates relative to the element', () => {
    const { el, handlers } = harness()
    const box = el.getBoundingClientRect()

    el.dispatchEvent(
      pointer('pointerdown', {
        clientX: box.left + 10,
        clientY: box.top + 20,
        pointerId: 1,
      }),
    )

    expect(handlers.onDrawStart).toHaveBeenCalledWith(10, 20)
  })

  it('captures the pointer so a stroke survives leaving the element', () => {
    const { el } = harness()

    el.dispatchEvent(pointer('pointerdown', { clientX: 1, clientY: 1, pointerId: 7 }))

    expect(el.setPointerCapture).toHaveBeenCalledWith(7)
  })

  it('reports movement while a stroke is in progress', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }))
    el.dispatchEvent(pointer('pointermove', { clientX: 5, clientY: 5, pointerId: 1 }))

    expect(handlers.onDrawMove).toHaveBeenCalledTimes(1)
  })

  it('ignores movement with no stroke in progress', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(pointer('pointermove', { clientX: 5, clientY: 5, pointerId: 1 }))

    expect(handlers.onDrawMove).not.toHaveBeenCalled()
    expect(handlers.onPan).not.toHaveBeenCalled()
  })

  it('ends the stroke on pointerup', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }))
    el.dispatchEvent(pointer('pointerup', { clientX: 0, clientY: 0, pointerId: 1 }))

    expect(handlers.onDrawEnd).toHaveBeenCalledTimes(1)
  })

  it('ends the stroke when the pointer is cancelled by the system', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }))
    el.dispatchEvent(pointer('pointercancel', { clientX: 0, clientY: 0, pointerId: 1 }))

    expect(handlers.onDrawEnd).toHaveBeenCalledTimes(1)
  })

  it('does not keep drawing after the stroke ended', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }))
    el.dispatchEvent(pointer('pointerup', { clientX: 0, clientY: 0, pointerId: 1 }))
    el.dispatchEvent(pointer('pointermove', { clientX: 9, clientY: 9, pointerId: 1 }))

    expect(handlers.onDrawMove).not.toHaveBeenCalled()
  })

  it('sets touch-action so the browser does not steal the gesture', () => {
    const { el } = harness()

    expect(el.style.touchAction).toBe('none')
  })

  it('removes its listeners on detach', () => {
    const { detach, el, handlers } = harness()

    detach()
    el.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }))

    expect(handlers.onDrawStart).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --project browser src/input/pointer.test.ts`
Expected: FAIL — the module `./pointer` does not exist.

- [ ] **Step 3: Write the implementation**

`src/input/pointer.ts`:

```ts
export type PointerHandlers = {
  /**
   * The stroke in progress was abandoned rather than finished — a second
   * finger turned it into a gesture. The caller rolls the scene back; this
   * layer never touches the scene.
   */
  onDrawCancel(): void
  onDrawEnd(): void
  onDrawMove(px: number, py: number): void
  onDrawStart(px: number, py: number): void
  /**
   * The pointer moved by (dx, dy) screen pixels and the content should
   * follow it. The camera moves the opposite way; that inversion belongs to
   * the caller, not here.
   */
  onPan(dx: number, dy: number): void
  onZoom(factor: number, anchorPx: number, anchorPy: number): void
}

/**
 * Turns Pointer Events into drawing and navigation callbacks. One code path
 * serves mouse, finger and stylus; the old engine had separate mouse* and
 * touch* handlers, which is how a single tap came to do nothing on mobile.
 *
 * Every coordinate handed to a handler is in screen pixels relative to the
 * element's top-left corner. This layer knows nothing about cameras, zoom or
 * cells: the caller owns the camera, so the caller does the conversion.
 *
 * Returns a function that removes everything this one attached.
 */
export function attachPointerInput(
  el: HTMLElement,
  handlers: PointerHandlers,
): () => void {
  let drawingPointerId: null | number = null

  // Without this the browser treats a drag as a scroll or a page zoom and
  // the stroke never reaches us.
  el.style.touchAction = 'none'

  function localX(event: PointerEvent): number {
    return event.clientX - el.getBoundingClientRect().left
  }

  function localY(event: PointerEvent): number {
    return event.clientY - el.getBoundingClientRect().top
  }

  function onPointerDown(event: PointerEvent): void {
    if (drawingPointerId !== null) return

    drawingPointerId = event.pointerId
    el.setPointerCapture(event.pointerId)
    handlers.onDrawStart(localX(event), localY(event))
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== drawingPointerId) return

    handlers.onDrawMove(localX(event), localY(event))
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== drawingPointerId) return

    drawingPointerId = null

    if (el.hasPointerCapture?.(event.pointerId)) {
      el.releasePointerCapture(event.pointerId)
    }

    handlers.onDrawEnd()
  }

  el.addEventListener('pointercancel', onPointerUp)
  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)

  return () => {
    el.removeEventListener('pointercancel', onPointerUp)
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', onPointerUp)
  }
}
```

`src/input/index.ts`:

```ts
export { attachPointerInput } from './pointer'
export type { PointerHandlers } from './pointer'
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run --project browser src/input/pointer.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Lint, run the whole suite, commit**

```bash
npx eslint src --fix
npm run lint
npm test
git add src/input/pointer.ts src/input/pointer.test.ts src/input/index.ts
git commit -m "feat: turn pointer events into drawing callbacks"
```

---

### Task 5: Pointer input — gestures, wheel and drag-to-pan

**Files:**
- Modify: `src/input/pointer.ts`
- Modify: `src/input/pointer.test.ts`

**Interfaces:**
- Consumes: `PointerHandlers`, `attachPointerInput` from task 4 — unchanged signature.
- Produces: no new exports. The same `attachPointerInput` now also reports pan and zoom.

The scheme is the one from Procreate and Figma: **one pointer draws, two pointers
navigate.** The distance between two pointers gives zoom, the midpoint's displacement gives
pan.

A second finger never lands at the same instant as the first, so by the time a pinch is
recognisable a stroke is already in progress. That stroke must be abandoned, not finished —
hence `onDrawCancel`, and hence `StrokeRecorder.rollback` on the other side. Otherwise
every pinch would leave a stray line.

After a pinch, lifting one finger must **not** resume drawing with the other: that would
draw a line from wherever the remaining finger happens to be. Drawing resumes only once
every pointer has lifted.

On desktop: wheel pans, `Ctrl` or `Cmd` with the wheel zooms, and middle-button drag pans.

- [ ] **Step 1: Write the failing tests**

Add to `src/input/pointer.test.ts`, and add `deltaMode`-carrying wheel and mouse helpers
next to the existing `pointer` helper:

```ts
function wheel(init: WheelEventInit) {
  return new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
}

describe('attachPointerInput gestures', () => {
  it('cancels a stroke in progress when a second pointer arrives', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }))
    el.dispatchEvent(
      pointer('pointerdown', {
        clientX: 50,
        clientY: 0,
        isPrimary: false,
        pointerId: 2,
      }),
    )

    expect(handlers.onDrawCancel).toHaveBeenCalledTimes(1)
    expect(handlers.onDrawEnd).not.toHaveBeenCalled()
  })

  it('zooms in when two pointers move apart', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }))
    el.dispatchEvent(
      pointer('pointerdown', { clientX: 100, clientY: 0, isPrimary: false, pointerId: 2 }),
    )
    el.dispatchEvent(
      pointer('pointermove', { clientX: 200, clientY: 0, isPrimary: false, pointerId: 2 }),
    )

    expect(handlers.onZoom).toHaveBeenCalledTimes(1)
    expect(handlers.onZoom.mock.calls[0][0]).toBeGreaterThan(1)
  })

  it('zooms out when two pointers move together', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }))
    el.dispatchEvent(
      pointer('pointerdown', { clientX: 200, clientY: 0, isPrimary: false, pointerId: 2 }),
    )
    el.dispatchEvent(
      pointer('pointermove', { clientX: 100, clientY: 0, isPrimary: false, pointerId: 2 }),
    )

    expect(handlers.onZoom.mock.calls[0][0]).toBeLessThan(1)
  })

  it('pans by the displacement of the midpoint between two pointers', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }))
    el.dispatchEvent(
      pointer('pointerdown', { clientX: 100, clientY: 0, isPrimary: false, pointerId: 2 }),
    )
    // Both fingers slide 10px right: distance unchanged, midpoint moves 10.
    el.dispatchEvent(pointer('pointermove', { clientX: 10, clientY: 0, pointerId: 1 }))
    el.dispatchEvent(
      pointer('pointermove', { clientX: 110, clientY: 0, isPrimary: false, pointerId: 2 }),
    )

    const panX = handlers.onPan.mock.calls.reduce((sum, [dx]) => sum + dx, 0)

    expect(panX).toBeCloseTo(10, 0)
  })

  it('does not draw while two pointers are down', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }))
    handlers.onDrawMove.mockClear()

    el.dispatchEvent(
      pointer('pointerdown', { clientX: 100, clientY: 0, isPrimary: false, pointerId: 2 }),
    )
    el.dispatchEvent(pointer('pointermove', { clientX: 40, clientY: 40, pointerId: 1 }))

    expect(handlers.onDrawMove).not.toHaveBeenCalled()
  })

  it('does not resume drawing when one finger of a pinch lifts', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }))
    el.dispatchEvent(
      pointer('pointerdown', { clientX: 100, clientY: 0, isPrimary: false, pointerId: 2 }),
    )
    el.dispatchEvent(
      pointer('pointerup', { clientX: 100, clientY: 0, isPrimary: false, pointerId: 2 }),
    )
    handlers.onDrawStart.mockClear()
    handlers.onDrawMove.mockClear()

    el.dispatchEvent(pointer('pointermove', { clientX: 60, clientY: 60, pointerId: 1 }))

    expect(handlers.onDrawMove).not.toHaveBeenCalled()
    expect(handlers.onDrawStart).not.toHaveBeenCalled()
  })

  it('draws again once every pointer has lifted', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 1 }))
    el.dispatchEvent(
      pointer('pointerdown', { clientX: 100, clientY: 0, isPrimary: false, pointerId: 2 }),
    )
    el.dispatchEvent(
      pointer('pointerup', { clientX: 100, clientY: 0, isPrimary: false, pointerId: 2 }),
    )
    el.dispatchEvent(pointer('pointerup', { clientX: 0, clientY: 0, pointerId: 1 }))
    handlers.onDrawStart.mockClear()

    el.dispatchEvent(pointer('pointerdown', { clientX: 5, clientY: 5, pointerId: 3 }))

    expect(handlers.onDrawStart).toHaveBeenCalledTimes(1)
  })

  it('pans on a plain wheel event', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(wheel({ deltaX: 0, deltaY: 30 }))

    expect(handlers.onPan).toHaveBeenCalledTimes(1)
    expect(handlers.onZoom).not.toHaveBeenCalled()
  })

  it('zooms on a wheel event with ctrl held, as a trackpad pinch sends', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(wheel({ ctrlKey: true, deltaY: -30 }))

    expect(handlers.onZoom).toHaveBeenCalledTimes(1)
    expect(handlers.onZoom.mock.calls[0][0]).toBeGreaterThan(1)
    expect(handlers.onPan).not.toHaveBeenCalled()
  })

  it('zooms on a wheel event with the meta key, for macOS', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(wheel({ deltaY: -30, metaKey: true }))

    expect(handlers.onZoom).toHaveBeenCalledTimes(1)
  })

  it('pans with the middle mouse button instead of drawing', () => {
    const { el, handlers } = harness()

    el.dispatchEvent(
      pointer('pointerdown', {
        button: 1,
        clientX: 0,
        clientY: 0,
        pointerId: 1,
        pointerType: 'mouse',
      }),
    )
    el.dispatchEvent(
      pointer('pointermove', {
        clientX: 15,
        clientY: 0,
        pointerId: 1,
        pointerType: 'mouse',
      }),
    )

    expect(handlers.onDrawStart).not.toHaveBeenCalled()
    expect(handlers.onPan).toHaveBeenCalledWith(15, 0)
  })

  it('removes the wheel listener on detach', () => {
    const { detach, el, handlers } = harness()

    detach()
    el.dispatchEvent(wheel({ deltaY: 30 }))

    expect(handlers.onPan).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run --project browser src/input/pointer.test.ts`
Expected: the 13 new tests FAIL; the 10 from task 4 still PASS.

- [ ] **Step 3: Write the implementation**

Replace the body of `attachPointerInput` in `src/input/pointer.ts` with the version below.
`PointerHandlers` is unchanged.

```ts
/** How far a wheel notch zooms. Tuned so a notch is a gentle step. */
const WHEEL_ZOOM_SENSITIVITY = 0.002

const MIDDLE_BUTTON = 1

type Point = { px: number; py: number }

export function attachPointerInput(
  el: HTMLElement,
  handlers: PointerHandlers,
): () => void {
  const active = new Map<number, Point>()

  let drawingPointerId: null | number = null
  let panningPointerId: null | number = null
  let pinchDistance = 0
  let pinchMidX = 0
  let pinchMidY = 0
  // After a pinch, the finger still down must not resume the stroke: it
  // would draw a line from wherever it happens to be. Drawing waits for a
  // clean slate.
  let suppressUntilAllUp = false

  el.style.touchAction = 'none'

  function localPoint(event: PointerEvent): Point {
    const box = el.getBoundingClientRect()

    return { px: event.clientX - box.left, py: event.clientY - box.top }
  }

  function pinchPoints(): [Point, Point] {
    const [first, second] = active.values()

    return [first, second]
  }

  function beginPinch(): void {
    const [a, b] = pinchPoints()

    pinchDistance = Math.hypot(a.px - b.px, a.py - b.py)
    pinchMidX = (a.px + b.px) / 2
    pinchMidY = (a.py + b.py) / 2
  }

  function onPointerDown(event: PointerEvent): void {
    active.set(event.pointerId, localPoint(event))
    el.setPointerCapture(event.pointerId)

    if (active.size >= 2) {
      // A pinch was born out of a stroke already under way. Abandon it —
      // finishing it would commit a line the user never meant to draw.
      if (drawingPointerId !== null) {
        drawingPointerId = null
        handlers.onDrawCancel()
      }

      suppressUntilAllUp = true
      panningPointerId = null
      beginPinch()

      return
    }

    if (event.button === MIDDLE_BUTTON) {
      panningPointerId = event.pointerId
      return
    }

    if (suppressUntilAllUp || drawingPointerId !== null) return

    drawingPointerId = event.pointerId

    const { px, py } = localPoint(event)

    handlers.onDrawStart(px, py)
  }

  function onPointerMove(event: PointerEvent): void {
    const previous = active.get(event.pointerId)

    if (!previous) return

    const point = localPoint(event)

    if (active.size >= 2) {
      active.set(event.pointerId, point)

      const [a, b] = pinchPoints()
      const distance = Math.hypot(a.px - b.px, a.py - b.py)
      const midX = (a.px + b.px) / 2
      const midY = (a.py + b.py) / 2

      if (midX !== pinchMidX || midY !== pinchMidY) {
        handlers.onPan(midX - pinchMidX, midY - pinchMidY)
      }

      if (pinchDistance > 0 && distance > 0 && distance !== pinchDistance) {
        handlers.onZoom(distance / pinchDistance, midX, midY)
      }

      pinchDistance = distance
      pinchMidX = midX
      pinchMidY = midY

      return
    }

    if (event.pointerId === panningPointerId) {
      active.set(event.pointerId, point)
      handlers.onPan(point.px - previous.px, point.py - previous.py)

      return
    }

    active.set(event.pointerId, point)

    if (event.pointerId !== drawingPointerId) return

    handlers.onDrawMove(point.px, point.py)
  }

  function onPointerUp(event: PointerEvent): void {
    active.delete(event.pointerId)

    if (el.hasPointerCapture?.(event.pointerId)) {
      el.releasePointerCapture(event.pointerId)
    }

    if (event.pointerId === panningPointerId) {
      panningPointerId = null
    }

    if (event.pointerId === drawingPointerId) {
      drawingPointerId = null
      handlers.onDrawEnd()
    }

    if (active.size === 0) {
      suppressUntilAllUp = false
    } else if (active.size === 1) {
      // Back to one finger after a pinch. Re-anchor nothing and draw
      // nothing; suppressUntilAllUp keeps it that way.
      pinchDistance = 0
    }
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault()

    const box = el.getBoundingClientRect()

    if (event.ctrlKey || event.metaKey) {
      // A trackpad pinch reaches the browser as a ctrl-wheel event.
      handlers.onZoom(
        Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY),
        event.clientX - box.left,
        event.clientY - box.top,
      )

      return
    }

    handlers.onPan(-event.deltaX, -event.deltaY)
  }

  el.addEventListener('pointercancel', onPointerUp)
  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
  el.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    el.removeEventListener('pointercancel', onPointerUp)
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', onPointerUp)
    el.removeEventListener('wheel', onWheel)
  }
}
```

Note on the middle-button test: `active.set` happens before the button check, so the
middle-button pointer is tracked like any other and `onPointerMove` reaches the panning
branch. The spec also lists space-plus-drag as a pan gesture; it needs a `keydown`/`keyup`
listener on `window` and a matching pair of listeners to remove on detach. **It is not in
this plan.** Wheel-pan and middle-button-drag cover the desktop case, and a `window`-level
key listener from a canvas module is a lifecycle hazard worth designing separately. Record
it as a deferred item rather than improvising it.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run --project browser src/input/pointer.test.ts`
Expected: PASS, 23 tests.

- [ ] **Step 5: Lint, run the whole suite, commit**

```bash
npx eslint src --fix
npm run lint
npm test
git add src/input/pointer.ts src/input/pointer.test.ts
git commit -m "feat: separate one-pointer drawing from two-pointer navigation"
```

---

### Task 6: The Editor facade

**Files:**
- Create: `src/editor/Editor.ts`
- Create: `src/editor/Editor.test.ts`
- Create: `src/editor/index.ts`

**Interfaces:**
- Consumes: everything above, plus `Scene`, `History`, `StrokeRecorder`,
  `createClearOperation`, `applyOperation`, `invertOperation`, `screenToCell`, `zoomAt`,
  `clampZoom`, `createCamera`, `toText`, `createBrushTool`, `createEraserTool`.
- Produces:
  ```ts
  export type EditorState = {
    brush: Emoji
    canRedo: boolean
    canUndo: boolean
    isEmpty: boolean
    toolId: string
    zoom: number
  }
  export class Editor {
    constructor(container: HTMLElement, options?: { theme?: Partial<Theme> })
    clear(): void
    destroy(): void
    getSnapshot(): EditorState
    panBy(dx: number, dy: number): void
    redo(): void
    resetView(): void
    setBrush(emoji: Emoji): void
    setTool(id: string): void
    subscribe(listener: () => void): () => void
    toText(): string
    undo(): void
    zoomBy(factor: number, anchorPx?: number, anchorPy?: number): void
  }
  ```

Four things this class must get right, each of which has already cost the project once:

1. **`getSnapshot` returns a cached object.** `useSyncExternalStore` calls it on every
   render and compares by identity; building a fresh object each time is an infinite render
   loop. The cache is invalidated only when the state actually changes.
2. **`isEmpty` is `scene.size === 0`**, never `scene.bounds() === null`. `bounds()` is an
   O(n) scan and this runs on every render.
3. **Cancelling takes both calls** — `recorder.rollback(this.scene)` and
   `tool.onCancel(ctx)`.
4. **Loading a scene clears history.** Not exercised in this plan (nothing loads yet), so
   `Editor` simply never loads; when link-sharing arrives, `history.clear()` comes with it.

- [ ] **Step 1: Write the failing test**

`src/editor/Editor.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_THEME } from '../render/theme'
import { Editor } from './Editor'

function mount() {
  const container = document.createElement('div')
  container.style.width = '300px'
  container.style.height = '300px'
  document.body.append(container)

  const editor = new Editor(container)
  const canvas = container.querySelector('canvas')!

  canvas.setPointerCapture = vi.fn()
  canvas.releasePointerCapture = vi.fn()

  return { canvas, container, editor }
}

function down(canvas: HTMLCanvasElement, px: number, py: number) {
  const box = canvas.getBoundingClientRect()

  canvas.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      clientX: box.left + px,
      clientY: box.top + py,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'touch',
    }),
  )
}

function up(canvas: HTMLCanvasElement) {
  canvas.dispatchEvent(
    new PointerEvent('pointerup', {
      bubbles: true,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'touch',
    }),
  )
}

describe('Editor', () => {
  it('creates its own canvas inside the container', () => {
    const { container } = mount()

    expect(container.querySelectorAll('canvas')).toHaveLength(1)
  })

  it('starts empty, with nothing to undo', () => {
    const { editor } = mount()
    const state = editor.getSnapshot()

    expect(state.isEmpty).toBe(true)
    expect(state.canUndo).toBe(false)
    expect(state.canRedo).toBe(false)
    expect(state.zoom).toBe(1)
  })

  it('returns the same snapshot object until something changes', () => {
    const { editor } = mount()

    expect(editor.getSnapshot()).toBe(editor.getSnapshot())
  })

  it('returns a new snapshot object after a change', () => {
    const { editor } = mount()
    const before = editor.getSnapshot()

    editor.setBrush('🔥')

    expect(editor.getSnapshot()).not.toBe(before)
    expect(editor.getSnapshot().brush).toBe('🔥')
  })

  it('notifies subscribers when state changes', () => {
    const { editor } = mount()
    const listener = vi.fn()

    editor.subscribe(listener)
    editor.setBrush('🔥')

    expect(listener).toHaveBeenCalled()
  })

  it('stops notifying after unsubscribe', () => {
    const { editor } = mount()
    const listener = vi.fn()

    editor.subscribe(listener)()
    editor.setBrush('🔥')

    expect(listener).not.toHaveBeenCalled()
  })

  it('draws a cell from a single tap', () => {
    const { canvas, editor } = mount()

    down(canvas, 5, 5)
    up(canvas)

    expect(editor.getSnapshot().isEmpty).toBe(false)
    expect(editor.toText()).toBe('❤️')
  })

  it('makes a whole stroke one undo step', () => {
    const { canvas, editor } = mount()
    const box = canvas.getBoundingClientRect()

    down(canvas, 5, 5)
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: box.left + 5 + DEFAULT_THEME.baseCellSize * 3,
        clientY: box.top + 5,
        isPrimary: true,
        pointerId: 1,
        pointerType: 'touch',
      }),
    )
    up(canvas)

    expect(editor.getSnapshot().canUndo).toBe(true)

    editor.undo()

    expect(editor.getSnapshot().isEmpty).toBe(true)
    expect(editor.getSnapshot().canUndo).toBe(false)
    expect(editor.getSnapshot().canRedo).toBe(true)
  })

  it('leaves no gaps in a fast drag', () => {
    const { canvas, editor } = mount()
    const box = canvas.getBoundingClientRect()
    const size = DEFAULT_THEME.baseCellSize

    // One jump of four cells, with no intermediate events at all — exactly
    // what a fast drag looks like. Defect 5: the old engine drew only at the
    // event points and left a dotted trail.
    down(canvas, size / 2, size / 2)
    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: box.left + size * 4 + size / 2,
        clientY: box.top + size / 2,
        isPrimary: true,
        pointerId: 1,
        pointerType: 'touch',
      }),
    )
    up(canvas)

    expect(editor.toText()).toBe('❤️❤️❤️❤️❤️')
  })

  it('rolls the stroke back when a second finger starts a pinch', () => {
    const { canvas, editor } = mount()
    const box = canvas.getBoundingClientRect()

    down(canvas, 5, 5)

    expect(editor.getSnapshot().isEmpty).toBe(false)

    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: box.left + 120,
        clientY: box.top + 5,
        isPrimary: false,
        pointerId: 2,
        pointerType: 'touch',
      }),
    )

    // The stroke is abandoned, not committed: an attempt to zoom must not
    // leave a stray cell behind.
    expect(editor.getSnapshot().isEmpty).toBe(true)
    expect(editor.getSnapshot().canUndo).toBe(false)
  })

  it('redoes what it undid', () => {
    const { canvas, editor } = mount()

    down(canvas, 5, 5)
    up(canvas)
    editor.undo()
    editor.redo()

    expect(editor.toText()).toBe('❤️')
  })

  it('drops the redo stack after a new stroke', () => {
    const { canvas, editor } = mount()

    down(canvas, 5, 5)
    up(canvas)
    editor.undo()

    down(canvas, 5, 5)
    up(canvas)

    expect(editor.getSnapshot().canRedo).toBe(false)
  })

  it('erases with the eraser tool', () => {
    const { canvas, editor } = mount()

    down(canvas, 5, 5)
    up(canvas)
    editor.setTool('eraser')
    down(canvas, 5, 5)
    up(canvas)

    expect(editor.getSnapshot().isEmpty).toBe(true)
    expect(editor.getSnapshot().toolId).toBe('eraser')
  })

  it('makes clearing undoable', () => {
    const { canvas, editor } = mount()

    down(canvas, 5, 5)
    up(canvas)
    editor.clear()

    expect(editor.getSnapshot().isEmpty).toBe(true)

    editor.undo()

    expect(editor.toText()).toBe('❤️')
  })

  it('records nothing for a clear on an empty scene', () => {
    const { editor } = mount()

    editor.clear()

    expect(editor.getSnapshot().canUndo).toBe(false)
  })

  it('exports the drawing as text with the filler between cells', () => {
    const { canvas, editor } = mount()
    const size = DEFAULT_THEME.baseCellSize

    down(canvas, 5, 5)
    up(canvas)
    down(canvas, 5 + size * 2, 5)
    up(canvas)

    expect(editor.toText()).toBe('❤️〰️❤️')
  })

  it('clamps zoom to the camera limits', () => {
    const { editor } = mount()

    editor.zoomBy(1000)

    expect(editor.getSnapshot().zoom).toBe(4)

    editor.zoomBy(0.00001)

    expect(editor.getSnapshot().zoom).toBe(0.1)
  })

  it('returns to zoom 1 on resetView', () => {
    const { editor } = mount()

    editor.zoomBy(2)
    editor.panBy(50, 50)
    editor.resetView()

    expect(editor.getSnapshot().zoom).toBe(1)
  })

  it('draws in the cell the pointer is over after panning', () => {
    const { canvas, editor } = mount()
    const size = DEFAULT_THEME.baseCellSize

    // Move the content one cell right, so screen x=5 is now cell -1.
    editor.panBy(size, 0)
    down(canvas, 5, 5)
    up(canvas)
    editor.panBy(-size, 0)
    down(canvas, 5, 5)
    up(canvas)

    // Two different cells, one apart, so the export is two cells wide.
    expect(editor.toText()).toBe('❤️❤️')
  })

  it('removes its canvas and listeners on destroy', () => {
    const { canvas, container, editor } = mount()

    editor.destroy()

    expect(container.querySelector('canvas')).toBeNull()

    down(canvas, 5, 5)
    up(canvas)

    expect(editor.getSnapshot().isEmpty).toBe(true)
  })

  it('survives destroy being called twice', () => {
    const { editor } = mount()

    editor.destroy()

    expect(() => editor.destroy()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run --project browser src/editor/Editor.test.ts`
Expected: FAIL — the module `./Editor` does not exist.

- [ ] **Step 3: Write the implementation**

`src/editor/Editor.ts`:

```ts
import type { Camera } from '../core/camera'
import type { Emoji } from '../core/types'
import type { Tool, ToolContext } from '../tools/types'
import type { Theme } from '../render/theme'

import { createCamera, screenToCell, zoomAt } from '../core/camera'
import { toText } from '../core/export/text'
import { History } from '../core/history'
import {
  applyOperation,
  createClearOperation,
  invertOperation,
  StrokeRecorder,
} from '../core/operations'
import { Scene } from '../core/scene'
import { attachPointerInput } from '../input/pointer'
import { GlyphAtlas } from '../render/glyphAtlas'
import { renderScene } from '../render/scene'
import { DEFAULT_THEME } from '../render/theme'
import { createBrushTool } from '../tools/brush'
import { createEraserTool } from '../tools/eraser'

/** Everything the React shell is allowed to know about the engine. */
export type EditorState = {
  brush: Emoji
  canRedo: boolean
  canUndo: boolean
  isEmpty: boolean
  toolId: string
  zoom: number
}

const INITIAL_BRUSH = '❤️'

/**
 * Assembles the layers and owns their lifecycle. Everything imperative lives
 * behind this class, so React holds one reference and never re-renders
 * because of drawing.
 *
 * `subscribe` and `getSnapshot` are shaped for useSyncExternalStore. The old
 * engine mirrored its state into React through a callback, and the two
 * copies drifted; there is only one copy now, and React reads it.
 */
export class Editor {
  private readonly camera: Camera = createCamera()
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly history = new History()
  private readonly recorder = new StrokeRecorder()
  private readonly resizeObserver: ResizeObserver
  private readonly scene = new Scene()
  private readonly theme: Theme
  private readonly tools = new Map<string, Tool>()

  private atlas: GlyphAtlas
  private brush: Emoji = INITIAL_BRUSH
  private destroyed = false
  private dpr = 0
  private detachInput: () => void
  private dirty = true
  private frame = 0
  private height = 0
  private listeners = new Set<() => void>()
  private snapshot: EditorState | null = null
  private tool: Tool
  private width = 0

  constructor(container: HTMLElement, options?: { theme?: Partial<Theme> }) {
    this.theme = { ...DEFAULT_THEME, ...options?.theme }

    this.canvas = document.createElement('canvas')
    this.canvas.style.display = 'block'
    container.append(this.canvas)

    this.ctx = this.canvas.getContext('2d')!
    this.atlas = new GlyphAtlas(deviceRatio(), this.theme.fontStack)

    const brushTool = createBrushTool()
    const eraserTool = createEraserTool()

    this.tools.set(brushTool.id, brushTool)
    this.tools.set(eraserTool.id, eraserTool)
    this.tool = brushTool

    this.detachInput = attachPointerInput(this.canvas, {
      onDrawCancel: () => this.cancelStroke(),
      onDrawEnd: () => this.endStroke(),
      onDrawMove: (px, py) => {
        this.tool.onMove(this.toCell(px, py), this.ctxFor())
        // markDirty, not invalidate: a drag fires far more often than the
        // display refreshes, and nothing on the toolbar changes mid-stroke.
        // Notifying here would mean a React render per pointer event.
        this.markDirty()
      },
      onDrawStart: (px, py) => {
        this.tool.onDown(this.toCell(px, py), this.ctxFor())
        this.invalidate()
      },
      onPan: (dx, dy) => this.panBy(dx, dy),
      onZoom: (factor, px, py) => this.zoomBy(factor, px, py),
    })

    this.resizeObserver = new ResizeObserver(() => this.resize(container))
    this.resizeObserver.observe(container)
    this.resize(container)
    this.scheduleFrame()
  }

  /** Erases everything, as one undoable operation. */
  clear(): void {
    const op = createClearOperation(this.scene)

    if (op.changes.length === 0) return

    const inverse = invertOperation(this.scene, op)

    applyOperation(this.scene, op)
    this.history.commit(op, inverse)
    this.invalidate()
  }

  destroy(): void {
    if (this.destroyed) return

    this.destroyed = true
    this.detachInput()
    this.resizeObserver.disconnect()
    cancelAnimationFrame(this.frame)
    this.canvas.remove()
    this.listeners.clear()
  }

  /**
   * The same object until something actually changes. useSyncExternalStore
   * calls this on every render and compares by identity, so a fresh object
   * each time would loop forever.
   */
  getSnapshot(): EditorState {
    if (!this.snapshot) {
      this.snapshot = {
        brush: this.brush,
        canRedo: this.history.canRedo,
        canUndo: this.history.canUndo,
        // scene.size, never bounds(): bounds() scans every drawn cell, and
        // this runs on every React render.
        isEmpty: this.scene.size === 0,
        toolId: this.tool.id,
        zoom: this.camera.zoom,
      }
    }

    return this.snapshot
  }

  /** Moves the content by (dx, dy) screen pixels; the camera goes the other way. */
  panBy(dx: number, dy: number): void {
    this.camera.offsetX -= dx
    this.camera.offsetY -= dy
    // No snapshot field depends on the offset, so this never wakes React.
    this.markDirty()
  }

  redo(): void {
    if (this.history.redo(this.scene)) this.invalidate()
  }

  resetView(): void {
    this.camera.offsetX = 0
    this.camera.offsetY = 0
    this.camera.zoom = 1
    this.invalidate()
  }

  setBrush(emoji: Emoji): void {
    if (this.brush === emoji) return

    this.brush = emoji
    this.invalidate()
  }

  setTool(id: string): void {
    const next = this.tools.get(id)

    if (!next || next === this.tool) return

    this.tool = next
    this.invalidate()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  toText(): string {
    return toText(this.scene)
  }

  undo(): void {
    if (this.history.undo(this.scene)) this.invalidate()
  }

  zoomBy(factor: number, anchorPx?: number, anchorPy?: number): void {
    const next = zoomAt(
      this.camera,
      factor,
      anchorPx ?? this.width / 2,
      anchorPy ?? this.height / 2,
    )

    // zoomAt has already clamped to the camera's limits.
    this.camera.offsetX = next.offsetX
    this.camera.offsetY = next.offsetY
    this.camera.zoom = next.zoom
    this.invalidate()
  }

  /**
   * Abandons the stroke. Two calls, and both are needed: the recorder puts
   * the scene back, the tool forgets the cell it last painted. Neither does
   * the other's job.
   */
  private cancelStroke(): void {
    this.recorder.rollback(this.scene)
    this.tool.onCancel(this.ctxFor())
    this.invalidate()
  }

  private ctxFor(): ToolContext {
    return { brush: this.brush, recorder: this.recorder, scene: this.scene }
  }

  private draw(): void {
    renderScene(this.ctx, this.scene, {
      atlas: this.atlas,
      camera: this.camera,
      height: this.height,
      theme: this.theme,
      width: this.width,
    })
  }

  private endStroke(): void {
    this.tool.onUp(this.ctxFor())

    const committed = this.recorder.commit(this.tool.id)

    if (committed) {
      this.history.commit(committed.op, committed.inverse)
    }

    this.invalidate()
  }

  /** Marks the frame dirty and tells React the toolbar may have changed. */
  private invalidate(): void {
    this.markDirty()
    this.snapshot = null

    for (const listener of this.listeners) listener()
  }

  /** Asks for a redraw without waking React. */
  private markDirty(): void {
    this.dirty = true
  }

  private resize(container: HTMLElement): void {
    const dpr = deviceRatio()

    if (dpr !== this.dpr) {
      // Every buffer in the atlas was rasterised for the old ratio; moving
      // the window to a display with a different one would otherwise leave
      // every glyph soft.
      this.dpr = dpr
      this.atlas = new GlyphAtlas(dpr, this.theme.fontStack)
    }

    this.width = container.clientWidth
    this.height = container.clientHeight
    this.canvas.width = Math.round(this.width * dpr)
    this.canvas.height = Math.round(this.height * dpr)
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.markDirty()
  }

  /**
   * One draw per frame regardless of how many pointer events arrived. A fast
   * drag fires far more often than the display refreshes.
   */
  private scheduleFrame(): void {
    this.frame = requestAnimationFrame(() => {
      if (this.destroyed) return

      if (this.dirty) {
        this.dirty = false
        this.draw()
      }

      this.scheduleFrame()
    })
  }

  private toCell(px: number, py: number) {
    return screenToCell(this.camera, this.theme.baseCellSize, px, py)
  }
}

function deviceRatio(): number {
  return window.devicePixelRatio || 1
}
```

`src/editor/index.ts`:

```ts
export { Editor } from './Editor'
export type { EditorState } from './Editor'
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run --project browser src/editor/Editor.test.ts`
Expected: PASS, 21 tests.

If "draws a cell from a single tap" fails on the container having no measured size, give
the container an explicit width and height in the test — a `ResizeObserver` on a zero-sized
element reports zero, and `visibleBounds` then covers a single cell.

- [ ] **Step 5: Lint, run the whole suite, commit**

```bash
npx eslint src --fix
npm run lint
npm test
git add src/editor/Editor.ts src/editor/Editor.test.ts src/editor/index.ts
git commit -m "feat: add the Editor facade over scene, history, render and input"
```

---

### Task 7: Port the React shell

**Files:**
- Create: `src/hooks/useEditor.ts`
- Create: `src/hooks/useEditorState.ts`
- Create: `src/types/emoji-picker.d.ts`
- Create: `src/components/App/App.test.tsx`
- Modify: `src/components/App/App.tsx`
- Modify: `src/components/Tool/Tool.tsx`
- Modify: `src/components/EmojiPicker/EmojiPicker.tsx`
- Modify: `src/hooks/useEmojiPicker.ts`
- Modify: `src/hooks/index.ts`

**Interfaces:**
- Consumes: `Editor`, `EditorState` from `src/editor`.
- Produces: `useEditor(ref)`, `useEditorState(editor)`.

Defects this task closes: 6 (the picker listener is never removed, plus a stray
`console.log`), 7 (`useEmojiCanvas` depends on state it sets itself), 9 (`isSelected &&
'...'` writes the string `"false"` into `className`).

The look does not change: same wrapper, same Tailwind classes, same button order. Undo,
redo and reset-view buttons are appended.

- [ ] **Step 1: Install the browser-mode React renderer**

```bash
npm install -D vitest-browser-react
```

`@testing-library/react` targets jsdom; this project's component tests run in real
Chromium, so they need the browser-mode renderer. Check `npm run lint` and `npm test`
still pass right after installing, before writing anything — a dependency that breaks the
peer graph is easier to see on its own.

- [ ] **Step 2: Write the failing test**

`src/components/App/App.test.tsx`:

```tsx
import { render } from 'vitest-browser-react'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('renders a canvas', async () => {
    const screen = render(<App />)

    await expect.element(screen.getByRole('button', { name: 'Clear' })).toBeVisible()
    expect(document.querySelectorAll('canvas')).toHaveLength(1)
  })

  it('disables undo and redo until something is drawn', async () => {
    const screen = render(<App />)

    await expect.element(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    await expect.element(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('never puts the string false into a class list', async () => {
    const screen = render(<App />)
    const clear = screen.getByRole('button', { name: 'Clear' })

    await expect.element(clear).toBeVisible()
    expect((await clear.element()).className).not.toContain('false')
  })

  it('creates exactly one canvas under StrictMode double-mounting', () => {
    render(<App />)

    expect(document.querySelectorAll('canvas')).toHaveLength(1)
  })

  it('tears the editor down on unmount', () => {
    const screen = render(<App />)

    screen.unmount()

    // Defect 6 in the spec was a listener that outlived its component. If
    // destroy did not run, the canvas would still be in the document.
    expect(document.querySelectorAll('canvas')).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `npx vitest run --project browser src/components/App/App.test.tsx`
Expected: FAIL — `App` still renders the old engine and has no Undo button.

- [ ] **Step 4: Write the hooks**

`src/hooks/useEditor.ts`:

```ts
import type { RefObject } from 'react'

import { useEffect, useState } from 'react'

import { Editor } from '../editor'

/**
 * One Editor per mount. StrictMode mounts, unmounts and mounts again in
 * development, so the cleanup must fully undo the setup — the old
 * useEmojiCanvas depended on state it set itself, and its cleanup closed
 * over the previous value, which is how a second canvas appeared.
 */
export function useEditor(ref: RefObject<HTMLElement | null>): Editor | null {
  const [editor, setEditor] = useState<Editor | null>(null)

  useEffect(() => {
    const container = ref.current

    if (!container) return

    const instance = new Editor(container)

    setEditor(instance)

    return () => {
      setEditor(null)
      instance.destroy()
    }
  }, [ref])

  return editor
}
```

`src/hooks/useEditorState.ts`:

```ts
import type { Editor, EditorState } from '../editor'

import { useSyncExternalStore } from 'react'

const EMPTY: EditorState = {
  brush: '❤️',
  canRedo: false,
  canUndo: false,
  isEmpty: true,
  toolId: 'brush',
  zoom: 1,
}

/**
 * Reads editor state through useSyncExternalStore, so React holds no copy to
 * fall out of sync. EMPTY is a module constant rather than a fresh object:
 * getSnapshot is called on every render and compared by identity.
 */
export function useEditorState(editor: Editor | null): EditorState {
  return useSyncExternalStore(
    listener => editor?.subscribe(listener) ?? (() => {}),
    () => editor?.getSnapshot() ?? EMPTY,
  )
}
```

Replace `src/hooks/index.ts`:

```ts
export { useEditor } from './useEditor'
export { useEditorState } from './useEditorState'
export { useEmojiPicker } from './useEmojiPicker'
```

- [ ] **Step 5: Fix the picker hook and its typing**

`src/hooks/useEmojiPicker.ts` — the listener is removed on unmount and on every callback
change, and the `console.log` is gone:

```ts
import type { Picker } from 'emoji-picker-element'
import type { RefObject } from 'react'

import { useEffect } from 'react'

export function useEmojiPicker(
  ref: RefObject<null | Picker>,
  onEmojiClick?: (emojiCode: string) => void,
) {
  useEffect(() => {
    const picker = ref.current

    if (!picker || !onEmojiClick) return

    const handle = (event: CustomEvent<{ unicode?: string }>) => {
      if (!event.detail.unicode) return

      onEmojiClick(event.detail.unicode)
    }

    picker.addEventListener('emoji-click', handle)

    return () => picker.removeEventListener('emoji-click', handle)
  }, [onEmojiClick, ref])
}
```

`src/types/emoji-picker.d.ts` — replaces the `@ts-ignore`:

```ts
import type { Picker } from 'emoji-picker-element'
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'emoji-picker': { class?: string } & DetailedHTMLProps<
        HTMLAttributes<Picker>,
        Picker
      >
    }
  }
}
```

Then delete the `{/*@ts-ignore*/}` line from
`src/components/EmojiPicker/EmojiPicker.tsx`; nothing else in that file changes.

If `npm run build` rejects the declaration, the shape React 19 wants may differ. Do not
reinstate `@ts-ignore` — read the compiler's message and adjust the declaration.

- [ ] **Step 6: Fix Tool.tsx**

`src/components/Tool/Tool.tsx` — defect 9. `${isSelected && '...'}` interpolates the
literal string `"false"` into `className` whenever `isSelected` is false:

```tsx
import { ButtonHTMLAttributes, PropsWithChildren } from 'react'

export function Tool({
  children,
  className,
  isSelected,
  onClick,
  ...rest
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { isSelected?: boolean }
>) {
  // border-gray-200 is explicit: Tailwind 4's Preflight defaults borders
  // to currentColor, so a bare `border` would otherwise render in the
  // button's text colour instead of the original light-gray hairline.
  const classes = [
    'hover:bg-slate-100 border border-gray-200 rounded p-5 md:p-1',
    'disabled:opacity-40',
    className,
    isSelected ? 'bg-slate-200' : '',
  ]

  return (
    <button className={classes.filter(Boolean).join(' ')} onClick={onClick} {...rest}>
      {children}
    </button>
  )
}
```

- [ ] **Step 7: Rewrite App.tsx**

```tsx
import { useCallback, useRef, useState } from 'react'

import { useEditor, useEditorState } from '../../hooks'
import { EmojiPickerButton } from '../EmojiPickerButton'
import { Tool } from '../Tool'
import { Tools } from '../Tools'

export function App() {
  const [isBrushSelecting, setIsBrushSelecting] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  const editor = useEditor(ref)
  const { brush, canRedo, canUndo, isEmpty, toolId } = useEditorState(editor)

  const handleEmojiClick = useCallback(
    (emojiCode: string) => {
      setIsBrushSelecting(false)
      editor?.setBrush(emojiCode)
      editor?.setTool('brush')
    },
    [editor],
  )

  return (
    <div className="flex flex-col space-y-2 items-center pt-7 min-w-fit md:space-y-0 md:flex-row-reverse md:justify-center md:items-start">
      <div className="w-full h-[70vh] md:w-[600px] md:h-[600px]" ref={ref} />

      <Tools>
        <EmojiPickerButton
          brush={brush}
          isEmojiPickerHidden={!isBrushSelecting}
          isSelected={toolId === 'brush'}
          onClick={() => setIsBrushSelecting(true)}
          onEmojiClick={handleEmojiClick}
        />
        <Tool
          isSelected={toolId === 'eraser'}
          onClick={() => editor?.setTool('eraser')}
        >
          Eraser
        </Tool>
        <Tool disabled={!canUndo} onClick={() => editor?.undo()}>
          Undo
        </Tool>
        <Tool disabled={!canRedo} onClick={() => editor?.redo()}>
          Redo
        </Tool>
        <Tool onClick={() => editor?.resetView()}>Reset view</Tool>
        <Tool disabled={isEmpty} onClick={() => editor?.clear()}>
          Clear
        </Tool>
        <Tool
          disabled={isEmpty}
          onClick={async () => {
            const text = editor?.toText()

            if (text) {
              await navigator.clipboard.writeText(text)
            }
          }}
        >
          Copy
        </Tool>
      </Tools>
    </div>
  )
}
```

`EmojiPickerButton` currently inverts the flag on its way down — `isSelected={!isSelected}`
— because the old caller passed `!isErasing`. Two negations cancelled out. `App` now passes
`toolId === 'brush'` directly, so the inversion has to go or the button will look selected
exactly when it is not. Replace the component body in
`src/components/EmojiPickerButton/EmojiPickerButton.tsx`:

```tsx
export const EmojiPickerButton: FC<EmojiPickerButtonProps> = ({
  brush,
  isEmojiPickerHidden,
  isSelected,
  onClick,
  onEmojiClick,
}) => (
  <Tool className="relative" isSelected={isSelected} onClick={onClick}>
    {brush}
    <EmojiPicker isHidden={isEmojiPickerHidden} onEmojiClick={onEmojiClick} />
  </Tool>
)
```

The interface and the imports above it are unchanged.

The commented-out `<dialog>` block is deleted with the rest of the old markup. That also
retires deferred finding 5 from plan 1 — the orphaned `.px-1` in the built CSS.

- [ ] **Step 8: Make the mobile layout hold up**

The spec treats mobile as a first-class target, and three of its requirements are layout,
not engine:

- **Tap targets of at least 44 logical pixels.** `Tool`'s `p-5` already clears that on
  small screens (`md:p-1` shrinks it only from the `md` breakpoint up). Verify in the
  device toolbar rather than assuming; if a button measures under 44px, raise the padding
  at the small breakpoint, not everywhere.
- **The picker must not cover the toolbar.** `EmojiPicker` pins itself to
  `fixed bottom-0 left-0 w-full` on small screens, which puts it over a bottom-anchored
  toolbar. With the toolbar above the canvas in column order this is already fine — confirm
  by opening the picker on a narrow viewport and checking the toolbar is still reachable.
- **The canvas takes the available height**, which is what `h-[70vh]` in step 7 does, with
  `ResizeObserver` picking the size up. There is no fixed cell count any more.

No new test: these are visual constraints, and this iteration deliberately sets up no
screenshot baselines (a redesign would stale them immediately). Check them by hand in
step 10 and write down what you saw.

- [ ] **Step 9: Run the tests and watch them pass**

```bash
npx vitest run --project browser src/components/App/App.test.tsx
npm test
npm run build
```
Expected: all PASS, build clean.

- [ ] **Step 10: Look at it in a browser**

`npm run dev`, then open `http://localhost:5173/emojicanvas/` — note the base path.
Check by hand, because no test covers these:

- a single click draws one cell;
- a fast drag leaves an unbroken line with no gaps (defect 5);
- grid lines survive drawing over them (defect 3);
- `❤️` and `😀` sit at the same height in their cells (defect 10);
- undo, redo, clear, copy, reset view;
- the wheel pans, ctrl-wheel zooms;
- the emoji picker still opens and changes the brush.

- [ ] **Step 11: Commit**

```bash
npx eslint src --fix
npm run lint
git add src/hooks src/components src/types
git commit -m "feat: port the React shell onto the Editor facade"
```

---

### Task 8: Remove the old engine

**Files:**
- Delete: `src/lib/EmojiCanvas.ts`, `src/lib/index.ts`, `src/hooks/useEmojiCanvas.ts`
- Modify: `CLAUDE.md`, `README.md`, `docs/superpowers/PROGRESS.md`

Nothing imports these any more after task 7. This is the step where the drawing engine
stops being two engines.

- [ ] **Step 1: Prove nothing imports them**

```bash
grep -rn "EmojiCanvas\|useEmojiCanvas" src/
```
Expected: no matches. Anything that turns up must be fixed before deleting.

- [ ] **Step 2: Delete**

```bash
git rm src/lib/EmojiCanvas.ts src/lib/index.ts src/hooks/useEmojiCanvas.ts
```

- [ ] **Step 3: Verify everything still passes**

```bash
npm run lint
npm test
npm run build
```
Expected: all clean. The build must still emit `base: '/emojicanvas/'`; do not touch
`vite.config.ts`.

- [ ] **Step 4: Update CLAUDE.md**

The "Architecture" section describes `src/lib/EmojiCanvas.ts`, `useEmojiCanvas`, the
`string[][]` matrix, the filler-as-brush erasing model and the hard-coded
`emojiOffsetInsideCellX/Y`. All of that is now false. Rewrite it to describe the layered
engine: `core` → `render`/`input`/`tools` → `editor` → `ui`, dependencies pointing strictly
inward; the scene as sparse storage on an unbounded grid; erasing as a real tool that
deletes cells; the filler as an export-only concept; glyph centring from real metrics.

Keep the Commands and Conventions sections as they are.

- [ ] **Step 5: Update the README**

Remove the known-weakness note about hard-coded emoji offsets only looking right with Apple
metrics — the atlas centres on measured metrics now. Strike the finished items from the
TODO list; leave fill, line and rectangle tools, and import/save.

- [ ] **Step 6: Update PROGRESS.md**

Mark plan 3 done, record what is left: the space-plus-drag pan gesture (deferred in task 5),
the spec's step 7 (benchmarks and real-device measurement, including tuning the level-of-
detail thresholds), and plan 1's deferred findings, which still need clearing before
`foundation` merges into `main`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove the old canvas engine"
```

---

## What this plan deliberately leaves undone

Record these in `PROGRESS.md` at task 8 rather than improvising them:

1. **Space-plus-drag panning.** The spec lists it; task 5 covers wheel-pan and
   middle-button-drag instead. A `window`-level key listener owned by a canvas module needs
   its own lifecycle design.
2. **Benchmarks and real-device measurement** — the spec's step 7. The level-of-detail
   thresholds (12px and 4px) stay at their starting values until something measures them.
3. **`toMatchScreenshot` baselines.** The spec defers them on purpose: a redesign is coming
   and the baselines would go stale immediately.
4. **Factoring brush and eraser together.** They share about twenty identical lines. Plan
   2's review settled that this waits for line, rectangle and fill, so all of them can be
   factored at once.
5. **Loading a scene from a link or file.** When it lands, `Editor` must call
   `history.clear()` — undo would otherwise walk into a scene the operations were never
   recorded against.
