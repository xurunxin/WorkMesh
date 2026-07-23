import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    passWithNoTests: false,
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
})
