import { defineConfig } from '@playwright/test'
import d0 from './playwright.d0.config'

export default defineConfig({
  ...d0,
  testMatch: [/theme-unification\.spec\.ts$/, /[\\/]mocked[\\/]d1b-workbench\.mocked\.spec\.ts$/],
  // D0 的栅格、字体、时区、locale、viewport 与比较参数完整继承；独立保存输出。
  projects: [
    { name: 'desktop-light', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'desktop-dark', use: { viewport: { width: 1440, height: 1000 } } },
    // 原主题套件依赖桌面顶栏入口；移动端实际主题/导航由本面的定向用例验证。
    { name: 'mobile-light', testIgnore: /theme-unification\.spec\.ts$/, use: { viewport: { width: 390, height: 844 } } },
    { name: 'mobile-dark', testIgnore: /theme-unification\.spec\.ts$/, use: { viewport: { width: 390, height: 844 } } },
  ],
})
