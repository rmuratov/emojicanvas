# EmojiCanvas: Foundation

Date: 2026-09-07

## Why

The project is three years old. The task is to update the toolchain, rebuild the engine so
it can carry the planned features, and cover it with tests. The application's functionality
stays the same.

The product framing that drives the architectural decisions: EmojiCanvas is not "a drawing
app for emoji text" but a **pixel editor where the pixel is an emoji**. Text export is one
of several outputs, alongside raster export and a link to the editor.

Planned features (not implemented in this iteration, but the foundation must support them):

| Feature | Requirement on the foundation |
|---|---|
| Rasterizing an image into an emoji mosaic | Bulk cell writes in a single operation |
| Paint tools: line, rectangle, fill | A tool abstraction that produces operations |
| Undo/redo | Reversible operations (part of this iteration) |
| Export to PNG/JPG | Rendering not tied to the on-screen canvas |
| Sharing a link to the editor | The scene is pure, serializable data |
| Pixel-art redesign | View parameters factored out of rendering logic |

Zoom and panning were originally on this list but were pulled into this iteration's scope:
on a phone a finger covers three or four cells, and without zoom, precise drawing is
impossible. This isn't a nicety, it's a condition for the mobile version to work at all.

Deliberately **not** planned for: layers, plugins, an emoji color palette, a file format.
That's speculation, to be designed when it's actually needed.

## Language

Everything in the repository is in English: code, identifiers, comments, test names,
commit messages, and the documents under `docs/` — this specification and the
implementation plans included.

This was not always the case. The spec and the first plans were originally written in
Russian, and test names were once copied out of a plan into the repository verbatim,
in Russian. Translating the documents removes the source of that mistake rather than
relying on everyone remembering to translate as they go.

## Iteration scope

**In scope:** dependency and CI updates; the new core, renderer, input, tools; undo/redo;
zoom, panning and gestures; mobile UX; tests; porting the React shell onto the new engine.

**Out of scope:** shape tools, image rasterization, raster export, saving and sharing,
screenshot baselines, a bundled emoji font, the redesign.

User-facing functionality after this iteration is the current set plus undo/redo and canvas
navigation: brush, eraser, clear, copy to text. The look stays the same.

## Technology choices

**Rendering: canvas 2D, no game engine.** Phaser is out as a game engine: scenes, physics,
audio and a game loop are all foreign to an editor. Pixi.js is a closer fit, but its
strength is batching many objects with independent transforms, whereas we have a regular
grid of identical glyphs from a small set. A sprite per cell doesn't scale to millions of
cells, which means we'd end up writing our own tile renderer on top of Pixi anyway, i.e.
pulling in a library for its shaders rather than its API. On top of that, WebGL doesn't test
well headless.

The arithmetic shows there's no need for it: a Full HD screen at a 30px cell size is
64×36 ≈ 2300 cells, i.e. around 2300 `drawImage` calls from a single atlas within a 16.7ms
frame budget. The bottleneck isn't there, it shows up at strong zoom-out, and is solved by
levels of detail (see "Performance"), not by switching rendering technology.

The decision isn't a lock-in: the renderer is isolated behind `render/scene.ts`, and a move
to WebGL would replace one module without touching the core, tools, or UI.

**React stays.** Its role is interface chrome only: the toolbar, the picker, future panels,
dialogs and a gallery. React has no part in frame drawing: the engine owns the canvas and
draws via `requestAnimationFrame`, with no re-render happening while drawing. React's cost
is bundle weight, and zero in the hot path. Given the plans for a full-featured editor, the
interface is going to grow, and a hand-rolled vanilla replacement would turn into a
homegrown framework. Preact, with the same API, remains a possible future size
optimization.

## Defects in the current code fixed along the way

1. `initMatrix` builds `columnsCount` rows of `rowsCount` elements each, while
   `getDrawingAsString` reads `matrix[j][i]`. This only works on a square grid; any
   rectangular one breaks both drawing and export.
2. `clearCell` fills in the rectangle of its own cell and clips the tail of an emoji from
   the neighboring one: glyphs routinely spill outside cell bounds (`font-size` equals the
   cell height, plus the `emojiOffsetInsideCellY = 4` offset).
