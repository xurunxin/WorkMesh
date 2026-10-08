import { defineConfig } from '@playwright/test'
import { resolvePlaywrightRunPaths } from './e2e/playwright-run-directory.js'

const webPort = 3200
const apiPort = 3201
const webUrl = `http://127.0.0.1:${webPort}`
const apiUrl = `http://127.0.0.1:${apiPort}`
const mockedSpecPattern = /[\\/]mocked[\\/].*\.mocked\.spec\.ts$/
const portableHumanReflowPattern = /human-reflow\.spec\.ts$/
const runPaths = resolvePlaywrightRunPaths('mocked-dev')

export default defineConfig({
  testDir: './e2e',
  testMatch: [mockedSpecPattern, portableHumanReflowPattern],
  // D0 只由专用配置采集，避免继承通用入口的视口和快照规则。
  testIgnore: [
    /[\\/]mocked[\\/]d0-visual-baseline\.mocked\.spec\.ts$/,
    /[\\/]mocked[\\/]d1b-workbench\.mocked\.spec\.ts$/,
    /[\\/]mocked[\\/]d1b-board\.mocked\.spec\.ts$/,
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: runPaths.outputDirectory,
  reporter: runPaths.isolated
    ? [
        ['list'],
        ['html', { open: 'never', outputFolder: runPaths.htmlReportDirectory }],
      ]
    : [['list']],
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `node e2e/project-work-preview-server.mjs --port=${apiPort} --origin=${webUrl}`,
      url: `${apiUrl}/api/v1/info`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `pnpm exec next dev --port ${webPort}`,
      url: webUrl,
      reuseExistingServer: false,
      timeout: 90_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: apiUrl,
      },
    },
  ],
})
