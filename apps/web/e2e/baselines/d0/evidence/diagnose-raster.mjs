// 从仓库根目录执行；生成的诊断只验证原始帧和布局，不代替 D0 的基线验收。
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
const source = await readFile('apps/web/e2e/mocked/d0-visual-baseline.mocked.spec.ts', 'utf8')
const style = path.resolve('apps/web/e2e/mocked/d0-screenshot.css').replaceAll('\\', '/')
const tokens = path.resolve('packages/ui/src/tokens.css').replaceAll('\\', '/')
await mkdir('.tmp', { recursive: true })
const diagnostics = source
  .replace("fileURLToPath(new URL('./d0-screenshot.css', import.meta.url))", JSON.stringify(style))
  .replace("new URL('../../../../packages/ui/src/tokens.css', import.meta.url)", JSON.stringify(tokens))
  .replace('for (const surface of surfaces)', "for (const surface of surfaces.filter(surface => surface.slug === 'issue-detail'))")
  .replace('覆盖、两次采集一致、D1 可直接比对', '仅诊断原始帧和布局')
  .replace('await expect(page).toHaveScreenshot(`${surface.slug}.png`, screenshotOptions)', '// 诊断运行只采原始帧，不更新或验收基线。')
  .replace('captures.push(bytes)', `await writeFile(testInfo.outputPath('render-state-' + capture + '.json'), JSON.stringify(await page.evaluate(() => ({
    activeElement: document.activeElement?.outerHTML,
    viewport: { width: innerWidth, height: innerHeight },
    elements: Array.from(document.querySelectorAll('.work-item-full-page, .work-item-detail, .work-item-detail-toolbar, .work-item-execution-workspace > section, .work-item-execution-header, select')).map(element => {
      const style = getComputedStyle(element)
      return { selector: element.className, tag: element.tagName, rect: element.getBoundingClientRect().toJSON(), scrollTop: element.scrollTop, styles: Object.fromEntries(['color', 'background-color', 'background-image', 'border-color', 'border-radius', 'transform', 'opacity', 'filter', 'backdrop-filter', 'position'].map(key => [key, style.getPropertyValue(key)])) }
    }),
    animations: document.getAnimations().map(animation => ({state: animation.playState, time: animation.currentTime})),
  })), null, 2))\n          captures.push(bytes)`)
if (!diagnostics.includes('// 诊断运行只采原始帧') || diagnostics.includes('await expect(page).toHaveScreenshot')) {
  throw new Error('D0 测试结构已变化，须复核诊断生成器，不得静默改变验收范围')
}
await writeFile('.tmp/d0-diagnostic.spec.ts', diagnostics)
await writeFile('.tmp/d0-diagnostic.config.ts', `import { defineConfig } from '@playwright/test'
import d0 from '../apps/web/playwright.d0.config'
export default defineConfig({
  ...d0, testDir: '.', testMatch: /d0-diagnostic\\.spec\\.ts$/, testIgnore: [],
  snapshotPathTemplate: '${path.resolve('apps/web/e2e/baselines/d0').replaceAll('\\', '/')}/{platform}/{projectName}/{arg}{ext}',
  use: { ...d0.use, launchOptions: { args: [...(d0.use?.launchOptions?.args ?? []).filter(arg => arg !== '--disable-partial-raster'), ...(process.env.D0_EXTRA_LAUNCH_ARGS ?? '').split('|').filter(Boolean)] } },
  webServer: Array.isArray(d0.webServer) ? d0.webServer.map(server => ({...server, cwd: '${path.resolve('apps/web').replaceAll('\\', '/')}'})) : d0.webServer,
})\n`)
