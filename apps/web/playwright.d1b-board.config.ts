import { defineConfig } from '@playwright/test'
import d1b from './playwright.d1b.config'

export default defineConfig({
  ...d1b,
  testMatch: /[\\/]mocked[\\/]d1b-board\.mocked\.spec\.ts$/,
})
