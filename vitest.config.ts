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
          exclude: ['src/{core,tools}/**/*.test.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          name: 'browser',
        },
      },
    ],
  },
})
