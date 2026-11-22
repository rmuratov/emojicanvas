import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/bench/**', '**/*.{bench,test}.{ts,tsx}', '**/*.d.ts'],
      include: ['src/**/*.{ts,tsx}'],
      provider: 'istanbul',
      reporter: ['text', 'html', 'json'],
      thresholds: { 100: true },
    },
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
        optimizeDeps: { include: ['emoji-picker-element', 'react-dom/client'] },
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
