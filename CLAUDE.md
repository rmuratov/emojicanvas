# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ongoing work

A multi-plan rework of the drawing engine is in progress on the `foundation` branch.
Before starting anything, read `docs/superpowers/PROGRESS.md` — it records what is done,
which decisions are settled and must not be relitigated, and what comes next. The design
authority is `docs/superpowers/specs/2026-09-07-foundation-design.md`.

## Commands

```shell
npm ci
npm run dev      # vite --host; app is at http://localhost:5173/emojicanvas/ (note the base path)
npm run build    # tsc (typecheck, noEmit) && vite build
npm run lint     # eslint src --max-warnings 0
npm test         # vitest run: a `node` project (pure logic in src/core, src/tools) and a `browser` project (Playwright + Chromium)
npm run preview  # serve the production build
```

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
- `src/tools/` — a `Tool` is `onDown`/`onMove`/`onUp`/`onCancel`. Tools write through a
  `StrokeRecorder` and never touch history.
- `src/editor/Editor.ts` — the facade that assembles the layers and owns their lifecycle:
  the canvas element, the `ResizeObserver`, the `requestAnimationFrame` loop, the camera
  and the tools. `destroy()` undoes everything the constructor set up.
- `src/hooks/useEditor.ts` creates one `Editor` per mount; `useEditorState.ts` reads its
  state through `useSyncExternalStore`. React holds no copy of engine state.
- `src/components/EmojiPicker` wraps the `emoji-picker-element` web component;
  `useEmojiPicker` attaches and removes its `emoji-click` listener. The tag is typed in
  `src/types/emoji-picker.d.ts`.

Components live in `src/components/<Name>/<Name>.tsx` with an `index.ts` barrel; `src/hooks`,
`src/core`, `src/render`, `src/input` and `src/editor` re-export through barrels too.
Imports use relative paths (no path aliases).

### Three ideas that drive the code

**Every write to the scene goes through an operation.** That is what makes undo total.
There is deliberately no `Scene.clear()` — clearing is `createClearOperation`, so it is
undoable like anything else. Only `operations.ts` and `StrokeRecorder` call
`scene.writeCell`.

**The filler is an export-only concept.** Empty cells hold nothing; the scene simply has no
key for them. `〰️` (`DEFAULT_FILLER` in `core/export/text.ts`) is written into the *text*
for empty cells inside the drawing's bounding box, because messaging apps trim real spaces
and that destroys the art on paste. Consequently **the eraser is a real tool that deletes
cells**, not "a brush painting the filler", and there is no erasing mode anywhere in the
model.

**Frame cost follows window size, not drawing size.** The canvas is created at the size of
its container, which removes the browser's canvas-area limit and means a scene with a
million cells renders in the same time as one with a hundred. Only cells inside
`camera.visibleBounds` are drawn. `scene.bounds()` is an O(n) scan of every drawn cell —
it is for text export, never for a frame, and never for `getSnapshot`, which uses
`scene.size === 0` because `useSyncExternalStore` calls it on every render.

Glyphs are centred on their own measured bounding box, so emoji with a variation selector
(`❤️` = U+2764 U+FE0F) and native ones (`😀` = U+1F600) line up. The old hard-coded
per-glyph pixel nudges are gone.

## Conventions

- **Everything inside the repo is written in English** — code, identifiers, comments, test names, commit messages, and the documents under `docs/`. No exceptions: the spec and the plans were once written in Russian, test names were copied out of a plan into the repo verbatim, and the fix was to translate the documents rather than to keep translating on the fly.
- Prettier: no semicolons, single quotes, trailing commas, `arrowParens: 'avoid'`, 80 cols.
- `eslint-plugin-perfectionist` (`recommended-natural`) is on: object keys, JSX props, interface members, imports and exports must be sorted naturally. `perfectionist/sort-classes` is disabled, so class members are free-form. Lint runs with `--max-warnings 0`, so a stray unsorted prop fails the build.
- Styling is Tailwind utility classes inline; `src/index.css` is a Tailwind import with `@source not` directives excluding prose files to prevent dead utility classes (Tailwind 4 — configuration lives in CSS, not `tailwind.config.js`).
- The README's TODO list is the roadmap (fill/line/rect tools, import/save, trimming empty space on export, faster brush switching).
