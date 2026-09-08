# Foundation work in progress

Cross-session status log. Read together with the spec
`specs/2026-09-07-foundation-design.md` — it remains the authority on design intent.

Updated: 2026-09-08. All four plans are done. What is left is a measurement on a real
phone and the merge into `main`.

## Where we are

All work happens on a single branch, **`foundation`** (73 commits), to be merged into
`main` locally. Nothing is pushed. `main` sits at `a11e969` and matches `origin/main`
exactly. Verified from a clean `npm ci` on 2026-09-08: `npm run lint`,
`npm run format:check`, `npm test` (194 tests, 16 files) and `npm run build` all pass.

| Plan                                                                                          | Status                                                   |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1. Toolchain and test infrastructure (`plans/2026-09-07-toolchain-and-tests.md`)              | **Done**, reviewed                                       |
| 2. Engine core (`plans/2026-09-07-engine-core.md`)                                            | **Done**, reviewed; findings 1 and 2 closed, 1 left open |
| 3. Rendering, input, editor facade, React port (`plans/2026-09-08-rendering-input-editor.md`) | **Done**; all 8 tasks executed                           |
| 4. Performance (`plans/2026-09-08-performance.md`)                                            | **Done**, except the measurement on a real phone         |

## What already works

`npm ci`, `npm run lint` (`--max-warnings 0`), `npm test`, `npm run build` — all green
from a clean state. **194 tests across 16 files.** `npm run bench` runs the benchmarks,
which are not part of `npm test` and not part of CI.

**The app now runs on the new engine.** `src/lib/EmojiCanvas.ts` and `useEmojiCanvas` are
deleted; there is one engine, not two. Verified by hand in a browser as well as by tests:
a single tap draws, fast drags leave no gaps, grid lines survive being drawn over, the
colour and block levels of detail engage at their thresholds, zoom clamps at both ends,
reset view restores, the picker changes the brush, and `❤️` and `😀` sit at the same
height. No console errors.

Toolchain: React 19.2, Vite 8.2, TypeScript 5.9.3, ESLint 10.10 (flat config),
Tailwind 4.3, Prettier 3.9, Vitest 5 with two projects (`node` for pure logic,
`browser` for real Chromium via Playwright). CI runs lint and tests before any deploy.

The engine core, all pure logic with zero DOM:

| Module                | What it does                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `core/types.ts`       | `Cell`, `CellBounds`, `Emoji`                                                                                                   |
| `core/scene.ts`       | Sparse storage of drawn cells on an unbounded grid; `bounds()`, serialisation with a `version` field, shared `keyOf`/`parseKey` |
| `core/operations.ts`  | `Operation`, `applyOperation`, `invertOperation`, `createClearOperation`, `StrokeRecorder`                                      |
| `core/history.ts`     | Undo/redo over already-applied operations; one stroke is one step                                                               |
| `core/camera.ts`      | Screen ↔ cell mapping, zoom with a fixed anchor, `visibleBounds`                                                                |
| `core/line.ts`        | `cellsBetween`, Bresenham, both endpoints, coordinates floored                                                                  |
| `core/export/text.ts` | Scene → text, cropped to the drawing, filler inside the box                                                                     |
| `tools/`              | `Tool` interface with `onDown`/`onMove`/`onUp`/`onCancel`; brush and eraser                                                     |

Plan 3 added the layers above it:

| Module                                          | What it does                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `render/theme.ts`                               | Colours, base cell size, font stack, level-of-detail thresholds, `levelOfDetail`                             |
| `render/glyphAtlas.ts`                          | Rasterises each emoji once per fixed step (16/32/64/128); centres on measured metrics; caches average colour |
| `render/scene.ts`                               | `renderScene` — one frame into a supplied context, confined to `visibleBounds`                               |
| `input/pointer.ts`                              | Pointer Events; one pointer draws, two navigate; wheel and middle-button drag                                |
| `editor/Editor.ts`                              | The facade: canvas, camera, rAF loop, tools, `useSyncExternalStore` contract                                 |
| `hooks/useEditor.ts`, `hooks/useEditorState.ts` | React bridge, StrictMode-safe                                                                                |

## What plan 4 found and changed

Benchmarks live in the `browser` project as `*.bench.ts` and run only under `npm run bench`.
`src/bench/scenarios.ts` holds the fixtures, and the same module drives the dev-only page at
`/emojicanvas/bench.html`, so the laptop and the phone measure exactly the same thing.

