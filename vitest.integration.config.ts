import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    passWithNoTests: false,
    // Long transaction/lock-order suites outlive Tinypool's Windows thread worker,
    // which can exit without a Vitest failure summary. Process workers keep the
    // Fastify/PostgreSQL lifecycle isolated and complete the same suites reliably.
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    // Windows PostgreSQL can spend more than two minutes syncing a cascading
    // truncate or completing an integration fixture; let each atomic unit finish.
    hookTimeout: 300_000,
    testTimeout: 300_000,
  },
})
