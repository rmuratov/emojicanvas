# Foundation work in progress

Cross-session status log. Read together with the spec
`specs/2026-09-07-foundation-design.md` — it remains the authority on design intent.

Updated: 2026-09-07.

## Where we are

All work happens on a single branch, **`foundation`** (44 commits), to be merged into
`main` locally once all three plans are done. Nothing is pushed. `main` sits at
`a11e969` and matches `origin/main` exactly.

| Plan | Status |
|---|---|
| 1. Toolchain and test infrastructure (`plans/2026-09-07-toolchain-and-tests.md`) | **Done**, reviewed |
| 2. Engine core (`plans/2026-09-07-engine-core.md`) | **Done**, reviewed, 3 findings left open on purpose |
| 3. Rendering, input, editor facade, React port | **Plan not written** — next step |

## What already works

`npm ci`, `npm run lint` (`--max-warnings 0`), `npm test`, `npm run build` — all green
from a clean state. **102 tests across 10 files.**

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

**The eraser is a real tool, not "a brush painting filler".** It writes `undefined`,
which deletes the cell. The filler exists only in the text export, so there is no
"erasing mode" anywhere in the model.

## Open findings from plan 2's final review

These are deliberately left open. The first two are worth fixing before plan 3 builds
on them.

1. **`onCancel` is untested in effect.** Verified by mutation: making both `onCancel`
   bodies no-ops leaves all 16 relevant tests green. Every test calls `onDown` again
   before the next `onMove`, and `onDown` overwrites the stale state independently. The
   missing case is the one that matters — `onMove` directly after `onCancel`, with no
   `onDown` between, which is exactly what the input layer will do when a pinch ends.
   The production code is correct; only its proof is missing.
2. **`fromJSON` treats a missing `version` like a corrupt payload.** Both return an
   empty scene. Since the cell shape never changed and only the envelope gained a
   field, an absent version could safely be read as version 1. Nothing has been
   persisted yet, so this is not a live bug — but decide it before link-sharing ships,
   because it contradicts the resilience the same docstring promises.
3. **The reverse-direction line test proves less than its name claims.** Brute force
   over all integer pairs in [-5,5]² shows 31% of pairs violate
   `cellsBetween(b,a) === reverse(cellsBetween(a,b))` — for example
   `(-5,-5)→(-4,-3)`. The chosen endpoints happen to satisfy it, so the test is stable,
   but it asserts a property this implementation does not universally have.

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

Write plan 3 from the spec's "Rendering", "Input and tools", "editor/Editor.ts",
"React shell", "Mobile devices" and "Performance" sections, then execute it one task at
a time with review between tasks. Consider clearing open findings 1 and 2 above first —
both are small, and plan 3 builds directly on that code.
