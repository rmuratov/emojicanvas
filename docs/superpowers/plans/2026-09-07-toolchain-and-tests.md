# Toolchain and Test Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the project onto current tool versions and stand up a Vitest test
infrastructure with two projects (node and browser), without changing the app's
behavior.

**Architecture:** The upgrade proceeds one tool per task, and every task ends with
a check that the app still builds and works. Application code is not rewritten —
only the changes a new tool version actually forces. The test infrastructure goes
in last, on top of the already-upgraded toolchain.

**Tech Stack:** Vite 8, React 19, TypeScript 7, ESLint 10 (flat config), Tailwind 4,
Vitest 5 (node + browser mode via Playwright), Prettier 3.9.

**Spec:** `docs/superpowers/specs/2026-09-07-foundation-design.md`

## Global Constraints

- **Do not run `git commit` or `git push` without the user's explicit permission.**
  The "Commit" steps in the tasks below are included for completeness and are
  carried out only on the user's instruction.
- After every task the app builds (`npm run build`) and behaves in the browser
  exactly as it did before that task. Appearance does not change anywhere in this
  plan.
- `base: '/emojicanvas/'` in `vite.config.ts` is preserved — GitHub Pages
  publishing depends on it.
- Prettier settings do not change: no semicolons, single quotes, width 80,
  `arrowParens: 'avoid'`, `trailingComma: 'all'`, `endOfLine: 'lf'`.
- Lint runs with `--max-warnings 0`; warnings count as errors.
- Node 24 locally and in CI.
- Target versions: react/react-dom 19.2, vite 8.2, @vitejs/plugin-react 6.1,
  typescript 7.0, eslint 10.10, typescript-eslint 8.69, eslint-plugin-perfectionist 5.11,
  eslint-plugin-react-hooks 7.1, tailwindcss 4.3, prettier 3.9,
  emoji-picker-element 1.29, vitest 5.0.

---

### Task 1: Baseline state

Establish a starting point: `node_modules` isn't in the repo, and we need to
confirm the project even builds before any upgrades. Without this step there's no
way to tell what a later upgrade actually broke.

**Files:**

- Modify: none (dependency installation only)

**Interfaces:**

- Consumes: nothing
- Produces: a working `node_modules` and a confirmed-working old build

- [ ] **Step 1: Install dependencies from the existing lockfile**

```bash
npm ci
```

If `npm ci` fails because `package-lock.json` is out of sync with `package.json`,
run `npm install` instead and note that it happened — the lockfile is going to be
rewritten in later tasks anyway.

- [ ] **Step 2: Check the build**

Run: `npm run build`
Expected: the build succeeds, a `dist/` directory appears.

- [ ] **Step 3: Check lint**

Run: `npm run lint`
Expected: no errors. If there are errors, record them so later they can be told
apart from ones introduced by the upgrade.

- [ ] **Step 4: Check the app manually**

Run: `npm run dev`
Open `http://localhost:5173/emojicanvas/`. Confirm drawing, the eraser, clear, and
copy all work. This is the behavioral baseline for every task that follows.

---

### Task 2: Vite 8, React 19, and the React plugin

**Files:**

- Modify: `package.json`
- Modify: `src/main.tsx` (only if needed)

**Interfaces:**

- Consumes: the working environment from Task 1
- Produces: the app on React 19 and Vite 8

- [ ] **Step 1: Upgrade packages**

```bash
npm install react@^19.2.0 react-dom@^19.2.0
npm install -D @types/react@^19 @types/react-dom@^19 vite@^8.2.0 @vitejs/plugin-react@^6.1.0
```

- [ ] **Step 2: Check the build**

Run: `npm run build`
Expected: the build succeeds. React 19 kept `createRoot` in `react-dom/client`, so
`src/main.tsx` needs no changes.

If type errors show up around
`ReactDOM.createRoot(document.getElementById('root')!)`, the cause is the updated
`@types/react` — fix it locally, without changing the logic.

- [ ] **Step 3: Check the app manually**

Run: `npm run dev`
Open `http://localhost:5173/emojicanvas/`, repeat the check from Task 1 Step 4.

