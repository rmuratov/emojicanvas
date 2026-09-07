# Тулчейн и тестовая инфраструктура — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести проект на актуальные версии инструментов и поднять тестовую
инфраструктуру Vitest с двумя проектами (node и browser), не меняя поведение приложения.

**Architecture:** Обновление идёт по одному инструменту за задачу, каждая задача
заканчивается проверкой, что приложение собирается и работает. Код приложения не
переписывается — правки только те, без которых новая версия инструмента не работает.
Тестовая инфраструктура ставится последней, на уже обновлённом тулчейне.

**Tech Stack:** Vite 8, React 19, TypeScript 7, ESLint 10 (flat config), Tailwind 4,
Vitest 5 (node + browser mode через Playwright), Prettier 3.9.

**Spec:** `docs/superpowers/specs/2026-09-07-foundation-design.md`

## Global Constraints

- **Не выполнять `git commit` и `git push` без явного разрешения пользователя.**
  Шаги «Commit» в задачах ниже приведены для полноты и выполняются только по его команде.
- Приложение после каждой задачи собирается (`npm run build`) и работает в браузере
  так же, как до неё. Внешний вид не меняется в этом плане вообще.
- `base: '/emojicanvas/'` в `vite.config.ts` сохраняется — от него зависит публикация
  на GitHub Pages.
- Настройки Prettier не меняются: без точек с запятой, одинарные кавычки, ширина 80,
  `arrowParens: 'avoid'`, `trailingComma: 'all'`, `endOfLine: 'lf'`.
- Линт запускается с `--max-warnings 0`; предупреждения считаются ошибками.
- Node 24 локально и в CI.
- Целевые версии: react/react-dom 19.2, vite 8.2, @vitejs/plugin-react 6.1,
  typescript 7.0, eslint 10.10, typescript-eslint 8.69, eslint-plugin-perfectionist 5.11,
  eslint-plugin-react-hooks 7.1, tailwindcss 4.3, prettier 3.9,
  emoji-picker-element 1.29, vitest 5.0.

---

### Task 1: Базовое состояние

Зафиксировать точку отсчёта: `node_modules` в репозитории нет, и надо убедиться, что
до обновлений проект вообще собирается. Без этого шага непонятно, что именно сломало
последующее обновление.

**Files:**
- Modify: нет (только установка зависимостей)

**Interfaces:**
- Consumes: ничего
- Produces: рабочее `node_modules` и подтверждённая работоспособность старой сборки

- [ ] **Step 1: Установить зависимости по существующему lock-файлу**

```bash
npm ci
```

Если `npm ci` падает из-за расхождения `package-lock.json` с `package.json`, выполнить
`npm install` и отметить это — lock-файл всё равно будет перезаписан в следующих задачах.

- [ ] **Step 2: Проверить сборку**

Run: `npm run build`
Expected: сборка проходит, появляется каталог `dist/`.

- [ ] **Step 3: Проверить линт**

Run: `npm run lint`
Expected: без ошибок. Если ошибки есть — записать их, чтобы потом отличить старые
от привнесённых обновлением.

- [ ] **Step 4: Проверить приложение вручную**

Run: `npm run dev`
Открыть `http://localhost:5173/emojicanvas/`. Убедиться, что рисование, ластик, очистка
и копирование работают. Это эталон поведения для всех последующих задач.

---

### Task 2: Vite 8, React 19 и плагин React

**Files:**
- Modify: `package.json`
- Modify: `src/main.tsx` (только при необходимости)

**Interfaces:**
- Consumes: рабочее окружение из Task 1
- Produces: приложение на React 19 и Vite 8

- [ ] **Step 1: Обновить пакеты**

```bash
npm install react@^19.2.0 react-dom@^19.2.0
npm install -D @types/react@^19 @types/react-dom@^19 vite@^8.2.0 @vitejs/plugin-react@^6.1.0
```

- [ ] **Step 2: Проверить сборку**

