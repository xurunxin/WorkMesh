import { defineConfig } from 'vitest/config'

export default defineConfig({ test: {
  include: ['src/mcp-coverage.conformance.test.ts'], passWithNoTests: false,
  pool: 'forks', fileParallelism: false, maxWorkers: 1, hookTimeout: 300_000, testTimeout: 300_000,
} })
