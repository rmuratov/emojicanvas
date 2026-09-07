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