3. The same `fillRect` erases the grid lines, and nothing redraws them; `drawGrid` is only
   called on clear.
4. A single tap on mobile doesn't draw: `touchstart` only sets a flag, `touchend` clears it,
   and drawing only happens in `touchmove`.
5. Fast pointer movement leaves gaps: drawing only happens at event points, with no
   interpolation between them.
6. `useEmojiPicker` attaches a listener without removing it; every callback change adds
   another one. There's also a forgotten `console.log` nearby.
7. `useEmojiCanvas` depends on state that it sets itself; the cleanup closes over the
   previous value.
8. `remove()` removes the canvas element but doesn't detach the listeners.
9. In `Tool.tsx`, the expression `${isSelected && 'bg-slate-200'}` substitutes the string
   `"false"` into `className` when `isSelected` is false.
10. Hardcoded `emojiOffsetInsideCellX/Y` are the same for every glyph, which is why symbols
    with an emoji selector (`❤️` = U+2764 U+FE0F, `〰️` = U+3030 U+FE0F) render with an
    offset while native emoji (`😀` = U+1F600) don't.

Defects 1-5 and 10 disappear as a class from the architecture change, not from targeted
patches.

## Architecture

```
src/
  core/          pure data and logic, zero DOM
    types.ts       Cell, CellBounds, Emoji
    scene.ts       sparse cell storage, serializable
    operations.ts  the single mutation path, reversible
    history.ts     undo/redo stack
    camera.ts      screen ↔ cell coordinates
    line.ts        cell interpolation between two points
    export/text.ts scene → string
  render/        knows about canvas, doesn't know about React
    glyphAtlas.ts  emoji rasterization centered by metrics
    scene.ts       draws the scene into a supplied context
    theme.ts       colors, cell size, antialiasing
  input/
    pointer.ts     Pointer Events → cell coordinates
  tools/
    types.ts       tool interface
    brush.ts, eraser.ts
  editor/
    Editor.ts      facade gluing the layers together
  ui/            thin React shell
```

Dependencies point strictly inward: `ui` → `editor` → `render`/`input`/`tools` → `core`.
`core` imports nothing from the other layers and never touches the DOM.

### core/scene.ts

Sparse storage: a key present means the cell is drawn, a key absent means it's empty.
Coordinates are arbitrary integers, including negative ones; the canvas has no bounds.

```ts
type Emoji = string
type Cell = { x: number; y: number }
type CellBounds = { minX: number; minY: number; maxX: number; maxY: number } // inclusive

class Scene {
  get(x: number, y: number): Emoji | undefined
  has(x: number, y: number): boolean
  readonly size: number
  entries(): IterableIterator<[Cell, Emoji]>
  bounds(): CellBounds | null          // null when the scene is empty
  toJSON(): SceneData
  static fromJSON(data: SceneData): Scene
}
```

The first version's implementation is a `Map` with the string key `` `${x},${y}` ``. The
storage is hidden behind this interface: if the string key becomes a bottleneck at millions
of cells, the implementation can change without touching the rest of the code.

`bounds()` is computed by walking the filled cells on demand, rather than maintained
incrementally: erasing can shrink the boundary, and incremental tracking would need to
recompute anyway.

Only `operations.ts` and `StrokeRecorder` write to the scene: `Scene` has a low-level write
method, but it's marked internal and used by neither the renderer, the tools, nor the UI.
For everything else, the scene is read-only.

### core/operations.ts

```ts
type CellChange = { x: number; y: number; value: Emoji | undefined } // undefined = erase
type Operation = { label: string; changes: readonly CellChange[] }

function applyOperation(scene: Scene, op: Operation): void
function invertOperation(scene: Scene, op: Operation): Operation  // reads state BEFORE the operation is applied
```

A single operation describes an arbitrary number of cells. A brush stroke is one operation,
not a thousand individual writes; rasterizing an image is also one.

A stroke accumulates as drawing proceeds, so the canvas updates immediately while the
history receives it whole:

```ts
class StrokeRecorder {
  record(scene: Scene, x: number, y: number, value: Emoji | undefined): boolean
  commit(label: string): { op: Operation; inverse: Operation } | null
  rollback(scene: Scene): void
}
```

`record` remembers a cell's previous value (only on that cell's first touch), writes the new
value into the scene right away, and returns whether anything actually changed. `commit`
returns the accumulated operation together with a ready-made inverse, or `null` if the
stroke changed nothing. `rollback` restores the scene to its state before the stroke began
and writes nothing to history, needed when drawing that had already started turns out to be
the start of a navigation gesture instead.

### core/history.ts

```ts
class History {
  constructor(limit?: number)          // defaults to 100 operations
  commit(op: Operation, inverse: Operation): void  // the operation is already applied
  undo(scene: Scene): boolean
  redo(scene: Scene): boolean
  readonly canUndo: boolean
  readonly canRedo: boolean
  clear(): void
}
```

`commit` clears the redo stack. Once the limit is exceeded, the oldest entries are dropped.

### core/camera.ts

```ts
type Camera = { offsetX: number; offsetY: number; zoom: number } // offset in world pixels

function cellSizeAt(baseCellSize: number, zoom: number): number
function screenToCell(camera: Camera, baseCellSize: number, px: number, py: number): Cell
function cellToScreen(camera: Camera, baseCellSize: number, x: number, y: number): { px: number; py: number }
function visibleBounds(camera: Camera, baseCellSize: number, width: number, height: number): CellBounds
```

`screenToCell` uses `Math.floor`, so it works correctly in the negative range.

Zoom is clamped to `[0.1, 4]`. Zooming always happens around an anchor point (the cursor or
the pinch center): the scene point under the finger must stay under the finger, which has
its own dedicated test.

### core/line.ts

```ts
function cellsBetween(from: Cell, to: Cell): Cell[]  // Bresenham, both endpoints included
```

Fixes gaps from fast drawing and will be reused by the future "line" tool.

### core/export/text.ts

```ts
function toText(scene: Scene, filler?: string): string  // filler defaults to '〰️'
```

Takes `bounds()`, walks the rectangle row by row top to bottom, substituting the filler into
empty cells within the bounds. An empty scene yields an empty string.

The filler has no place in the model: it exists only here, as a detail of the text
representation. Trimming empty edges falls out for free, there's nothing to trim; the
bounds are the content.

## Rendering

The canvas is created at the size of the container, not of the grid. This removes the
browser's limit on canvas area (a 1000×1000-cell grid at 30px per cell would need a
30000×30000 canvas, which isn't allowed) and makes frame cost depend on window size, not
drawing size. Size is tracked via `ResizeObserver`, and `devicePixelRatio` is accounted for.

Redraws are full but confined to `visibleBounds`. Frames are coalesced through
`requestAnimationFrame`: changes mark the canvas dirty, and drawing happens once per frame
regardless of how often pointer events arrive.

```ts
function renderScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  opts: { camera: Camera; theme: Theme; width: number; height: number; atlas: GlyphAtlas },
): void
```

The context is passed in from outside. The on-screen canvas and an offscreen buffer for
raster export will go through the same code, so PNG export will later be a call to this
function with a different argument, not a new rendering path.

### render/glyphAtlas.ts

```ts
class GlyphAtlas {
  constructor(dpr: number, fontStack: string)
  get(emoji: Emoji, cellSizePx: number): CanvasImageSource  // rasterises on first use
  averageColor(emoji: Emoji): string                        // mean glyph colour, for LOD
  clear(): void
}
```

Each unique emoji is rasterized once into an offscreen buffer sized to a cell, and after
that is drawn with a cheap `drawImage` instead of an expensive `fillText`.

Rasterization doesn't happen at an arbitrary cell size but at **fixed steps** (16, 32, 64,
128 logical pixels); the renderer picks the nearest step and scales to the needed size with
`drawImage` itself. Without steps, a smooth pinch would re-rasterize the whole glyph set
every frame and kill the frame rate.