**Two thresholds, both measured, both moved.** `colorLodThresholdPx` 12 → **16** and
`blockLodThresholdPx` 4 → **6**. The worst case — a 1440x800 viewport at device pixel
ratio 2 with every visible cell drawn — has glyphs at 5.4ms for 16px cells, 16.0ms for
14px and 18.4ms for 12px; colour fills at 7.2ms for 8px, 12.4ms for 6px, 17.0ms for 5px
and 27.1ms for 4px. Both old values were below the budget line, not above it. The numbers
and the hardware are recorded in `render/theme.ts` beside the values.

**A desktop window is the binding case, not a phone.** At the same cell size a 1440x800
window holds 3.7 times as many cells as a 390x800 screen, and every scenario that fits the
budget on the desktop fits it comfortably on the phone at DPR 3.

**16px is cheap because it is an atlas step.** At exactly one buffer pixel per screen
pixel the browser copies instead of resampling: 4,500 glyphs at 16px cost 5.4ms while
2,880 at 20px cost 14.5ms. Worth remembering before adding atlas steps or changing
`baseCellSize`.

**Safari found the one case still over budget, and it is fixed.** A run of the page in
desktop Safari 26 (1470x833, DPR 2) reported 20ms for a full screen at minimum zoom with
136,220 cells drawn — everything else passed, and the ordinary case, a 500-cell drawing at
the same zoom, took 2ms. Investigating rather than moving the threshold: the frame split
into roughly 7ms of scanning the viewport and 8ms of filling thirty-odd thousand blocks
one `fillRect` at a time, most of the latter spent building and parsing an `rgb(...)`
string per block. The block level now writes one pixel per block into a buffer and puts it
on screen with a single scaled `drawImage`, nearest-neighbour, limited to the part of the
grid anything was drawn into. In headless Chromium the same frame went 15.9ms → 8.6ms, and
block count stopped mattering: ten times wider blocks now measure the same. An almost empty
screen at minimum zoom stays at 0.09ms.

**The blit costs what it covers, not what is drawn into it**, and that is the one shape it
made slower. Measured against the old renderer on identical fixtures: one cell 0.08 → 0.10ms,
five hundred cells in one patch 0.13 → 0.11ms, five hundred cells scattered evenly over the
whole zoomed-out screen 0.22 → 0.62ms, a full screen 15.7 → 8.6ms. Only the scattered shape
regressed, because the rectangle of filled blocks is then the whole screen and a
screen-sized blit pays for five hundred pixels. It is 4% of the frame budget, against half
the budget saved in the case that was actually failing, so the trade stands; a hybrid that
fills blocks individually below some count would remove it at the cost of a second drawing
mechanism. Both shapes are benchmarked in `lod.bench.ts` so the trade stays visible.

**Re-measured in the same Safari afterwards: that frame went 20ms → 9ms and every scenario
now passes** — 5ms for a full screen at 1x zoom, 9ms at minimum zoom with 136,220 cells,
1ms for the ordinary 500-cell drawing, 9ms for a stroke of 49 steps against a budget of
818ms. Two engines now agree, WebKit and Blink; only a phone is still unmeasured.

**What is left of that worst case is the scan**, about 7ms of the 8.6ms, and it is the cost
of building a string key per visible cell in `Scene.get`. Removing it means keying cells by
number instead of by string, which is a change to `core/scene.ts` and its serialisation and
would put a range limit on coordinates that the unbounded grid does not have today. Not
done, and not obviously worth it: it only shows up when a drawing covers the whole screen
at minimum zoom, which is 136,220 drawn cells.

**The renderer now walks whichever side is smaller.** Scanning the viewport costs a cell
lookup, and the string key it builds, for every visible cell whether or not anything is
drawn there. At minimum zoom that was 1.15 million lookups a frame: an empty screen cost
5.0ms and a 500-cell drawing 6.3ms. Walking the scene's own cells instead costs 0.09ms and
0.22ms. A drawing bigger than the viewport still takes the scan, which is then the cheaper
of the two — measured at 15.3ms either way for a screen with 128,160 cells drawn, since
reduced to 8.6ms by the block blit above.

**Two traps for whoever measures next.**

- **Vitest 5 has no top-level `bench` export.** A benchmark is registered through the
  `bench` fixture of an ordinary test and run with `bench.compare(...)`; importing `bench`
  from `vitest` fails outright. The default reporter also prints no table, which is why the
  script passes `--reporter=verbose`.
