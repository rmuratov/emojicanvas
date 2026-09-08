# Foundation work in progress

Cross-session status log. Read together with the spec
`specs/2026-09-07-foundation-design.md` — it remains the authority on design intent.

Updated: 2026-09-08.

## Where we are

All work happens on a single branch, **`foundation`** (44 commits), to be merged into
`main` locally once all three plans are done. Nothing is pushed. `main` sits at
`a11e969` and matches `origin/main` exactly.

| Plan | Status |
|---|---|
| 1. Toolchain and test infrastructure (`plans/2026-09-07-toolchain-and-tests.md`) | **Done**, reviewed |
| 2. Engine core (`plans/2026-09-07-engine-core.md`) | **Done**, reviewed; findings 1 and 2 closed, 1 left open |
| 3. Rendering, input, editor facade, React port (`plans/2026-09-08-rendering-input-editor.md`) | **Plan written**, not started |

## What already works

`npm ci`, `npm run lint` (`--max-warnings 0`), `npm test`, `npm run build` — all green
from a clean state. **105 tests across 10 files.**

The app in the browser is untouched: it still runs the OLD engine
(`src/lib/EmojiCanvas.ts`) and looks and behaves exactly as it did before this work
started. Nothing built in plan 2 is imported by the running app yet — that is plan 3's
job.

Toolchain: React 19.2, Vite 8.2, TypeScript 5.9.3, ESLint 10.10 (flat config),
Tailwind 4.3, Prettier 3.9, Vitest 5 with two projects (`node` for pure logic,
`browser` for real Chromium via Playwright). CI runs lint and tests before any deploy.

The engine core, all pure logic with zero DOM:

| Module | What it does |
|---|---|
| `core/types.ts` | `Cell`, `CellBounds`, `Emoji` |
| `core/scene.ts` | Sparse storage of drawn cells on an unbounded grid; `bounds()`, serialisation with a `version` field, shared `keyOf`/`parseKey` |
| `core/operations.ts` | `Operation`, `applyOperation`, `invertOperation`, `createClearOperation`, `StrokeRecorder` |
| `core/history.ts` | Undo/redo over already-applied operations; one stroke is one step |
| `core/camera.ts` | Screen ↔ cell mapping, zoom with a fixed anchor, `visibleBounds` |
| `core/line.ts` | `cellsBetween`, Bresenham, both endpoints, coordinates floored |
| `core/export/text.ts` | Scene → text, cropped to the drawing, filler inside the box |
| `tools/` | `Tool` interface with `onDown`/`onMove`/`onUp`/`onCancel`; brush and eraser |

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

**A serialised scene with no `version` is version 1.** `fromJSON` rejects a *stated*
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

## Deferred findings from plan 1

None block work. Address before merging `foundation` into `main`.

1. Bundle grew 192.52 kB → 234.83 kB (64.11 → 75.56 gzip) after React 19 and Vite 8.
   No size budget was ever set.
2. `settings.react.version` is hardcoded `'19.2'` in `eslint.config.js` because the
   plugin's auto-detect crashes on ESLint 10. Will go stale silently at the next major.
3. `package-lock.json`'s root `packages[""]` does not echo `overrides`. `npm ci` works.
4. The Tool button's border colour is a literal, not a theme token. Tokens arrive in
   `render/theme.ts` in plan 3.
5. `.px-1` remains in the built CSS, from a commented-out `<dialog>` in `App.tsx`. It
   disappears when plan 3 rewrites that component.
6. Two high-severity ReDoS advisories in transitive **dev** dependencies.
   `npm audit --omit=dev` reports zero, so nothing reaches users.
7. `tsconfig.node.json` includes only `vite.config.ts`; `vitest.config.ts` is
   type-checked by nothing.
8. `.prettierrc` still carries the deprecated `jsxBracketSameLine`.

## Requirements for plan 3

- **Pointer input must floor screen coordinates to whole cells** via `screenToCell`
  before calling tools. `cellsBetween` is protected by its own rounding, but that is a
  safety net, not the intended path.
- **Do not call `scene.bounds()` per frame.** It is an O(n) scan of every drawn cell.
  The renderer needs `visibleBounds` plus `get`, never `bounds()`. In particular,
  `getSnapshot().isEmpty` must be `scene.size === 0`, because `useSyncExternalStore`
  calls `getSnapshot` on every render.
- **Cancelling a stroke takes two calls:** `recorder.rollback(scene)` and then
  `tool.onCancel(ctx)`. The recorder restores the scene; the tool forgets its last
  cell. Neither does the other's job.
- **`Editor` must call `history.clear()`** when loading a scene from a link or file —
  otherwise undo would walk into a scene the operations were never recorded against.
- **The glyph-centring formula is verified** against real Chromium metrics
  (`width` 20.0098, `actualBoundingBoxAscent` 21.5186, `actualBoundingBoxLeft` −0.4395,
  `actualBoundingBoxRight` 19.6436). The metrics are non-zero; the approach works.
- **Brush and eraser share ~20 identical lines.** Leave it until line, rectangle and
  fill land, then factor all of them together.

## How to continue

Findings 1 and 2 are cleared, so the code plan 3 builds on is proven, and plan 3 is
written: `plans/2026-09-08-rendering-input-editor.md`, eight tasks. Execute it one task at
a time with review between tasks.

Its scope is the spec's order of work, steps 4 (rendering), 5 (input — the tools half
landed in plan 2) and 6 (editor and React port), plus removing the old engine. **Step 7 —
benchmarks, real-device measurement and tuning the level-of-detail thresholds — is a
separate plan 4**, together with the space-plus-drag pan gesture the plan defers on
purpose.

Two deliberate deviations from the spec are recorded in the plan's own
"One deliberate deviation from the spec" section: the input layer reports screen pixels
rather than cells (the `Editor` owns the camera, so the `screenToCell` call belongs there),
and `zoomBy` takes two anchor numbers rather than an anchor object.