`averageColor` is computed once at rasterization time from the pixels of the already-drawn
glyph; a separate color table isn't needed. It will also be needed by the future
image-to-emoji-mosaic rasterization.

Centering uses the glyph's actual metrics instead of a shared constant. With
`textAlign: 'left'` and `textBaseline: 'alphabetic'`, for metrics `m = ctx.measureText(emoji)`:

```
glyph width  = m.actualBoundingBoxLeft + m.actualBoundingBoxRight
glyph height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
x = cell/2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2
y = cell/2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
```

If a glyph doesn't fit the cell, the font size is reduced by
`min(1, (cell - padding) / max(width, height))` and the glyph is rasterized again. This
evens out the visual size of symbols from different categories, including `❤️` versus
native emoji, which currently render at different sizes.

If the browser returns zero metrics, a fallback kicks in: `textAlign: 'center'`,
`textBaseline: 'middle'`, drawn at the cell's center.

The atlas is recreated whenever cell size or `devicePixelRatio` changes.

### Levels of detail

At strong zoom-out a glyph is physically indistinguishable, so drawing it is pointless. The
renderer therefore picks a mode based on the current cell size:

- **≥ 12px** — glyph from the atlas;
- **< 12px** — the cell is filled with the emoji's average color, no grid drawn;
- **< 4px** — cells are merged into blocks, filled with the block's averaged color.

The 12px threshold is a starting value, to be refined by measurements in the performance
step. This is what makes the zoomed-out view meaningful (it becomes a minimap), and it
removes the one scenario where canvas 2D could fail to stay within the frame budget.

### render/theme.ts

Background color, grid line color, base cell size, font stack, level-of-detail thresholds,
an antialiasing flag. The pixel-art redesign will be an edit to this module and the React
shell, not to rendering logic.

## Input and tools

The `mouse*` and `touch*` handlers are replaced with Pointer Events: one code path for
mouse, finger, and stylus. `setPointerCapture` keeps drawing from breaking when the pointer
leaves the canvas bounds. Drawing starts on `pointerdown`, so a single click or tap works.

```ts
function attachPointerInput(
  el: HTMLElement,
  handlers: {
    onDrawStart(cell: Cell): void
    onDrawMove(cell: Cell): void
    onDrawEnd(): void
    onPan(dx: number, dy: number): void                       // in screen pixels
    onZoom(factor: number, anchor: { px: number; py: number }): void
  },
): () => void   // returns a detach function
```

A path is filled in between the previous and current cell via `cellsBetween`.

**Gesture separation.** One pointer means drawing. Two pointers mean navigation: the
distance between them gives zoom, the midpoint's displacement gives pan; this is the scheme
familiar from Procreate and Figma. A second finger appearing cancels a stroke already in
progress: `StrokeRecorder` can roll back what's accumulated so far, so that an attempt to
zoom doesn't leave a stray line behind.

On desktop: wheel pans, `Ctrl`/`Cmd` with the wheel zooms, middle button or space plus drag
pans.

The canvas gets `touch-action: none`, otherwise the browser intercepts the gestures for
scrolling and its own page zoom.

```ts
interface Tool {
  readonly id: string
  onDown(cell: Cell, ctx: ToolContext): void
  onMove(cell: Cell, ctx: ToolContext): void
  onUp(ctx: ToolContext): void
}
type ToolContext = { scene: Scene; brush: Emoji; recorder: StrokeRecorder }
```

Implementations in this iteration: `brush` (writes the current emoji) and `eraser` (erases).
The eraser is its own tool, not "a brush that paints the filler": there's no concept of an
"erasing mode" in the new model.

A tool doesn't touch history directly: it writes changes through `recorder`. After `onUp`,
the `Editor` performs the commit, calling `recorder.commit(...)` and, if the stroke changed
anything, handing the operation with its inverse to `History.commit`. That way every stroke
becomes a single undo step, and tools don't need to know anything about history.

Line, rectangle, and fill are added later as new `Tool` implementations, without touching
the core or the renderer.

## editor/Editor.ts

A facade that assembles the layers and owns their lifecycle.

