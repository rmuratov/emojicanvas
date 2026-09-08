# Foundation work in progress

Cross-session status log. Read together with the spec
`specs/2026-09-07-foundation-design.md` — it remains the authority on design intent.

Updated: 2026-09-07.

## Where we are

All work is happening on a single branch, **`foundation`** (21 commits), which will
be merged into `main` locally once all three plans are done. Nothing has been
pushed; `main` is untouched.

| Plan | Status |
|---|---|
| 1. Toolchain and test infrastructure (`plans/2026-09-07-toolchain-and-tests.md`) | **Done**, review passed |
| 2. Engine core | **Plan not written yet** — next step |
| 3. Rendering, input, integration, performance | Plan not written |

## What already works

`npm ci`, `npm run lint` (`--max-warnings 0`), `npm test`, `npm run build` — all
green from a clean state. The app looks and behaves exactly as it did before the
work started: compared against a baseline screenshot, including the mobile layout.

Toolchain: React 19.2, Vite 8.2, TypeScript 5.9.3, ESLint 10.10 (flat config,
`eslint.config.js`), Tailwind 4.3 (configured in `src/index.css`), Prettier 3.9,
Vitest 5.

Tests: two projects in `vitest.config.ts`, 7 tests total.
- `node` — `src/{core,tools}/**/*.test.ts`, pure logic, no DOM;
- `browser` — everything else under `src/`, real Chromium via Playwright.
The patterns are strict complements: a file can't fall through both. Verified.

CI (`.github/workflows/vite.yaml`): a `test` job on push and pull request, a
`deploy` job with `needs: test`, only for pushes to `main` and manual runs.
Publishing to Pages is unreachable without passing lint and tests.

Modules ready for plan 2 to build on:
- `src/core/types.ts` — `Cell`, `CellBounds`, `Emoji`;
- `src/core/line.ts` — `cellsBetween(from, to): Cell[]`, Bresenham, both endpoints
  included, coordinates rounded down.

## Settled decisions

**TypeScript stays on 5.9.3.** Compiler 7.0 builds the project cleanly, without a
single code change. It's blocked by `typescript-eslint`: version 8.69 has an
explicit check that rejects TS 7.0, with support promised starting at 7.1. Tried
twice, same result both times. Revisit once that support ships.

**The peer conflict between `eslint-plugin-react` and ESLint 10** is resolved with
a narrow `overrides` in `package.json`, not a blanket `legacy-peer-deps`. Don't
replace it with `.npmrc` — that would weaken dependency checking across the whole
repo.

**The button border color is set explicitly** (`border-gray-200` in `Tool.tsx`)
because Tailwind 4 changed the default to `currentColor`. A point fix, not a
global rule.

**All code is in English.** The plans and spec are written in Russian, but nothing
from them is copied into code verbatim. This was already violated once: test names
made it into the repo in Russian, straight from the plan.

## Requirements for later plans

- **Plan 3, pointer handling:** screen coordinates must be snapped to whole cells
  before calling `cellsBetween`. The function itself is now protected by rounding,
  but that protection shouldn't be relied on as the normal path.
- **Plan 3, rendering:** the glyph-centering formula from the spec has been
  verified against real Chromium metrics (`width` 20.0098,
  `actualBoundingBoxAscent` 21.5186, `actualBoundingBoxLeft` −0.4395,
  `actualBoundingBoxRight` 19.6436). The metrics are non-zero, the approach works.
- **Plan 2, core:** write into the node Vitest project — it's already set up and
  fast.

## Deferred findings

None of these block work. Address them before merging `foundation` into `main`.

1. The bundle grew from 192.52 kB (64.11 gzip) to 234.83 kB (75.56 gzip) after
   React 19 and Vite 8. No size limits were set anywhere.
2. `settings.react.version` in `eslint.config.js` is hardcoded as `'19.2'`:
   `eslint-plugin-react`'s auto-detection fails on ESLint 10. It will go stale
   silently at the next React major.
3. The root `packages[""]` entry in `package-lock.json` doesn't reflect the
   `overrides` field. `npm ci` works; npm will rewrite it on the next write.
4. The button border color is a literal, not a theme token. Tokens will land in
   `render/theme.ts` in plan 3.
5. `.px-1` remains in the built CSS: the class comes from a commented-out
   `<dialog>` block in `src/components/App/App.tsx`. It will disappear once that
   component is rewritten in plan 3.
6. Two high-severity vulnerabilities (ReDoS in `brace-expansion` and `minimatch`)
   in transitive **dev** dependencies. They don't reach the bundle:
   `npm audit --omit=dev` reports zero. `npm audit fix` offers a fix.
7. `tsconfig.node.json` only includes `vite.config.ts` — nothing type-checks
   `vitest.config.ts`.
8. `.prettierrc` contains the deprecated `jsxBracketSameLine`; Prettier 3.9 prints
   a warning on every run.

## How to continue

The next step is to write plan 2 (engine core), covering the spec's "Model"
section, `core/scene.ts`, `core/operations.ts`, `core/history.ts`,
`core/camera.ts`, `core/export/text.ts`, and the node-project part of the "Tests"
section. Then execute it the same way: one task at a time, with review between
them.
