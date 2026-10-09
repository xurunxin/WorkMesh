import { defineConfig } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mockedConfig from '../../../../apps/web/playwright.mocked.config'

const directory = dirname(fileURLToPath(import.meta.url))
const web = resolve(directory, '../../../../apps/web')

// 只采集当前组件恢复状态；传输夹具不作为安装、授权或领域验收。
export default defineConfig({
  ...mockedConfig,
  testDir: directory,
  testMatch: 'capture.spec.ts',
  testIgnore: [],
  timeout: 120_000,
  retries: 0,
  use: {
    ...mockedConfig.use,
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'zh-CN',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--disable-gpu', '--disable-skia-runtime-opts', '--force-color-profile=srgb', '--disable-partial-raster'] },
  },
  webServer: (Array.isArray(mockedConfig.webServer) ? mockedConfig.webServer : []).map(server => ({ ...server, cwd: web })),
})