- **A canvas nobody reads back is not rasterised.** Canvas 2D calls only queue work, so a
  timed frame measures how fast the commands were recorded. Every scenario ends in a
  one-pixel `getImageData` to force the rasteriser to catch up. Before that flush the
  numbers were both flattering and unusable — relative margins of error of 13% to 70%
  against 0.2% to 1.8% after it — and the first set of thresholds derived from them had to
  be re-derived.

**What CI gained.** `src/render/drawBudget.test.ts` counts drawing calls and cell lookups
per frame instead of timing them, so it cannot flake on a loaded machine: one glyph per
visible cell at the glyph level, no glyphs below the colour threshold, block fills bounded
by the block threshold rather than by the cell count, and lookups bounded by what is drawn.
`render/scene.test.ts` pins that both walks draw the same picture byte for byte.

## Settled decisions

**TypeScript stays on 5.9.3.** Compiler 7.0 builds the project cleanly with no code
changes; `typescript-eslint` 8.69 rejects TS 7.0 by an explicit guard, with support
promised from 7.1. Tried twice. Revisit when that ships.

**The `eslint-plugin-react` / ESLint 10 peer conflict** is solved by a narrow
`overrides` entry in `package.json`, not by `legacy-peer-deps`. Do not replace it with
an `.npmrc`.

**Everything in the repository is English**, including the documents under `docs/`.
The spec and plans were originally Russian, and that is exactly how Russian test names
once reached the source — an implementer copied them out of a plan.

**Every write to the scene goes through an operation.** `Scene.clear()` was removed
for this reason: it was a second, non-undoable path, and `Editor.clear()` would have
made clearing the one action undo could not reverse. Clearing is now
`createClearOperation`.

**The input layer reports screen pixels, not cells.** The spec sketched
`onDrawStart(cell: Cell)`, but converting needs the camera and the camera lives in the
`Editor` — giving `pointer.ts` one would make `input/` depend on `core/camera` and
`render/theme`. The single `screenToCell` call sits in the `Editor` instead. For the same
reason `zoomBy` takes two anchor numbers rather than an anchor object, matching
`camera.zoomAt` and avoiding an allocation per wheel notch.

**A serialised scene with no `version` is version 1.** `fromJSON` rejects a _stated_
version it does not understand — a future format may not be readable at all — but an
absent one is read as version 1, because the cell shape has never changed and only the
envelope gained the field. Rejecting it would have discarded a drawing this build
understands perfectly well, contradicting the resilience the same docstring promises.

**The eraser is a real tool, not "a brush painting filler".** It writes `undefined`,
which deletes the cell. The filler exists only in the text export, so there is no
"erasing mode" anywhere in the model.

## Open findings from plan 2's final review

Findings 1 and 2 are now closed (commits `65a2fcc`, `0523400`). Finding 3 remains open
on purpose.

1. ~~`onCancel` is untested in effect.~~ **Closed.** Each tool gained a test that calls
   `onMove` directly after `onCancel` with no `onDown` between — the case the input
   layer will hit when a pinch ends. Re-verified by mutation: with both `onCancel`
   bodies emptied, only these two tests fail and the other 13 stay green, so they do
   prove what the old ones did not.
2. ~~`fromJSON` treats a missing `version` like a corrupt payload.~~ **Closed** — see
   the settled decision above. An absent version now reads as version 1; a stated
   version this build does not understand is still rejected.
3. **The reverse-direction line test proves less than its name claims.** Brute force
   over all integer pairs in [-5,5]² shows 31% of pairs violate
   `cellsBetween(b,a) === reverse(cellsBetween(a,b))` — for example
   `(-5,-5)→(-4,-3)`. The chosen endpoints happen to satisfy it, so the test is stable,
   but it asserts a property this implementation does not universally have. Not a
   blocker for plan 3: nothing depends on the symmetry, only the test's name overclaims.

## Deferred findings from plan 1 — cleared

All but one are closed (commit `a561e65`). **Bundle size was dropped from this list by
decision: no budget is being set until the feature work is done.**

1. ~~`.prettierrc` carries the deprecated `jsxBracketSameLine`.~~ **Closed.** Removed; it
   was renamed to `bracketSameLine` and held the default value, so formatting is
   unchanged.
2. ~~`vitest.config.ts` is type-checked by nothing.~~ **Closed, and it was worse than
   recorded.** Adding it to `tsconfig.node.json`'s `include` is _not_ enough: plain `tsc`
   does not check referenced projects, so a deliberate type error still passed. The
   `references`/`composite` pair existed only for a link `tsc` never honoured; both are
   gone, and `npm run build` now runs `tsc -p tsconfig.node.json` explicitly. Verified by
   mutation: a type error in `vitest.config.ts` fails the build.