Pay particular attention to the emoji picker: `emoji-picker-element` is a web
component, and React 19 changed how custom elements are handled. The picker must
still open, and picking an emoji must still change the brush.

- [ ] **Step 4: Upgrade emoji-picker-element**

```bash
npm install emoji-picker-element@^1.29.0
```

Run: `npm run dev` and check the picker again.

- [ ] **Step 5: Commit** (only with the user's permission)

```bash
git add package.json package-lock.json
git commit -m "chore: upgrade to React 19 and Vite 8"
```

---

### Task 3: TypeScript 7

TypeScript 7 is a new compiler written in Go. The main risk in this task is
whether `typescript-eslint` supports it; lint gets upgraded in Task 4, so here
only `tsc` is checked.

**Files:**

- Modify: `package.json`
- Modify: `tsconfig.json`

**Interfaces:**

- Consumes: the environment from Task 2
- Produces: a passing type check on TypeScript 7

- [ ] **Step 1: Upgrade TypeScript**

```bash
npm install -D typescript@^7.0.0
```

- [ ] **Step 2: Check types**

Run: `npx tsc --noEmit`
Expected: no errors.

Expected failure points and how to handle them:

- A complaint about `allowImportingTsExtensions` without `noEmit` — `noEmit` is
  already set in `tsconfig.json`, so this shouldn't be an issue.
- An error on `@ts-ignore` in `src/components/EmojiPicker/EmojiPicker.tsx` —
  leave it as is, the file gets rewritten in plan 3.
- Deprecated compiler options — remove only the ones the compiler actually
  complains about.

- [ ] **Step 3: Check the build**

Run: `npm run build`
Expected: passes (`build` is `tsc && vite build`).

- [ ] **Step 4: Record the outcome of the risk check**

If TypeScript 7 doesn't work out within a reasonable amount of time, roll back to
5.9:

```bash
npm install -D typescript@^5.9.0
```

and record that decision at the end of
`docs/superpowers/specs/2026-09-07-foundation-design.md`, in the "Risks" section.
The rest of the plan doesn't change.

- [ ] **Step 5: Commit** (only with the user's permission)

```bash
git add package.json package-lock.json tsconfig.json
git commit -m "chore: upgrade TypeScript"
```

---

### Task 4: ESLint 10 and flat config

ESLint 10 only works with flat config. `.eslintrc.cjs` is deleted, and its rules
are ported over by intent into `eslint.config.js`.

`eslint-plugin-import` and `eslint-import-resolver-typescript` are removed:
`perfectionist` handles import sorting, TypeScript handles path resolution, and
`eslint-plugin-import`'s flat-config support has historically been shaky. The only
rule that was actually used from it was `import/newline-after-import`; blank-line
formatting stays with Prettier.

**Files:**

- Create: `eslint.config.js`
- Delete: `.eslintrc.cjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: the environment from Task 3
- Produces: a passing `npm run lint` on ESLint 10

- [ ] **Step 1: Upgrade and add packages**

```bash
npm uninstall eslint-plugin-import eslint-import-resolver-typescript @typescript-eslint/eslint-plugin @typescript-eslint/parser
npm install -D eslint@^10.10.0 typescript-eslint@^8.69.0 @eslint/js@^10.0.0 globals@^17.12.0 \
  eslint-plugin-react@^7.37.0 eslint-plugin-react-hooks@^7.1.0 eslint-plugin-react-refresh@^0.4.0 \
  eslint-plugin-perfectionist@^5.11.0 eslint-config-prettier@^10.0.0 prettier@^3.9.0
```

- [ ] **Step 2: Check plugins' flat-config names**

Config names change between major versions. Check the actual ones:

```bash
node -e "import('eslint-plugin-react-hooks').then(m=>console.log('react-hooks:',Object.keys(m.default.configs)))"
node -e "import('eslint-plugin-perfectionist').then(m=>console.log('perfectionist:',Object.keys(m.default.configs)))"
node -e "import('eslint-plugin-react').then(m=>console.log('react:',Object.keys(m.default.configs)))"
```

`react-hooks` is expected to have `recommended-latest`, and `react` —
`flat/recommended` and `flat/jsx-runtime`. If the names differ, use the actual
ones in the next step.

- [ ] **Step 3: Create the flat config**

Create `eslint.config.js`:

```js
import js from '@eslint/js'
import perfectionist from 'eslint-plugin-perfectionist'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  perfectionist.configs['recommended-natural'],
  reactHooks.configs['recommended-latest'],
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'no-unused-vars': 'off',
      'perfectionist/sort-classes': 'off',
      'react/boolean-prop-naming': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
    settings: { react: { version: 'detect' } },
  },
)
```

- [ ] **Step 4: Delete the old config**

```bash
rm .eslintrc.cjs
```

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: passes with no errors and no warnings.

`perfectionist` 5 sorts more strictly than version 1.5, so expect findings about
property and import order. Fix them automatically:

```bash
npx eslint src --ext ts,tsx --fix
```

Then run lint again and confirm the autofix broke nothing: `npm run build`.

- [ ] **Step 6: Commit** (only with the user's permission)

```bash
git add eslint.config.js package.json package-lock.json src
git rm --cached .eslintrc.cjs
git commit -m "chore: migrate to ESLint 10 flat config"
```

---

### Task 5: Tailwind 4

Tailwind 4 is configured from CSS; a separate PostCSS setup is no longer needed —
a Vite plugin is used instead.

**Files:**

- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `src/index.css`
- Delete: `tailwind.config.js`, `postcss.config.js`

**Interfaces:**

- Consumes: the environment from Task 4
- Produces: the same layout on Tailwind 4

- [ ] **Step 1: Upgrade packages**

```bash
npm uninstall autoprefixer postcss
npm install -D tailwindcss@^4.3.0 @tailwindcss/vite@^4.3.0
```

- [ ] **Step 2: Wire the plugin into Vite**

Replace the contents of `vite.config.ts`:

```ts
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/emojicanvas/',
  plugins: [react(), tailwindcss()],
})
```

- [ ] **Step 3: Replace the CSS directives**

Replace the contents of `src/index.css`:

```css
@import 'tailwindcss';
```

- [ ] **Step 4: Delete the old configs**

```bash
rm tailwind.config.js postcss.config.js
```

- [ ] **Step 5: Check the build and the appearance**

Run: `npm run build`
Expected: passes.

Run: `npm run dev`
Open the app and compare it against the baseline from Task 1 Step 4. Check both
layouts: narrow window (toolbar at the bottom) and wide window (toolbar on the
side) — the layout uses `md:` prefixes, and Tailwind 4 changed the base styles
layer.

Separately check `index.html`: the `overscroll-none` class sits on `<html>` and
`<body>` and must keep working.

- [ ] **Step 6: Commit** (only with the user's permission)

```bash
git add package.json package-lock.json vite.config.ts src/index.css
git rm --cached tailwind.config.js postcss.config.js
git commit -m "chore: migrate to Tailwind 4"
```

---

### Task 6: Vitest, node project

The first test project is for pure logic with no DOM. The smoke test is written
against a real module, not a stub: it uses `cellsBetween` from the core spec,
because it's the simplest pure function by contract, and plan 2 will need it
anyway.

**Files:**

- Create: `vitest.config.ts`
- Create: `src/core/types.ts`
- Create: `src/core/line.ts`
- Create: `src/core/line.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: the environment from Task 5
- Produces: `npm test` runs the node project; the `Cell` type and the
  `cellsBetween(from: Cell, to: Cell): Cell[]` function are available to plan 2

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest@^5.0.0
```

- [ ] **Step 2: Create the config with the node project**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          environment: 'node',
          include: ['src/{core,tools}/**/*.test.ts'],
          name: 'node',
        },
      },
    ],
  },
})
```