Run: `npm run build`
Expected: сборка проходит. React 19 сохранил `createRoot` из `react-dom/client`,
поэтому `src/main.tsx` менять не требуется.

Если появятся ошибки типов вокруг `ReactDOM.createRoot(document.getElementById('root')!)`,
причина в обновлённых `@types/react` — исправлять точечно, не меняя логику.

- [ ] **Step 3: Проверить приложение вручную**

Run: `npm run dev`
Открыть `http://localhost:5173/emojicanvas/`, повторить проверку из Task 1 Step 4.

Особое внимание — эмодзи-пикеру: `emoji-picker-element` это веб-компонент, а React 19
изменил обработку кастомных элементов. Пикер должен открываться и выбор эмодзи должен
менять кисть.

- [ ] **Step 4: Обновить emoji-picker-element**

```bash
npm install emoji-picker-element@^1.29.0
```

Run: `npm run dev` и снова проверить пикер.

- [ ] **Step 5: Commit** (только с разрешения пользователя)

```bash
git add package.json package-lock.json
git commit -m "chore: upgrade to React 19 and Vite 8"
```

---

### Task 3: TypeScript 7

TypeScript 7 — новый компилятор на Go. Основной риск задачи в том, поддерживает ли его
`typescript-eslint`; линт обновляется в Task 4, поэтому здесь проверяется только `tsc`.

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: окружение из Task 2
- Produces: проходящая проверка типов на TypeScript 7

- [ ] **Step 1: Обновить TypeScript**

```bash
npm install -D typescript@^7.0.0
```

- [ ] **Step 2: Проверить типы**

Run: `npx tsc --noEmit`
Expected: без ошибок.

Ожидаемые точки отказа и что с ними делать:
- Ругань на `allowImportingTsExtensions` без `noEmit` — `noEmit` уже стоит в
  `tsconfig.json`, проблемы быть не должно.
- Ошибка на `@ts-ignore` в `src/components/EmojiPicker/EmojiPicker.tsx` — оставить как
  есть, файл переписывается в плане 3.
- Устаревшие опции компилятора — удалить только те, на которые ругается компилятор.

- [ ] **Step 3: Проверить сборку**

Run: `npm run build`
Expected: проходит (`build` — это `tsc && vite build`).

- [ ] **Step 4: Зафиксировать результат проверки риска**

Если TypeScript 7 не заработал за разумное время — откатиться на 5.9:

```bash
npm install -D typescript@^5.9.0
```

и записать это решение в конце `docs/superpowers/specs/2026-09-07-foundation-design.md`
в разделе «Риски». Остальной план не меняется.

- [ ] **Step 5: Commit** (только с разрешения пользователя)

```bash
git add package.json package-lock.json tsconfig.json
git commit -m "chore: upgrade TypeScript"
```

---

### Task 4: ESLint 10 и flat config

ESLint 10 работает только с flat config. `.eslintrc.cjs` удаляется, правила переносятся
по смыслу в `eslint.config.js`.

Плагины `eslint-plugin-import` и `eslint-import-resolver-typescript` убираются:
сортировку импортов делает `perfectionist`, разрешение путей — TypeScript, а поддержка
flat config у `eslint-plugin-import` исторически проблемная. Единственное правило,
которое от него использовалось, — `import/newline-after-import`; форматирование пустых
строк остаётся за Prettier.

**Files:**
- Create: `eslint.config.js`
- Delete: `.eslintrc.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: окружение из Task 3
- Produces: проходящий `npm run lint` на ESLint 10

- [ ] **Step 1: Обновить и доустановить пакеты**

```bash
npm uninstall eslint-plugin-import eslint-import-resolver-typescript @typescript-eslint/eslint-plugin @typescript-eslint/parser
npm install -D eslint@^10.10.0 typescript-eslint@^8.69.0 @eslint/js@^10.0.0 globals@^17.12.0 \
  eslint-plugin-react@^7.37.0 eslint-plugin-react-hooks@^7.1.0 eslint-plugin-react-refresh@^0.4.0 \
  eslint-plugin-perfectionist@^5.11.0 eslint-config-prettier@^10.0.0 prettier@^3.9.0