3. ~~`settings.react.version` is hardcoded `'19.2'`.~~ **Closed.** `eslint.config.js` now
   reads the version from the installed `react/package.json` via `createRequire`, so it
   cannot go stale. `version: 'detect'` was retried and **still crashes** under ESLint 10,
   so that settled decision stands.
4. ~~Two high-severity ReDoS advisories in dev dependencies.~~ **Closed.** A fix existed
   this time; `npm audit fix` took it. Zero vulnerabilities including dev.
5. ~~`package-lock.json`'s root `packages[""]` does not echo `overrides`.~~ **Closed as
   not-a-defect.** npm 11 does not echo root `overrides` there _at all_ — a freshly
   generated lockfile does not either, so the expectation was wrong. The lockfile was
   regenerated to `lockfileVersion` 3 anyway (zero version bumps, no removals), and `npm
ci` from a clean tree passes with the override doing its job: `eslint-plugin-react`
   declares a peer of at most `^9.7` while ESLint 10.10.0 is installed.
6. ~~`.px-1` in the built CSS.~~ **Closed** by plan 3 deleting the commented-out
   `<dialog>`.
7. ~~The Tool button's border colour is a literal, not a theme token.~~ **Closed by
   decision:** the buttons are being redesigned later, and a token source for the React
   shell belongs to that redesign. `render/theme.ts` holds canvas colours for the 2D
   context; pulling a Tailwind class into a JS token would be worse than the literal.

## Found while clearing, and fixed

**Prettier was not enforced anywhere.** `npm run lint` does not run it —
`eslint-config-prettier` only _disables_ conflicting ESLint rules — so nothing checked
formatting, and seventeen files disagreed with `.prettierrc` while CLAUDE.md presented the
conventions as binding.

Fixed with **lefthook** (`lefthook.yml`): a pre-commit hook runs `eslint --fix` then
`prettier --write` over staged files and re-stages what they repair; what they cannot
repair ESLint reports and the commit fails. Jobs run in order, never in parallel — both
write the same files, and ESLint's import sorting should settle before Prettier lays the
result out. A `prepare` script installs the hooks on `npm install`, so a fresh clone needs
no setup step.

Verified live rather than merely installed: a deliberately messy staged file was
reformatted _and_ had its object keys sorted before landing in the commit, and a file
carrying an unfixable `no-unused-vars` error had its commit rejected.

The whole tree was formatted once so the rule starts from a clean state.

**The bypass hole is closed too.** CI now runs `npm run format:check` and `npm run lint`
before the Playwright download — the cheapest checks, and the ones most likely to fail —
so `git commit --no-verify` no longer gets unformatted code to `main`. Verified by exit
code, not output: `format:check` returns 1 on an unformatted file and 0 on a clean tree.
The hook is now a convenience and CI is the gate, which is why `prepare` ends in
`|| true`: `lefthook install` exits 128 outside a git repository, and hook installation
must not be able to break `npm ci`.

`npm run lint` still does not run Prettier; `npm run format:check` is the command for
that, alongside `npm run format` and `npm run lint:fix` for fixing from the console.

## Deferred out of plan 3

Nothing here blocks plan 4.

1. **Space-plus-drag panning.** The spec lists it; plan 3 shipped wheel-pan and
   middle-button-drag instead. A `window`-level key listener owned by a canvas module
   needs its own lifecycle design.
2. **`toMatchScreenshot` baselines.** Deferred on purpose: a redesign is coming and the
   baselines would go stale on its first iteration.
3. **Factoring brush and eraser together.** They share about twenty identical lines. Wait
   for line, rectangle and fill, then factor all of them at once.
4. **Loading a scene from a link or file.** When it lands, `Editor` must call
   `history.clear()` — undo would otherwise walk into a scene the operations were never
   recorded against. Nothing loads a scene today, so `Editor` has no load path at all.
5. **Mobile layout was checked only on a desktop viewport.** The toolbar-versus-picker
   overlap and the 44px tap targets still want a real device.

## Invariants the code now holds

Each of these was a requirement written before plan 3 and is now satisfied in code. They
are recorded because breaking one is easy and the breakage is quiet.

- **Pointer coordinates are floored to whole cells** via `screenToCell`, in the `Editor`
  and nowhere else. `cellsBetween` rounds too, but that is a safety net, not the path.
- **`scene.bounds()` is never called per frame.** The renderer uses `visibleBounds` plus
  `get`, or the scene's own entries; `getSnapshot().isEmpty` is `scene.size === 0`, because
  `useSyncExternalStore` calls `getSnapshot` on every render. `bounds()` is for text export
  only.
