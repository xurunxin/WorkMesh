import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve, extname } from 'node:path'

const root = resolve('.')
const require = createRequire(resolve('package.json'))
const { chromium } = require('@playwright/test')
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.png': 'image/png' }
const server = createServer((request, response) => {
  try {
    const file = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname))
    if (relative(root, file).startsWith('..') || !existsSync(file)) { response.writeHead(404); response.end(); return }
    response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream' })
    response.end(readFileSync(file))
  } catch { response.writeHead(500); response.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address(), startedAt = new Date().toISOString()
let browser, result, error
try {
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const failures = []
  page.on('pageerror', failure => failures.push(failure.message))
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`) })
  await page.goto(`http://127.0.0.1:${address.port}/docs/reviews/d1b/board-visual-review.html`)
  await page.waitForFunction(() => document.querySelectorAll('#combination option').length === 140)
  let decoded = 0, links = 0
  for (let index = 0; index < 140; index++) {
    await page.locator('#combination').selectOption(String(index))
    decoded += await page.evaluate(async () => {
      const images = [...document.querySelectorAll('img')].filter(image => !image.hidden)
      await Promise.all(images.map(image => image.decode()))
      if (images.some(image => image.naturalWidth === 0)) throw new Error('图像未完成解码')
      return images.length
    })
    for (const href of await page.locator('a[href]').evaluateAll(anchors => anchors.map(anchor => anchor.href))) {
      assert((await page.request.get(href)).ok(), `实际评审链接读取失败：${href}`)
      links++
    }
  }
  assert.deepEqual(failures, [])
  result = { combinations: 140, decodedImages: decoded, loadedLinks: links, failures, browser: browser.version() }
} catch (failure) { error = failure.stack; process.exitCode = 1 }
finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
  writeFileSync('docs/reviews/d1b/evidence/board/local-preview.json', JSON.stringify({
    startedAt, finishedAt: new Date().toISOString(), pid: process.pid, port: address.port,
    source: '本机临时HTTP服务实际浏览器解码和链接请求；不是Todos Files/preview宿主测试',
    result: result ?? null, error: error ?? null, cleanup: { browserClosed: true, serverClosed: true },
    hostPreviewTested: false, humanReview: 'pending' }, null, 2) + '\n')
}