```ts
class Editor {
  constructor(container: HTMLElement, options?: { theme?: Partial<Theme> })
  setBrush(emoji: Emoji): void
  setTool(id: string): void
  clear(): void
  undo(): void
  redo(): void
  zoomBy(factor: number, anchor?: { px: number; py: number }): void
  panBy(dx: number, dy: number): void
  resetView(): void               // back to zoom 1, content centred
  toText(): string
  subscribe(listener: () => void): () => void
  getSnapshot(): EditorState      // { brush, toolId, canUndo, canRedo, isEmpty, zoom }
  destroy(): void                 // removes listeners, ResizeObserver and rAF
}
```

`subscribe` and `getSnapshot` are built for `useSyncExternalStore`, which eliminates the
React-state-versus-engine-state desync that currently causes the erasing status to be
duplicated through a callback.

`destroy` tears down everything the constructor sets up.

## React shell

Components stay thin: toolbar, buttons, emoji picker. Undo/redo buttons are added, disabled
according to `canUndo`/`canRedo`.

- `useEditor(containerRef)` creates the `Editor` once, is StrictMode-safe, and correctly
  calls `destroy` on unmount.
- The picker's `emoji-click` listener is removed on unmount; the stray debug `console.log`
  is removed.
- The `@ts-ignore` over `<emoji-picker>` is replaced with a typed custom-element
  declaration.
- The `${isSelected && '...'}` in `Tool.tsx` is replaced with correctly built class list
  construction.

The look stays the same: same markup, same Tailwind classes, plus undo, redo, and reset-view
buttons.

## Mobile devices

The mobile version is a first-class citizen, not merely tolerated.

- **The canvas takes up the available screen height**, not a fixed number of cells: size
  comes from the container via `ResizeObserver`. This already follows from making the
  canvas the size of the window.
- **The toolbar** stays pinned to the bottom and isn't covered by the emoji picker; buttons
  are no smaller than 44 logical pixels.
- **Gestures** as described above: one-finger drawing, two-finger navigation.
- **`touch-action: none`** on the canvas; the page must not scroll or zoom during drawing.
- **`devicePixelRatio` up to 3** is accounted for when creating the canvas and rasterizing
  glyphs. A 400×800 CSS-pixel screen at DPR 3 is 2.9 million physical pixels per frame, so
  levels of detail and culling the invisible matter more on mobile than on desktop.
- **Undo and redo buttons** are especially needed here: it's easy to miss with a finger.

Verification happens on a real device, not just in window-size emulation: `devicePixelRatio`,
gesture behavior, and performance aren't reliably reproduced in an emulator.

## Performance

The target budget is **60 frames per second, i.e. 16.7ms per frame**, on mobile devices too.

What delivers the budget:

1. **Culling the invisible.** Only the `visibleBounds` range is drawn, so frame cost is
   determined by window size, not drawing size. A scene with a million cells renders in the
   same time as one with a hundred.
2. **Glyph atlas.** `drawImage` from a ready buffer instead of `fillText` with font matching
   and color-glyph rasterization every frame.
3. **Atlas zoom steps.** A smooth pinch doesn't trigger re-rasterization.
4. **Levels of detail.** Zooming out doesn't turn into tens of thousands of glyph draws.
5. **Coalescing through `requestAnimationFrame`.** Pointer events arrive more often than
   frames; drawing happens once per frame, gated by a "dirty" flag.
6. **No allocations in the draw loop.** Walking the visible cells creates no objects or
   closures; coordinates are passed as numbers.

The budget is verified, not just declared: the browser project gets Vitest benchmarks
measuring the time for one frame with a full screen at 1× zoom and at minimum zoom, and the
time for a full-screen stroke. Thresholds get fixed after the first measurements on real
hardware; a benchmark regression is a reason to investigate, not to raise the threshold.

## Dependency updates

| Package | Was | Becomes |
|---|---|---|
| react, react-dom | 18.2 | 19.2 |
| vite | 4.4 | 8.2 |
| @vitejs/plugin-react | 4.0 | 6.1 |
| typescript | 5.0 | 7.0 |
| eslint | 8.44 | 10.10 (flat config) |
| typescript-eslint | 5.61 | 8.69 |
| eslint-plugin-perfectionist | 1.5 | 5.11 |
| eslint-plugin-react-hooks | 4.6 | 7.1 |
| tailwindcss | 3.3 | 4.3 |
| prettier | 3.0 | 3.9 |
| emoji-picker-element | 1.18 | 1.29 |

