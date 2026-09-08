# Foundation work in progress

Cross-session status log. Read together with the spec
`specs/2026-09-07-foundation-design.md` — it remains the authority on design intent.

Updated: 2026-09-08. Plans 1-3 done; plan 4 is the only work left.

## Where we are

All work happens on a single branch, **`foundation`** (63 commits), to be merged into
`main` locally once all four plans are done. Nothing is pushed. `main` sits at
`a11e969` and matches `origin/main` exactly.

| Plan                                                                                          | Status                                                   |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1. Toolchain and test infrastructure (`plans/2026-09-07-toolchain-and-tests.md`)              | **Done**, reviewed                                       |
| 2. Engine core (`plans/2026-09-07-engine-core.md`)                                            | **Done**, reviewed; findings 1 and 2 closed, 1 left open |
| 3. Rendering, input, editor facade, React port (`plans/2026-09-08-rendering-input-editor.md`) | **Done**; all 8 tasks executed                           |
| 4. Performance: benchmarks, real-device measurement, LOD thresholds                           | **Plan not written** — next step                         |

## What already works

`npm ci`, `npm run lint` (`--max-warnings 0`), `npm test`, `npm run build` — all green
from a clean state. **186 tests across 15 files.**

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
  `get`; `getSnapshot().isEmpty` is `scene.size === 0`, because `useSyncExternalStore`
  calls `getSnapshot` on every render. `bounds()` is for text export only.
- **Cancelling a stroke takes both calls** — `recorder.rollback(scene)` then
  `tool.onCancel(ctx)`. Verified by mutation: dropping the rollback fails the pinch test.
- **The glyph-centring formula is verified** against real Chromium metrics, and by
  mutation: reverting to the old baseline-centred `fillText` fails both the centring and
  the cell-bounds tests.
- **`getSnapshot` returns a cached object**, replaced only when state changes. A fresh
  object per call is an infinite render loop.
- **Drawing does not wake React.** `onDrawMove` marks the frame dirty without notifying;
  only state the toolbar shows triggers a notification.

## How to continue

Plans 1 to 3 are done and the app runs on the new engine. What remains before `foundation`
merges into `main`:

**Plan 4 is the only outstanding work.** Every deferred finding from plans 1 and 2 is
closed, and formatting is now enforced by a lefthook pre-commit hook and by CI.

1. **Plan 4 — performance**, the spec's step 7. Write it from the spec's "Performance"
   section: Vitest benchmarks in the browser project for frame time at 1x zoom and at
   minimum zoom and for a full-screen stroke, then measurement on a real mobile device,
   then tune the level-of-detail thresholds. **The 12px and 4px thresholds are still their
   starting values — nothing has measured them.** A benchmark regression is a reason to
   investigate, not to raise the threshold.
2. ~~Clear plan 1's deferred findings.~~ **All closed**, including the Tool border
   colour, which is closed by decision: the buttons are being redesigned and a token
   source for the React shell belongs to that redesign.
3. ~~Finding 3 from plan 2 — the reverse-direction line test.~~ **Closed** (`a561e65`).
   Brute force over every integer pair in [-5,5]² confirmed the finding exactly: 31.5% of
   pairs violate the symmetry, and the named counterexample `(-5,-5)→(-4,-3)` is real —
   forward goes through `(-5,-4)`, backward through `(-4,-4)`. The test now asserts what
   _does_ hold universally (endpoints, length, connectivity, all verified by brute force
   over the same range) and pins the asymmetry with that counterexample so nobody
   "fixes" it by accident.

## Starting the next session

Read this file and the spec, then write plan 4 from the spec's "Performance" section with
the `superpowers:writing-plans` skill. Two things that will not be obvious from the code:

- **No threshold in `render/theme.ts` has ever been measured.** `colorLodThresholdPx` (12)
  and `blockLodThresholdPx` (4) are the spec's starting guesses. Plan 4 exists to replace
  them with numbers from real hardware.
- **Benchmarks belong to the `browser` project.** `vitest.config.ts` routes
  `src/{core,tools}/**/*.test.ts` to `node` and everything else to `browser`; a path
  matching both runs twice.

The invariants listed above are the things easiest to break while chasing frame time.
`getSnapshot` returning a cached object and `isEmpty` reading `scene.size` are the two
that will look like harmless micro-optimisations and are not.
