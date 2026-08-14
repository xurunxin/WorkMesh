import { defineConfig } from '@playwright/test'

const webPort = 3100
const webUrl = `http://127.0.0.1:${webPort}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm exec next dev --port ${webPort}`,
    url: webUrl,
    reuseExistingServer: false,
    timeout: 90_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3101',
    },
  },
})