Structural consequences:

- `.eslintrc.cjs` → `eslint.config.js` (flat config). Rules stay the same in spirit:
  `perfectionist` in natural mode, `perfectionist/sort-classes` disabled,
  `react/boolean-prop-naming`.
- `eslint-plugin-import` and `eslint-import-resolver-typescript` are removed: import
  sorting is handled by `perfectionist`, path resolution by TypeScript, and this plugin's
  flat-config support has historically been troublesome. The one rule that was actually
  used, `import/newline-after-import`, is a formatting concern and stays with Prettier.
- Tailwind 4 is configured from CSS. `tailwind.config.js` and `postcss.config.js` are
  removed, the Tailwind plugin for Vite is wired in, and the directives in `index.css` are
  replaced with a Tailwind import.
- Prettier keeps its current settings: no semicolons, single quotes, 80-column width.

CI (`.github/workflows/vite.yaml`): `npm install` → `npm ci`, Node 18 → 24, `actions/*`
bumped to current versions, `lint` and `test` steps added. Publishing to GitHub Pages and
`base: '/emojicanvas/'` don't change.

## Tests

Vitest 5, two projects in one config.

**The node project** — `core` and `tools`, pure functions with no DOM:

- `scene` — writing, erasing, negative coordinates, `size`, `entries`, `bounds` on an empty
  scene and on a single cell, serialize-then-parse round trip;
- `operations` — applying, inverting, reversibility (apply then roll back → original state),
  `StrokeRecorder` doesn't duplicate recording a cell's previous value on repeated touches,
  returns `null` for an empty stroke, and fully restores the scene on `rollback`;
- `history` — undo, redo, redo cleared after a new operation, the limit is respected;
- `camera` — round trip screen↔cell, cell bounds, negative range, `visibleBounds` at
  zoom = 1 and zoom ≠ 1, zoom clamped to its range, anchor point preserved while zooming;
- `line` — axis-aligned lines, diagonals, arbitrary slopes, coincident points, direction in
  both directions;
- `export/text` — trimming empty edges, filler within bounds, empty scene, a single cell,
  and a **rectangular (non-square) area** — a test that directly pins down defect 1;
- `tools` — a sequence of points yields the expected set of changes; the eraser removes.

**The browser project** (`@vitest/browser` with the Playwright provider) — things that need
an actual browser:

- `glyphAtlas` — rasterization yields a non-empty buffer; the glyph is centered (checked via
  the distribution of opaque pixels); a repeat request doesn't re-rasterize; a request for an
  arbitrary cell size lands on the nearest step; `averageColor` gives a sensible color (red
  for `❤️`);
- `renderScene` — the grid is drawn; a cell with a value differs from an empty one;
  redrawing after erasing leaves no trace; switching level of detail at the cell-size
  threshold;
- `pointer` — a click draws a single cell, dragging draws a connected line with no gaps,
  leaving the canvas bounds doesn't break the stroke, two pointers give pan and zoom instead
  of drawing, a second finger appearing rolls back a stroke already in progress, listeners
  are removed;
- components and hooks — switching tools, undo/redo, copy to clipboard, listeners removed
  on unmount (a test for defect 6);
- `Editor` — a full cycle: drawing, undo, redo, clear, navigation, `destroy` with no leaks.

**Benchmarks** (`vitest bench`, browser project): frame time with a full screen at 1× zoom
and at minimum zoom, time for a full-screen stroke.

`toMatchScreenshot` is available in the browser project, but no baselines are set up in this
iteration: a redesign is coming, and the baselines would go stale on its very first
iteration. The infrastructure stays ready to be turned on.

## Order of work

1. **Toolchain.** Dependency updates, flat config, Tailwind migration, CI update.
   Application code isn't touched, except for edits needed to make it build. Verification:
   build, lint, the app works as before.