The `projects` field appeared in Vitest 3, replacing the workspace file. If
Vitest reports the option as unknown, check the actual name:
`node -e "console.log(Object.keys(require('vitest/node')))"` and look in
`node_modules/vitest/dist/config.d.ts`.

- [ ] **Step 3: Add scripts**

In `package.json`, under `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a failing test**

Create `src/core/line.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { cellsBetween } from './line'

describe('cellsBetween', () => {
  it('returns a single cell when the points coincide', () => {
    expect(cellsBetween({ x: 2, y: 3 }, { x: 2, y: 3 })).toEqual([
      { x: 2, y: 3 },
    ])
  })

  it('builds a horizontal segment, including both points', () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ])
  })

  it('builds a diagonal', () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ])
  })

  it('works with negative coordinates and in the reverse direction', () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: -2, y: -1 })).toEqual([
      { x: 0, y: 0 },
      { x: -1, y: -1 },
      { x: -2, y: -1 },
    ])
  })
})
```

Create `src/core/types.ts`:

```ts
export type Cell = { x: number; y: number }
export type CellBounds = {
  maxX: number
  maxY: number
  minX: number
  minY: number
}
export type Emoji = string
```

- [ ] **Step 5: Run the test and confirm it fails**

Run: `npm test`
Expected: FAIL — the `./line` module isn't found.

- [ ] **Step 6: Implement `cellsBetween`**

Create `src/core/line.ts`:

```ts
import type { Cell } from './types'

