import { defineConfig } from '@playwright/test'
import d0 from './playwright.d0.config'

export default defineConfig({
  ...d0,
  testMatch: [/theme-unification\.spec\.ts$/, /[\\/]mocked[\\/]d1b-workbench\.mocked\.spec\.ts$/],
  // D0 的栅格、字体、时区、locale、viewport 与比较参数完整继承；独立保存输出。
  projects: [
    { name: 'desktop-light', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'desktop-dark', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-light', use: { viewport: { width: 390, height: 844 } } },
    { name: 'mobile-dark', use: { viewport: { width: 390, height: 844 } } },
  ],
})
