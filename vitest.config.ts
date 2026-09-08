import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          // Without an explicit include here, Vitest's default benchmark
          // glob matches in both projects and every .bench.ts runs twice —
          // once in node, where there is no document to draw into.
          benchmark: { include: ['src/{core,tools}/**/*.bench.ts'] },
          environment: 'node',
          include: ['src/{core,tools}/**/*.test.ts'],
          name: 'node',
        },
      },
      {
        test: {
          benchmark: {
            exclude: ['src/{core,tools}/**/*.bench.ts'],
            include: ['src/**/*.bench.ts'],
          },
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: 'chromium' }],
            provider: playwright(),
          },
          exclude: ['src/{core,tools}/**/*.test.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          name: 'browser',
        },
      },
    ],
  },
})
