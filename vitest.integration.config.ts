import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    passWithNoTests: false,
    // Tinypool's child-process IPC can close before long-lived integration servers finish on Windows.
    pool: process.platform === 'win32' ? 'threads' : 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
})
