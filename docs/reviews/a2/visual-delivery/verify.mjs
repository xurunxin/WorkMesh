import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, extname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { readEvidence } from '../read-evidence-bytes.mjs'

const directory = import.meta.dirname
const root = resolve(directory, '../../../..')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const source = JSON.parse(readFileSync(resolve(directory, 'source.json'), 'utf8'))
const gitMode = process.argv.includes('--git')
const git = args => {
  const result = spawnSync('git', args, { cwd: root, windowsHide: true })
  if (result.status !== 0) throw Error(`Git 核验失败：${args.join(' ')}`)
  return result.stdout
}
const read = path => gitMode ? git(['show', `HEAD:docs/reviews/a2/visual-delivery/${path}`]) : readFileSync(resolve(directory, path))
for (const item of source.images) {
  const copy = read(item.path)
  if (sha(copy) !== item.sha256 || !copy.equals(readEvidence(resolve(root, item.source)))) throw Error(`图片来源字节不一致：${item.path}`)
}
for (const item of source.immutableInputs) if (sha(readEvidence(resolve(root, item.path))) !== item.sha256) throw Error(`历史原件变化：${item.path}`)
for (const phase of ['before', 'after']) {
  const snapshot = JSON.parse(readFileSync(resolve(root, source.localCapture[`source${phase === 'before' ? 'Before' : 'After'}`]), 'utf8'))
  for (const entry of snapshot.entries) {
    if (sha(readFileSync(resolve(root, entry.path))) !== entry.worktree.sha256) throw Error(`局部采集输入变化：${entry.path}`)
    if (entry.gitBlob && sha(git(['show', `HEAD:${entry.path}`])) !== entry.gitBlob.sha256) throw Error(`产品 Git blob 变化：${entry.path}`)
  }
}
const diff = git(['diff', '--name-only', source.preparedFromHead, 'HEAD']).toString().trim().split(/\r?\n/).filter(Boolean)
if (diff.some(path => !path.startsWith('docs/reviews/a2/visual-delivery/'))) throw Error('本轮提交越出视觉材料范围')
const receipt = { scope: '视觉材料资源/PNG 解码核验；非产品或人工视觉验收', gitMode, head: git(['rev-parse', 'HEAD']).toString().trim(),
  start: new Date().toISOString(), resources: [{ type: 'static-preview', owner: 'a2-visual-delivery', host: '127.0.0.1', port: null, plannedBeforeListen: true, cleanup: null }],
  sourceSha256: sha(read('source.json')), htmlSha256: sha(read('index.html')), cssSha256: sha(read('style.css')), results: [], imageCount: source.images.length }
const save = () => { if (!gitMode) writeFileSync(resolve(directory, 'verification.json'), JSON.stringify(receipt, null, 2) + '\n') }
save()
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html'
  const resolved = resolve(directory, path)
  if (!resolved.startsWith(directory + '/') && !resolved.startsWith(directory + '\\')) { response.writeHead(403); response.end(); return }
  try {
    const bytes = read(path)
    response.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json; charset=utf-8' })[extname(path)] ?? 'application/octet-stream')
    response.end(bytes)
  } catch { response.writeHead(404); response.end() }
})
let browser
try {
  await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady))
  receipt.resources[0].port = server.address().port; save()
  const require = createRequire(resolve(root, 'apps/web/package.json'))
  const { chromium } = require('@playwright/test')
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const origin = `http://127.0.0.1:${server.address().port}`
  await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' })
  const references = await page.evaluate(() => Array.from(document.querySelectorAll('[src],[href]')).map(element => element.getAttribute('src') ?? element.getAttribute('href')))
  for (const reference of references) {
    if (!reference || reference.startsWith('#')) continue
    if (/^(\/|https?:|data:)/.test(reference)) throw Error(`资源不为相对路径：${reference}`)
    const response = await page.request.get(`${origin}/${reference}`)
    if (!response.ok()) throw Error(`资源不可达：${reference}`)
  }
  const decoded = await page.locator('img').evaluateAll(async elements => {
    for (const image of elements) await image.decode()
    return elements.map(image => ({ path: image.getAttribute('src'), width: image.naturalWidth, height: image.naturalHeight, complete: image.complete }))
  })
  if (decoded.length !== source.images.length) throw Error('PNG 数量不一致')
  for (const item of decoded) {
    const recorded = source.images.find(image => image.path === item.path)
    if (!item.complete || item.width !== recorded.width || item.height !== recorded.height) throw Error(`PNG 不可解码：${item.path}`)
  }
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    if (overflow) throw Error('交付页发生横向溢出')
    receipt.results.push({ viewport, allRelativeResourcesReachable: true, decodedPngCount: decoded.length, horizontalOverflow: false })
  }
  if (errors.length) throw Error(`预览脚本错误：${errors.join(', ')}`)
  receipt.pageErrors = errors
  receipt.decodedImages = decoded
  if (!gitMode) {
    await page.setViewportSize({ width: 1440, height: 1000 })
    const bytes = await page.screenshot({ path: resolve(directory, 'gallery-preview.png'), fullPage: true })
    receipt.galleryPreview = { path: 'gallery-preview.png', scope: '审阅材料页面渲染，不是产品截图或 D0 基线', bytes: bytes.length, sha256: sha(bytes) }
  }
  receipt.code = 0
} catch (error) { receipt.code = 1; receipt.error = String(error); process.exitCode = 1 }
finally {
  await browser?.close()
  await new Promise(resolveClosed => server.close(resolveClosed))
  receipt.resources[0].cleanup = { browserClosed: true, serverListening: server.listening, result: '仅本轮静态预览服务正常关闭，未占用固定端口或终止其他服务' }
  receipt.end = new Date().toISOString(); save()
  console.log(JSON.stringify({ code: receipt.code, gitMode, head: receipt.head, images: receipt.imageCount, resourceChecks: receipt.results, cleanup: receipt.resources[0].cleanup }))
}
