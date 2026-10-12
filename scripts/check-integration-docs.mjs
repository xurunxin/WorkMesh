import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireBootstrap = createRequire(resolve(root, 'scripts/ci-bootstrap/package.json'))
const { parse } = requireBootstrap('yaml')
const read = path => readFileSync(resolve(root, path), 'utf8')
const source = JSON.parse(read('docs/skills/zh-tech-writing/source.json'))
for (const file of source.files) {
  const bytes = readFileSync(resolve(root, 'docs/skills/zh-tech-writing', file.path))
  assert.equal(bytes.length, file.bytes, `技能字节数变化：${file.path}`)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `技能来源变化：${file.path}`)
  assert.equal(file.url, `https://raw.githubusercontent.com/leter/zh-tech-writing/${source.commit}/${file.path.replace('upstream/', '')}`)
}
const files = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'docs/documentation-maintenance.md',
  'docs/skills/zh-tech-writing/README.md',
  ...readdirSync(resolve(root, 'docs/integration')).filter(name => name.endsWith('.md')).map(name => `docs/integration/${name}`)]
let links = 0
for (const path of files) {
  const prose = read(path).replace(/```[^\n]*\n[\s\S]*?```/g, '')
  for (const match of prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1]
    if (/^(https?:|mailto:|#)/.test(link)) continue
    const target = decodeURIComponent(link.split('#')[0])
    assert.ok(existsSync(resolve(root, dirname(path), target)), `失效链接：${path} → ${link}`)
    links++
  }
}
const api = parse(read('OPENAPI.yaml'))
const dereference = value => value?.$ref
  ? dereference(value.$ref.slice(2).split('/').reduce((node, key) => node[key.replaceAll('~1', '/').replaceAll('~0', '~')], api))
  : value
const reference = read('docs/integration/reference.md')
let endpoints = 0
for (const match of reference.matchAll(/`(GET|POST|PUT|PATCH|DELETE) ([^` ]+)`/g)) {
  assert.ok(dereference(api.paths[match[2]])?.[match[1].toLowerCase()], `参考端点不存在：${match[1]} ${match[2]}`)
  endpoints++
}
const registry = read('apps/mcp/src/index.ts') + read('apps/mcp/src/discovery.ts')
const toolTable = reference.split('## 常用 MCP 工具')[1].split('## 配置与扩展')[0]
let tools = 0
for (const match of toolTable.matchAll(/^\| `([a-z_]+)`/gm)) {
  assert.ok(registry.includes(`registerTool('${match[1]}'`), `参考工具没有显式注册：${match[1]}`)
  tools++
}
execFileSync(process.execPath, ['--check', resolve(root, 'docs/integration/examples/human.mjs')])
console.log(JSON.stringify({ skillFiles: source.files.length, localLinks: links, restEndpoints: endpoints, mcpTools: tools,
  humanSyntax: 'passed', scope: '静态检查；真实请求与中文语义须另验' }))
