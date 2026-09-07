# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```shell
npm ci
npm run dev      # vite --host; app is at http://localhost:5173/emojicanvas/ (note the base path)
npm run build    # tsc (typecheck, noEmit) && vite build
npm run lint     # eslint src --ext ts,tsx --max-warnings 0
npm run preview  # serve the production build
```

There is no test suite. `npm run build` is the typecheck gate — run it plus `npm run lint` before claiming a change works.

Pushes to `main` auto-deploy `dist/` to GitHub Pages (`.github/workflows/vite.yaml`), so `base: '/emojicanvas/'` in `vite.config.ts` must stay.

## Architecture

React 18 + Vite + TypeScript + Tailwind. The drawing engine is deliberately **not** React.

- `src/lib/EmojiCanvas.ts` — a plain class that owns everything about drawing: it creates its own `<canvas>` inside a container element passed to the constructor, attaches its own mouse/touch listeners, and keeps a `string[][]` `matrix` as the source of truth for the picture. React never re-renders on drawing. The class throws if the container already has child nodes.
- `src/hooks/useEmojiCanvas.ts` — the only bridge: instantiates `EmojiCanvas` on a ref, stores it in state, and mirrors erasing status into React via an `onErasingStatusChange` callback passed to the constructor.
- `src/components/App/App.tsx` — holds UI state (selected brush, picker open) and calls imperative methods on the canvas instance (`setBrush`, `setErasingMode`, `clear`, `getDrawingAsString`).
- `src/components/EmojiPicker` wraps the `emoji-picker-element` web component; `useEmojiPicker` attaches its `emoji-click` listener imperatively (the element is not a React component, hence the `@ts-ignore` on the `<emoji-picker>` tag).

Components live in `src/components/<Name>/<Name>.tsx` with an `index.ts` barrel; `src/hooks` and `src/lib` re-export through barrels too. Imports use relative paths (no path aliases).

### Two domain concepts that drive the code

**The filler.** Empty cells are not spaces — they hold `〰️` (`this.filler`). Messaging apps trim real spaces, which destroys the art on paste. Erasing is implemented as "set the brush to the filler", so `isErasing()` is just `brush === filler`, and export writes the filler characters out verbatim. Changing the filler changes what erased cells look like in both the canvas and the exported text.

**Grid vs. pixel coordinates.** `getBrushEventPosition` converts a pointer event into both grid indices (`gridX`/`gridY`, indexing `matrix`) and top-left pixel coordinates of that cell. Note `matrix[column][row]` — column-major, so `getDrawingAsString` iterates rows in the outer loop and indexes `matrix[j][i]`. Cell geometry (`cellWidth`, `cellHeight`, `borderWidth`, `columnsCount`, `rowsCount`) plus the DPR scaling in `initCanvas` all interlock; canvas size is derived from them, never hard-coded.

Emoji rendering inside a cell uses hard-coded `emojiOffsetInsideCellX/Y` nudges. This is a known weakness documented in the README — it only looks right with Apple emoji metrics, and the intended fix is a non-pixel-imperative approach.

## Conventions

- Prettier: no semicolons, single quotes, trailing commas, `arrowParens: 'avoid'`, 80 cols.
- `eslint-plugin-perfectionist` (`recommended-natural`) is on: object keys, JSX props, interface members, imports and exports must be sorted naturally. `perfectionist/sort-classes` is disabled, so class members are free-form. Lint runs with `--max-warnings 0`, so a stray unsorted prop fails the build.
- Styling is Tailwind utility classes inline; there is no CSS beyond the three `@tailwind` directives in `src/index.css`.
- The README's TODO list is the roadmap (fill/line/rect tools, import/save, trimming empty space on export, faster brush switching).
