# AGENTS.md

This file provides guidance for coding agents working in this repository.

## Commands

```shell
npm ci
npm run dev      # vite --host; app is at http://localhost:5173/emojicanvas/ (note the base path)
npm run build    # typechecks src AND the config files, then vite build
npm run lint     # eslint src --max-warnings 0
npm run lint:fix # eslint src --fix
npm run format       # prettier --write .
npm run format:check # prettier --check . (what CI runs)
npm test         # vitest run: a `node` project (pure logic in src/core, src/tools) and a `browser` project (Playwright + Chromium)
npm run test:coverage # both test projects with the same coverage thresholds as CI
npm run bench    # vitest bench --reporter=verbose: `*.bench.ts` in the browser project, never part of `npm test` or CI
npm run preview  # serve the production build
```

`npm run dev` also serves a dev-only measurement page at
`http://localhost:5173/emojicanvas/bench.html` (and at the printed network address, for a
real phone) that runs the same scenarios as the benchmarks in whatever browser opens it.
It is not listed in `build.rollupOptions.input`, so it never reaches `dist/`.
The benchmark scenarios read back a pixel with `getImageData` so the timings include
canvas rasterization. CI exercises the renderer's draw-call budget separately in
`src/render/drawBudget.test.ts`.

Run `npm test`, `npm run lint` and `npm run build` before claiming a change works.

Pushes to `main` auto-deploy `dist/` to GitHub Pages (`.github/workflows/vite.yaml`), so `base: '/emojicanvas/'` in `vite.config.ts` must stay.

## Architecture

React 19 + Vite + TypeScript + Tailwind. The drawing engine is deliberately **not** React.

The engine is layered, and dependencies point strictly inward:
`ui` → `editor` → `render`/`input`/`tools` → `core`. `core` imports nothing from the other
layers and never touches the DOM, which is why it is tested in Vitest's `node` project
while everything else runs in real Chromium.

- `src/core/` — pure data and logic. `scene.ts` is sparse storage of drawn cells on an
  **unbounded** grid: a key present means the cell is drawn, absent means empty, and
  coordinates may be any integers including negative ones. There is no canvas size and no
  fixed cell count. `operations.ts` is the single mutation path, each operation able to
  build its inverse; `history.ts` stacks those for undo/redo; `camera.ts` maps screen
  pixels to cells and back; `line.ts` interpolates between two cells; `export/text.ts`
  turns a scene into a string.
- `src/render/` — knows about canvas, not about React. `glyphAtlas.ts` rasterises each
  emoji once per fixed size step and hands out the buffer, so drawing is `drawImage`
  rather than `fillText`. `scene.ts` draws one frame into a **supplied** context, so raster
  export later is a call with a different context, not a second rendering path.
  `theme.ts` holds colours, base cell size, font stack and the level-of-detail thresholds.
- `src/input/pointer.ts` — Pointer Events for mouse, finger and stylus in one path.
  Reports **screen pixels**, never cells: the camera lives in the `Editor`, so the `Editor`
  does the conversion.
- `src/tools/` — a `Tool` handles pointer gestures and reports cells for the hover preview.
  Tools write through a `StrokeRecorder` and never touch history.
- `src/editor/Editor.ts` — the facade that assembles the layers and owns their lifecycle:
  the canvas element, the `ResizeObserver`, the `requestAnimationFrame` loop, the camera
  and the tools. `destroy()` undoes everything the constructor set up.
- `src/hooks/useEditor.ts` creates one `Editor` per mount; `useEditorState.ts` reads its
  state through `useSyncExternalStore`. React holds no copy of engine state.
- `src/components/EmojiPicker` wraps the `emoji-picker-element` web component;
  `useEmojiPicker` attaches and removes its `emoji-click` listener. The tag is typed in
  `src/types/emoji-picker.d.ts`.

Components live in `src/components/<Name>/<Name>.tsx` with an `index.ts` barrel. The hooks,
renderer, pointer input, and editor also expose barrel exports.
Imports use relative paths (no path aliases).

### Three ideas that drive the code

**Every write to the scene goes through an operation.** That is what makes undo total.
There is deliberately no `Scene.clear()` — clearing is `createClearOperation`, so it is
undoable like anything else. Only `operations.ts` and `StrokeRecorder` call
`scene.writeCell`. When adding file or link import, clear the undo and redo history upon
replacing the scene so old operations cannot affect the imported drawing.

**The filler is an export-only concept.** Empty cells hold nothing; the scene simply has no
key for them. `〰️` (`DEFAULT_FILLER` in `core/export/text.ts`) is written into the _text_
for empty cells inside the drawing's bounding box, because messaging apps trim real spaces
and that destroys the art on paste. Consequently **the eraser is a real tool that deletes
cells**, not "a brush painting the filler", and there is no erasing mode anywhere in the
model.

**Frame cost follows the smaller of the window and the drawing.** The canvas matches the
viewport size, so drawing bounds can grow beyond the canvas buffer. Only cells inside
`camera.visibleBounds` are drawn, and the renderer walks whichever side is smaller: the
viewport when the drawing is bigger than it, the scene's own cells when it is not. Scanning
the viewport costs a lookup — and the string key it builds — per visible cell, which at
minimum zoom was 1.15 million of them for a drawing of ten, and 5ms a frame of nothing.
The level-of-detail thresholds in `render/theme.ts` are measured, not guessed; the numbers
and the hardware are recorded beside them, and `src/render/lod.bench.ts` is what produced
them. The block level of detail reaches the canvas as **one** scaled `drawImage` of a
one-pixel-per-block buffer, not as a fill per block: filling thirty thousand blocks
separately cost half the frame, most of it building an `rgb(...)` string per block.

`scene.bounds()` scans all drawn cells. Fit-to-view, text export, and flood fill use it.
`getSnapshot` uses `scene.size === 0` so React can check whether the drawing is empty in
constant time.

Glyphs are centred on their own measured bounding box, so emoji with a variation selector
(`❤️` = U+2764 U+FE0F) and native ones (`😀` = U+1F600) line up. The old hard-coded
per-glyph pixel nudges are gone.

## Conventions

- Write code, comments, tests, documentation, and commit messages in English.
- Prettier: no semicolons, single quotes, trailing commas, `arrowParens: 'avoid'`, 80 cols.
- **Formatting is enforced twice: on commit and in CI.** `lefthook.yml` runs
  `eslint --fix` then `prettier --write` over staged files and re-stages what they
  repair; an error neither can fix rejects the commit. CI then runs `npm run format:check`
  and `npm run lint` before the browser tests. The `prepare` script treats hook installation
  as optional so that `npm ci` also works outside a Git checkout.
- `npm run lint` does _not_ run Prettier — `eslint-config-prettier` only disables the
  ESLint rules that would conflict with it. `npm run format:check` is the command for
  that, and `npm run format` / `npm run lint:fix` fix things from the console.
- `eslint-plugin-perfectionist` (`recommended-natural`) is on: object keys, JSX props, interface members, imports and exports must be sorted naturally. `perfectionist/sort-classes` is disabled, so class members are free-form. Lint runs with `--max-warnings 0`, so a stray unsorted prop fails the build.
- The `eslint-plugin-react` override in `package.json` resolves its ESLint peer range with
  the installed ESLint version.
- The interface styles and Tailwind configuration live in `src/index.css`.
- See the roadmap in the README.