/**
 * Cells on the segment between two points, using Bresenham's algorithm,
 * including both endpoints. Needed so a fast pointer move doesn't leave
 * gaps in the line.
 */
export function cellsBetween(from: Cell, to: Cell): Cell[] {
  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)
  const stepX = from.x < to.x ? 1 : -1
  const stepY = from.y < to.y ? 1 : -1

  let error = dx - dy
  let { x, y } = from

  const cells: Cell[] = []

  for (;;) {
    cells.push({ x, y })

    if (x === to.x && y === to.y) return cells

    const doubled = error * 2

    if (doubled > -dy) {
      error -= dy
      x += stepX
    }

    if (doubled < dx) {
      error += dx
      y += stepY
    }
  }
}
```

- [ ] **Step 7: Run the tests**

Run: `npm test`
Expected: PASS, four tests.

If the negative-coordinates test doesn't match, compare the expected sequence
against the actual one: with Bresenham, at a 2:1 side ratio the intermediate cell
can legitimately land at either `{-1,-1}` or `{-1,0}`. Both sequences are
connected and correct — adjust the test's expectation to match actual behavior,
but confirm that adjacent cells in the result never differ by more than one unit
on either axis.

- [ ] **Step 8: Check lint**

Run: `npm run lint`
Expected: passes. `perfectionist` requires natural sorting — in `types.ts` the
type keys are already in alphabetical order.

- [ ] **Step 9: Commit** (only with the user's permission)

```bash
git add vitest.config.ts package.json package-lock.json src/core
git commit -m "test: set up Vitest node project with cellsBetween"
```

---

### Task 7: Vitest, browser project

The second project is for anything that needs a real browser: canvas, pointer
events, React components. The provider is Playwright.

**Files:**

- Modify: `vitest.config.ts`
- Create: `src/render/glyphAtlas.smoke.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: the config from Task 6
- Produces: `npm test` runs both projects; the browser project is available to
  plans 2 and 3

- [ ] **Step 1: Install browser mode and Playwright**

```bash
npm install -D @vitest/browser@^5.0.0 @vitest/browser-playwright@^5.0.0 playwright@^1.63.0
npx playwright install chromium --with-deps
```

- [ ] **Step 2: Add the browser project to the config**

Replace the contents of `vitest.config.ts`:

```ts
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          environment: 'node',
          include: ['src/{core,tools}/**/*.test.ts'],
          name: 'node',
        },
      },
      {
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: 'chromium' }],
            provider: playwright(),
          },
          include: [
            'src/{render,input,editor,ui,components,hooks}/**/*.test.{ts,tsx}',
          ],
          name: 'browser',
        },
      },
    ],
  },
})
```

- [ ] **Step 3: Write a smoke test proving a real canvas is present**

Create `src/render/glyphAtlas.smoke.test.ts`:

```ts
import { expect, it } from 'vitest'

it('a real 2D context is available in the browser project', () => {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32

  const ctx = canvas.getContext('2d')
  expect(ctx).not.toBeNull()

  ctx!.fillStyle = 'red'
  ctx!.fillRect(0, 0, 32, 32)

  const [r, g, b, a] = ctx!.getImageData(16, 16, 1, 1).data
  expect([r, g, b, a]).toEqual([255, 0, 0, 255])
})

it('measureText returns actual-bounding-box glyph metrics', () => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = '30px sans-serif'

  const metrics = ctx.measureText('A')

  expect(metrics.actualBoundingBoxAscent).toBeGreaterThan(0)
  expect(metrics.width).toBeGreaterThan(0)
})
```

The second test isn't decorative: the spec's whole glyph-centering approach rests
on it. If the metrics aren't there, plan 3 will have to be built on a fallback.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS in both projects — four tests in node, two in browser.

If it fails with a message about a missing browser, run
`npx playwright install chromium --with-deps` again.

- [ ] **Step 5: Add Vitest artifacts to .gitignore**

Append to `.gitignore`:

```
coverage
__screenshots__
```

- [ ] **Step 6: Commit** (only with the user's permission)

```bash
git add vitest.config.ts package.json package-lock.json .gitignore src/render
git commit -m "test: add Vitest browser project via Playwright"
```

---

### Task 8: CI

**Files:**

- Modify: `.github/workflows/vite.yaml`

**Interfaces:**

- Consumes: the `lint`, `test`, `build` scripts from previous tasks
- Produces: CI that checks lint and tests before publishing

- [ ] **Step 1: Update the workflow**

Replace the `steps` block of the `deploy` job in `.github/workflows/vite.yaml`:

```yaml
steps:
  - name: Checkout
    uses: actions/checkout@v5
  - name: Set up Node
    uses: actions/setup-node@v5
    with:
      node-version: 24
      cache: 'npm'
  - name: Install dependencies
    run: npm ci
  - name: Install Playwright browsers
    run: npx playwright install chromium --with-deps
  - name: Lint
    run: npm run lint
  - name: Test
    run: npm test
  - name: Build
    run: npm run build
  - name: Setup Pages
    uses: actions/configure-pages@v5
  - name: Upload artifact
    uses: actions/upload-pages-artifact@v4
    with:
      # Upload dist repository
      path: './dist'
  - name: Deploy to GitHub Pages
    id: deployment
    uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Check the workflow's syntax locally**

```bash
node -e "const y=require('fs').readFileSync('.github/workflows/vite.yaml','utf8'); console.log(y.split('\n').length + ' lines, tabs:', /\t/.test(y) ? 'TABS PRESENT — error' : 'ok')"
```

Expected: no tabs.

- [ ] **Step 3: Check the actual major versions of the actions**

The `actions/*` versions in the example above were set as of the plan's date.
Before applying it, confirm those majors exist, on the pages for
`github.com/actions/checkout`, `actions/setup-node`, `actions/configure-pages`,
`actions/upload-pages-artifact`, `actions/deploy-pages`. If some major hasn't
shipped yet, use the highest one available.

- [ ] **Step 4: Run locally what CI does**

```bash
npm ci && npm run lint && npm test && npm run build
```

Expected: all four commands pass.

- [ ] **Step 5: Commit** (only with the user's permission)

```bash
git add .github/workflows/vite.yaml
git commit -m "ci: run lint and tests, update actions and Node"
```

---

## Plan Readiness Check

After all tasks are done, all of the following must hold at once:

- [ ] `npm run build` passes
- [ ] `npm run lint` passes with no warnings
- [ ] `npm test` runs both projects and passes
- [ ] The app behaves in the browser as it did in Task 1 Step 4, appearance
      unchanged
- [ ] The repo has no `.eslintrc.cjs`, `tailwind.config.js`, `postcss.config.js`
- [ ] `eslint.config.js` and `vitest.config.ts` exist

## What's next

Plan 2 ("Engine core") builds on `src/core/types.ts` and `src/core/line.ts`,
created in Task 6, and on the node Vitest project. Plan 3 ("Rendering, input,
integration") uses the browser project from Task 7.