2. **Test infrastructure.** Vitest with two projects, one smoke test in each.
3. **Core.** `scene`, `operations`, `history`, `camera`, `line`, `export/text`, test-first.
4. **Rendering.** `theme`, `glyphAtlas`, `renderScene`, levels of detail, with browser tests.
5. **Input and tools.** `pointer` with gestures, `brush`, `eraser`.
6. **Editor and UI.** The facade, porting the React shell, undo/redo and reset-view buttons,
   mobile layout.
7. **Performance.** Benchmarks, measurements on a real mobile device, refining the
   level-of-detail thresholds.
8. **Cleanup.** Removing the old `lib/EmojiCanvas.ts` and orphaned hooks, updating the
   README and CLAUDE.md.

Updating dependencies happens before the refactor deliberately: that way any breakage has
one address. Mixing the two would make the cause of a failure ambiguous.

## Risks

- **TypeScript 7** — the new native compiler. Compatibility with `typescript-eslint` is
  checked at step 1. If it doesn't work, roll back to TypeScript 5.9; the rest of the plan
  is unchanged.
  - *Check result (Task 3, 2026-09-07):* `tsc --noEmit` and `npm run build` on
    TypeScript 7.0.2 passed with no errors, but `npm run lint` failed:
    `@typescript-eslint/parser` 5.61.0 couldn't load the parser
    (`TypeError: Cannot read properties of undefined (reading 'BarBarToken')` in
    `typescript-estree`). Since migrating ESLint is a separate task (Task 4), rolled back
    to `typescript@^5.9.3`, on which `tsc`, `build` and `lint` pass cleanly. The decision on
    TypeScript 7 should be revisited after `typescript-eslint` is updated in Task 4.
  - *Recheck (Task 4, 2026-09-07):* after migrating to ESLint 10 flat config and
    `typescript-eslint@8.69.0`, tried again: `npm install -D typescript@^7.0.0
    --legacy-peer-deps`, then `npm run build` and `npm run lint`. `tsc` (v7.0.2) and
    `vite build` again passed with no errors and no source changes. This time
    `npm run lint` failed not from a parser crash but from an explicit guard in
    `typescript-eslint` itself: `Error: typescript-eslint does not support TS 7.0.` with the
    message "Please see
    https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0
    to run typescript-eslint using the TS 6 API. See also
    https://github.com/typescript-eslint/typescript-eslint/issues/10940 for tracking
    typescript-eslint's support for TS >=7.1". This is a deliberate refusal by the package
    to work with TS 7.0.x (issue #10940 tracks future support for TS ≥7.1), not an
    incidental parser-version incompatibility as in Task 3. Rolled back to
    `typescript@^5.9.3` (`npm install -D typescript@^5.9.0 --legacy-peer-deps`), after which
    `build` and `lint` pass cleanly again. The decision on TypeScript 7 should be revisited
    once again once `typescript-eslint` announces support for TS ≥7.1 (see issue #10940).
- **Tailwind 4** — configuration moved into CSS. The layout is simple and the project's
  utility classes are stable across versions, but the look is checked visually after the
  migration.
- **Vitest browser mode** requires installing Playwright browsers, including in CI, which
  noticeably lengthens the run. If CI time becomes a problem, the browser project runs as a
  separate step from the node project.
- **Glyph metrics** (`actualBoundingBox*`) are supported by modern browsers, but the values
  depend on the system font. A fallback centered on the baseline is built into the design.
- **Frame rate on mobile.** The main risk to the 60fps target is a high `devicePixelRatio`
  combined with a large number of on-screen cells. Safeguards are built in (culling, the
  atlas, levels of detail), but are verified by measurements in step 7. If the thresholds
  turn out not to be enough, the next levers are lowering rendering resolution during a
  gesture with a refinement pass after it ends, and caching rendered tiles.
- **Gesture separation.** Telling the start of drawing apart from the start of a pinch can't
  happen instantly: a second finger comes down with a delay. Hence the requirement for
  `StrokeRecorder` to be able to roll back a stroke already begun; the correctness of this
  behavior is checked by a test.
