import { defineConfig } from '@playwright/test'
import mockedConfig from './playwright.mocked.config'

export default defineConfig({
  ...mockedConfig,
  testMatch: /[\\/]mocked[\\/]d0-visual-baseline\.mocked\.spec\.ts$/,
  // 显式解除通用 mocked-dev 入口对 D0 的排除。
  testIgnore: [],
  timeout: 120_000,
  retries: 0,
  snapshotPathTemplate: '{testDir}/baselines/d0/{platform}/{projectName}/{arg}{ext}',
  // 圆角边缘可能有每通道 1 的取整差异；不允许超出该微小颜色阈值的像素变化。
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixels: 0, threshold: 0.005 } },
  use: {
    ...mockedConfig.use,
    browserName: 'chromium',
    // 禁用部分栅格复用；详情圆角在相同布局下出现过上下文间 RGB 取整差异，证据见 D0 诊断记录。
    launchOptions: { args: ['--disable-gpu', '--disable-skia-runtime-opts', '--force-color-profile=srgb', '--disable-partial-raster'] },
    colorScheme: 'light',
    locale: 'zh-CN',
    timezoneId: 'UTC',
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: 'reduce' },
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop-1440x1000', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-390x844', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: mockedConfig.webServer instanceof Array
    ? mockedConfig.webServer.map(server => ({
        ...server,
        env: { ...server.env, NEXT_DEV_API_UPSTREAM: 'http://127.0.0.1:3201' },
      }))
    : mockedConfig.webServer,
})
