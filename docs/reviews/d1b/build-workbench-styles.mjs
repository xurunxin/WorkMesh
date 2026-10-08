import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const read = path => readFileSync(resolve(root, path), 'utf8')
const require = createRequire(resolve(root, 'apps/web/package.json'))
const postcss = createRequire(require.resolve('next/package.json'))('postcss')
const registry = JSON.parse(read('apps/web/features/navigation/theme-token-migration.json'))
const mapping = new Map(registry.entries.map(entry => [entry.from, entry.to]))
const convert = value => value.replace(/--wm-[\w-]+/g, name => mapping.get(name) ?? name)
const scope = '[data-wm-token-surface="workbench"]'
const output = postcss.root()
output.append(postcss.rule({ selector: scope }).append(
  postcss.decl({ prop: 'color', value: 'var(--wm-ref-text-primary)' }),
  postcss.decl({ prop: 'background', value: 'var(--wm-ref-surface)' }),
  postcss.decl({ prop: 'font-family', value: 'var(--wm-ref-font-sans)' }),
))

// 共享原规则保留；复制的每个属性均由显式映射转换并强制限制到内容边界。
for (const path of ['packages/ui/src/tokens.css', 'apps/web/app/styles.css']) {
  postcss.parse(read(path), { from: path }).walkRules(rule => {
    const selected = rule.selectors.filter(selector => path.startsWith('packages/')
      ? /\.wm-(button|tool-chip|data-table)|^\.wm-theme :where/.test(selector)
      : /\.rich-editor/.test(selector) || /^\.app-shell (button|input|textarea|select|\.wm-button:focus-visible)/.test(selector))
    if (!selected.length) return
    const declarations = rule.nodes.filter(node => node.type === 'decl' && node.value.includes('var(--wm-'))
    if (!declarations.length) return
    const clone = postcss.rule({ selector: selected.map(selector => {
      const pseudo = selector.indexOf('::')
      const guard = `:is(${scope}, ${scope} *)`
      return pseudo < 0 ? selector + guard : selector.slice(0, pseudo) + guard + selector.slice(pseudo)
    }).join(',\n') })
    for (const declaration of declarations) clone.append(declaration.clone({ value: convert(declaration.value) }))
    let parent = clone
    for (let ancestor = rule.parent; ancestor?.type === 'atrule'; ancestor = ancestor.parent) {
      assert(!ancestor.name.includes('keyframes'), '不能改写 keyframes')
      parent = postcss.atRule({ name: ancestor.name, params: ancestor.params }).append(parent)
    }
    output.append(parent)
  })
}
writeFileSync(resolve(root, 'apps/web/features/workbench/workbench-shared.css'), '/* 由 D1b 显式映射生成；共享原件保留至全矩阵验收。 */\n' + output.toString() + '\n')

const markdownPath = 'apps/web/features/rich-content/markdown.module.css'
const markdown = postcss.parse(read(markdownPath), { from: markdownPath })
assert(!markdown.toString().includes('D1b 工作台局部分支'), '不得重复生成迁移分支')
const additions = []
markdown.walkRules(rule => {
  const declarations = rule.nodes.filter(node => node.type === 'decl' && node.value.includes('var(--wm-'))
  if (!declarations.length) return
  const clone = postcss.rule({ selector: rule.selectors.map(selector => `:global(${scope}) ${selector}`).join(',\n') })
  for (const declaration of declarations) clone.append(declaration.clone({ value: convert(declaration.value) }))
  let parent = clone
  for (let ancestor = rule.parent; ancestor?.type === 'atrule'; ancestor = ancestor.parent) parent = postcss.atRule({ name: ancestor.name, params: ancestor.params }).append(parent)
  additions.push(parent)
})
markdown.append(postcss.comment({ text: 'D1b 工作台局部分支；其他 RichContent 调用仍消费历史槽' }), ...additions)
writeFileSync(resolve(root, markdownPath), markdown.toString() + '\n')

const localPath = 'apps/web/features/workbench/conversation-workbench.module.css'
const local = postcss.parse(read(localPath), { from: localPath })
local.walkDecls(declaration => { declaration.value = convert(declaration.value) })
writeFileSync(resolve(root, localPath), local.toString())

const tokenPath = 'packages/ui/src/tokens.css'
const tokens = postcss.parse(read(tokenPath), { from: tokenPath })
for (const binding of registry.existingRefDarkRebindings) tokens.walkDecls(binding.from, declaration => {
  if (declaration.parent.selector === "[data-wm-theme='dark']") declaration.value = binding.newValue
})
const declarations = new Map()
const add = (selector, name, value) => {
  const key = `${selector}|${name}`
  assert(!declarations.has(key) || declarations.get(key).value === value, `映射覆盖冲突 ${key}`)
  declarations.set(key, { selector, name, value })
}
for (const entry of registry.entries) for (const declaration of entry.declarations) {
  if (!declaration.emitsDeclaration) continue
  let present = false
  tokens.walkDecls(entry.to, node => { if (node.parent.selector === declaration.selector) { assert.equal(node.value, declaration.newValue); present = true } })
  if (!present) add(declaration.selector, entry.to, declaration.newValue)
}
// 明色子树恢复颜色而不重置密度；每个边界重新计算依赖本层的公式。
const themed = registry.entries.filter(entry => entry.declarations.some(declaration => declaration.selector === "[data-wm-theme='dark']"))
for (const entry of themed) {
  const light = entry.declarations.find(declaration => declaration.selector === ':root')
  if (light?.emitsDeclaration) add("[data-wm-theme='light']", entry.to, light.newValue)
}
add("[data-wm-theme='light']", '--wm-ref-text-dim', '#a8a29e')
const derived = ['--wm-surface-panel', '--wm-border-panel', '--wm-grad-accent', '--wm-focus-ring']
for (const selector of registry.derivedReDeclaration.scopes) for (const from of derived) {
  const entry = registry.entries.find(entry => entry.from === from)
  const declaration = entry.declarations.find(declaration => selector.includes("theme='dark'") && declaration.selector === "[data-wm-theme='dark']") ?? entry.declarations.find(declaration => declaration.selector === ':root')
  // compact 自身继承主题的 focus 比例；由本层辅助槽读取当前主题。
  const value = from === '--wm-focus-ring' ? '0 0 0 3px color-mix(in srgb, var(--wm-ref-focus) var(--wm-ref-focus-opacity), transparent)' : declaration.newValue
  declarations.set(`${selector}|${entry.to}`, { selector, name: entry.to, value })
}
add(':root', '--wm-ref-focus-opacity', '32%')
add("[data-wm-theme='light']", '--wm-ref-focus-opacity', '32%')
add("[data-wm-theme='dark']", '--wm-ref-focus-opacity', '40%')
tokens.append(postcss.comment({ text: 'D1b 新槽补齐与同值暗色重绑定；旧声明待全矩阵验收后退役' }))
for (const selector of [...new Set([...declarations.values()].map(declaration => declaration.selector))]) {
  const rule = postcss.rule({ selector })
  for (const declaration of declarations.values()) if (declaration.selector === selector) rule.append(postcss.decl({ prop: declaration.name, value: declaration.value }))
  tokens.append(rule)
}
writeFileSync(resolve(root, tokenPath), tokens.toString() + '\n')