- **A frame costs the smaller of the viewport and the drawing.** `renderScene` compares
  `scene.size` with the number of visible cells and walks the smaller side. Pinned by
  `drawBudget.test.ts`, which counts lookups, and by the two equivalence tests in
  `scene.test.ts`, which require both walks to produce the same picture byte for byte.
- **The sparse block path's scratch buffers are module-level and reused.** They are
  emptied at the start of every frame that uses them; allocating them per frame would put
  an allocation back into the draw loop.
- **Cancelling a stroke takes both calls** — `recorder.rollback(scene)` then
  `tool.onCancel(ctx)`. Verified by mutation: dropping the rollback fails the pinch test.
- **The glyph-centring formula is verified** against real Chromium metrics, and by
  mutation: reverting to the old baseline-centred `fillText` fails both the centring and
  the cell-bounds tests.
- **`getSnapshot` returns a cached object**, replaced only when state changes. A fresh
  object per call is an infinite render loop.
- **Drawing does not wake React.** `onDrawMove` marks the frame dirty without notifying;
  only state the toolbar shows triggers a notification.

## Open findings from plan 4

Both are recorded rather than fixed, and neither blocks the merge.

1. **The worst frame is now mostly the scan, and the scan is string keys.** A full screen
   at minimum zoom with 128,160 cells drawn costs 8.6ms, of which about 7ms is
   `Scene.get` building a string key for every visible cell — measured by comparing the
   whole frame against a scene whose cells are all off-screen (`blockCost.bench.ts`).
   Removing it means keying cells by number in `core/scene.ts` and in the serialisation,
   which puts a range limit on coordinates that the unbounded grid does not have today.
   Worth doing only if this case ever matters: it needs a drawing that covers the entire
   screen at minimum zoom.
2. **The scattered-sparse block frame is 0.39ms slower than it was.** The blit costs what
   it covers, so five hundred cells spread over a whole zoomed-out screen pay for a
   screen-sized blit. A hybrid — fill blocks individually below some count, blit above it
   — would remove it, at the cost of a second drawing mechanism inside one level of
   detail. Deliberately not taken: 4% of the frame budget against half the budget saved
   in the case that was failing. Both shapes are benchmarked, so the trade cannot change
   quietly.

## How to continue

All four plans are done and the app runs on the new engine. What remains:

1. **Measure on a real phone.** `npm run dev`, then open the printed network address with
   `/bench.html` on the device (the base path applies:
   `http://<lan-ip>:5173/emojicanvas/bench.html`) and press Measure. The page prints each
   scenario against its budget with PASS or OVER BUDGET, plus the viewport and the device
   pixel ratio. Everything so far was measured on a MacBook — headless Chromium, and
   desktop Safari 26 at 1470x833 and DPR 2, where all four scenarios pass with the worst
   at 9ms of 16.7ms. A phone is slower per core and usually runs at DPR 3, so that is the
   measurement that can still move a threshold. If a scenario comes
   back over budget, investigate it — do not raise the threshold to make it fit. Do this
   in the same session as item 5 of "Deferred out of plan 3", the mobile layout check:
   both need the same device in hand.
2. **Merge `foundation` into `main`.** Nothing is pushed and `main` still sits at
   `a11e969`.

Also still open, and unchanged by plan 4: the five items under "Deferred out of plan 3"
and the two findings above. Every finding from plans 1 and 2 is closed.

## Starting the next session

Read this file and the spec. Three things that will not be obvious from the code:

- **The thresholds are measured now.** `colorLodThresholdPx` is 16 and
  `blockLodThresholdPx` is 6, and `render/theme.ts` records the frame times and the
  hardware behind both. Changing either without a measurement undoes plan 4.
- **Benchmarks belong to the `browser` project** and run only under `npm run bench`.
  `vitest.config.ts` routes `src/{core,tools}/**/*.test.ts` to `node` and everything else
  to `browser`, and gives each project its own `benchmark.include` — without that, the
  default benchmark glob matches in both and every `.bench.ts` runs twice, once in `node`
  where there is no document.
- **Timing a canvas requires reading a pixel back.** See the two traps recorded under
  "What plan 4 found and changed"; both cost a re-measurement to discover.

The invariants listed above are the things easiest to break while chasing frame time.
`getSnapshot` returning a cached object and `isEmpty` reading `scene.size` are the two
that will look like harmless micro-optimisations and are not.