```

- [ ] **Step 2: Сверить имена flat-конфигов у плагинов**

Имена конфигов между мажорными версиями меняются. Проверить фактические:

```bash
node -e "import('eslint-plugin-react-hooks').then(m=>console.log('react-hooks:',Object.keys(m.default.configs)))"
node -e "import('eslint-plugin-perfectionist').then(m=>console.log('perfectionist:',Object.keys(m.default.configs)))"
node -e "import('eslint-plugin-react').then(m=>console.log('react:',Object.keys(m.default.configs)))"
```

Ожидается, что у `react-hooks` есть `recommended-latest`, у `react` —
`flat/recommended` и `flat/jsx-runtime`. Если имена другие — использовать
фактические в следующем шаге.

- [ ] **Step 3: Создать flat config**

Создать `eslint.config.js`:

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

- [ ] **Step 4: Удалить старый конфиг**

```bash
rm .eslintrc.cjs
```

- [ ] **Step 5: Запустить линт**

Run: `npm run lint`
Expected: проходит без ошибок и предупреждений.

`perfectionist` 5 сортирует строже версии 1.5, поэтому ожидаются замечания к порядку
свойств и импортов. Исправлять автоматически:

```bash
npx eslint src --ext ts,tsx --fix
```

Затем прогнать линт снова и убедиться, что автоправка ничего не сломала:
`npm run build`.

- [ ] **Step 6: Commit** (только с разрешения пользователя)

```bash
git add eslint.config.js package.json package-lock.json src
git rm --cached .eslintrc.cjs
git commit -m "chore: migrate to ESLint 10 flat config"
```

---

### Task 5: Tailwind 4

Tailwind 4 конфигурируется из CSS, отдельный PostCSS больше не нужен — используется
плагин для Vite.

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `src/index.css`
- Delete: `tailwind.config.js`, `postcss.config.js`

**Interfaces:**
- Consumes: окружение из Task 4
- Produces: та же вёрстка на Tailwind 4

- [ ] **Step 1: Обновить пакеты**

```bash
npm uninstall autoprefixer postcss
npm install -D tailwindcss@^4.3.0 @tailwindcss/vite@^4.3.0
```

- [ ] **Step 2: Подключить плагин в Vite**

Заменить содержимое `vite.config.ts`:

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

- [ ] **Step 3: Заменить директивы в CSS**

Заменить содержимое `src/index.css`:

```css
@import 'tailwindcss';
```

- [ ] **Step 4: Удалить старые конфиги**

```bash
rm tailwind.config.js postcss.config.js
```

- [ ] **Step 5: Проверить сборку и внешний вид**

Run: `npm run build`
Expected: проходит.

Run: `npm run dev`
Открыть приложение и сравнить с эталоном из Task 1 Step 4. Проверить обе раскладки:
узкое окно (панель инструментов снизу) и широкое (панель сбоку) — вёрстка использует
префиксы `md:`, а в Tailwind 4 изменился слой базовых стилей.

Отдельно проверить `index.html`: на `<html>` и `<body>` висит класс `overscroll-none`,
он должен продолжать работать.

- [ ] **Step 6: Commit** (только с разрешения пользователя)

```bash
git add package.json package-lock.json vite.config.ts src/index.css
git rm --cached tailwind.config.js postcss.config.js
git commit -m "chore: migrate to Tailwind 4"
```

---

### Task 6: Vitest, проект node

Первый тестовый проект — для чистой логики без DOM. Смоук-тест пишется на реальном
модуле, а не на заглушке: берётся `cellsBetween` из спецификации ядра, потому что это
самая простая по контракту чистая функция, и она всё равно понадобится в плане 2.

**Files:**
- Create: `vitest.config.ts`
- Create: `src/core/types.ts`
- Create: `src/core/line.ts`
- Create: `src/core/line.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: окружение из Task 5
- Produces: `npm test` запускает node-проект; тип `Cell` и функция
  `cellsBetween(from: Cell, to: Cell): Cell[]` доступны плану 2

