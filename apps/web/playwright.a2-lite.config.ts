import { defineConfig } from '@playwright/test'
import path from 'node:path'

const baseURL = process.env.WORKMESH_A2_LITE_URL
const output = process.env.WORKMESH_PLAYWRIGHT_RUN_DIR
if (process.env.WORKMESH_A2_LITE !== '1' || !baseURL || !output || !path.isAbsolute(output)) throw Error('Lite 验收需要真实部署 URL 和独有绝对输出目录')
export default defineConfig({
  testDir: './e2e', testMatch: 'configuration-readiness.spec.ts', grep: /@lite/,
  workers: 1, fullyParallel: false, timeout: 90_000,
  outputDir: path.join(output, 'output'), reporter: [['list']],
  use: { baseURL, screenshot: 'only-on-failure', trace: 'off' },
})