- [ ] **Step 1: Установить Vitest**

```bash
npm install -D vitest@^5.0.0
```

- [ ] **Step 2: Создать конфиг с проектом node**

Создать `vitest.config.ts`:

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

Поле `projects` появилось в Vitest 3 вместо файла workspace. Если Vitest сообщит, что
опция неизвестна, сверить актуальное имя:
`node -e "console.log(Object.keys(require('vitest/node')))"` и заглянуть в
`node_modules/vitest/dist/config.d.ts`.

- [ ] **Step 3: Добавить скрипты**

В `package.json` в разделе `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Написать падающий тест**

Создать `src/core/line.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { cellsBetween } from './line'

describe('cellsBetween', () => {
  it('возвращает одну клетку, когда точки совпадают', () => {
    expect(cellsBetween({ x: 2, y: 3 }, { x: 2, y: 3 })).toEqual([{ x: 2, y: 3 }])
  })

  it('строит горизонтальный отрезок, включая обе точки', () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ])
  })

  it('строит диагональ', () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ])
  })

  it('работает в отрицательных координатах и в обратном направлении', () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: -2, y: -1 })).toEqual([
      { x: 0, y: 0 },
      { x: -1, y: -1 },
      { x: -2, y: -1 },
    ])
  })
})
```

Создать `src/core/types.ts`:

```ts
export type Cell = { x: number; y: number }
export type CellBounds = { maxX: number; maxY: number; minX: number; minY: number }
export type Emoji = string
```

- [ ] **Step 5: Запустить тест и убедиться, что он падает**

Run: `npm test`
Expected: FAIL — модуль `./line` не найден.

- [ ] **Step 6: Реализовать `cellsBetween`**

Создать `src/core/line.ts`:

```ts
import type { Cell } from './types'

/**
 * Клетки на отрезке между двумя точками по алгоритму Брезенхема,
 * включая обе крайние. Нужен, чтобы быстрое движение указателя
 * не оставляло разрывов в линии.
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

- [ ] **Step 7: Запустить тесты**

Run: `npm test`
Expected: PASS, четыре теста.

Если тест про отрицательные координаты не сошёлся, сверить ожидаемую последовательность
с фактической: у Брезенхема при отношении сторон 2:1 промежуточная клетка может лежать
как в `{-1,-1}`, так и в `{-1,0}`. Обе последовательности связны и корректны — поправить
ожидание в тесте под фактическое поведение, но убедиться, что соседние клетки в
результате отличаются не более чем на единицу по каждой оси.

- [ ] **Step 8: Проверить линт**

Run: `npm run lint`
Expected: проходит. `perfectionist` требует натуральной сортировки — в `types.ts`
ключи типов уже упорядочены по алфавиту.

- [ ] **Step 9: Commit** (только с разрешения пользователя)

```bash
git add vitest.config.ts package.json package-lock.json src/core
git commit -m "test: set up Vitest node project with cellsBetween"
```

---

### Task 7: Vitest, проект browser

Второй проект — для того, что требует настоящего браузера: canvas, события указателя,
React-компоненты. Провайдер — Playwright.

**Files:**
- Modify: `vitest.config.ts`
- Create: `src/render/glyphAtlas.smoke.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: конфиг из Task 6
- Produces: `npm test` запускает оба проекта; browser-проект доступен планам 2 и 3

- [ ] **Step 1: Установить browser mode и Playwright**

```bash
npm install -D @vitest/browser@^5.0.0 @vitest/browser-playwright@^5.0.0 playwright@^1.63.0
npx playwright install chromium --with-deps
```

- [ ] **Step 2: Добавить проект browser в конфиг**

Заменить содержимое `vitest.config.ts`:

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
          include: ['src/{render,input,editor,ui,components,hooks}/**/*.test.{ts,tsx}'],
          name: 'browser',
        },
      },
    ],
  },
})
```

- [ ] **Step 3: Написать смоук-тест, доказывающий наличие настоящего canvas**

Создать `src/render/glyphAtlas.smoke.test.ts`:

```ts
import { expect, it } from 'vitest'

it('в браузерном проекте доступен настоящий 2D-контекст', () => {
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

it('measureText возвращает метрики фактических границ глифа', () => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = '30px sans-serif'

  const metrics = ctx.measureText('A')

  expect(metrics.actualBoundingBoxAscent).toBeGreaterThan(0)
  expect(metrics.width).toBeGreaterThan(0)
})
```

Второй тест не декоративный: на нём держится вся центровка глифов из спецификации.
Если метрик нет, план 3 придётся строить на запасном варианте.

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS в обоих проектах — четыре теста в node, два в browser.

При падении с сообщением про отсутствующий браузер повторить
`npx playwright install chromium --with-deps`.

- [ ] **Step 5: Добавить артефакты Vitest в .gitignore**

Дописать в `.gitignore`:

```
coverage
__screenshots__
```

- [ ] **Step 6: Commit** (только с разрешения пользователя)

```bash
git add vitest.config.ts package.json package-lock.json .gitignore src/render
git commit -m "test: add Vitest browser project via Playwright"
```

---

### Task 8: CI

**Files:**
- Modify: `.github/workflows/vite.yaml`

**Interfaces:**
- Consumes: скрипты `lint`, `test`, `build` из предыдущих задач
- Produces: CI, проверяющий линт и тесты перед публикацией

- [ ] **Step 1: Обновить workflow**

Заменить блок `steps` job `deploy` в `.github/workflows/vite.yaml`:

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

- [ ] **Step 2: Проверить синтаксис workflow локально**

```bash
node -e "const y=require('fs').readFileSync('.github/workflows/vite.yaml','utf8'); console.log(y.split('\n').length + ' строк, отступы:', /\t/.test(y) ? 'ЕСТЬ ТАБЫ — ошибка' : 'ок')"
```

Expected: табов нет.

- [ ] **Step 3: Сверить фактические мажорные версии действий**

Версии `actions/*` в примере выше проставлены по состоянию на дату плана. Перед
применением сверить, что такие мажорные версии существуют, на страницах
`github.com/actions/checkout`, `actions/setup-node`, `actions/configure-pages`,
`actions/upload-pages-artifact`, `actions/deploy-pages`. Если какой-то мажор ещё
не выпущен — взять максимальный доступный.

- [ ] **Step 4: Прогнать локально то же, что делает CI**

```bash
npm ci && npm run lint && npm test && npm run build
```

Expected: все четыре команды проходят.

- [ ] **Step 5: Commit** (только с разрешения пользователя)

```bash
git add .github/workflows/vite.yaml
git commit -m "ci: run lint and tests, update actions and Node"
```

---

## Проверка готовности плана

После выполнения всех задач должно быть верно одновременно:

- [ ] `npm run build` проходит
- [ ] `npm run lint` проходит без предупреждений
- [ ] `npm test` запускает оба проекта и проходит
- [ ] Приложение в браузере ведёт себя как в Task 1 Step 4, вид не изменился
- [ ] В репозитории нет `.eslintrc.cjs`, `tailwind.config.js`, `postcss.config.js`
- [ ] Есть `eslint.config.js` и `vitest.config.ts`

## Что дальше

План 2 («Ядро движка») строится на `src/core/types.ts` и `src/core/line.ts`, созданных
в Task 6, и на node-проекте Vitest. План 3 («Рендер, ввод, интеграция») использует
browser-проект из Task 7.
