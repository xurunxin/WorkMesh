import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(resolve('apps/web/package.json'))
const postcss = createRequire(require.resolve('next/package.json'))('postcss')
const registry = JSON.parse(readFileSync('apps/web/features/navigation/theme-token-migration.json'))
const mapping = new Map(registry.entries.map(entry => [entry.from, entry.to]))
const convert = value => value.replace(/--wm-[\w-]+/g, name => mapping.get(name) ?? name)
const scope = '[data-wm-token-surface="board"]'
const output = postcss.root()
output.append(postcss.rule({ selector: scope }).append(
  postcss.decl({ prop: 'color', value: 'var(--wm-ref-text-primary)' }),
  postcss.decl({ prop: 'background', value: 'var(--wm-ref-surface)' }),
  postcss.decl({ prop: 'font-family', value: 'var(--wm-ref-font-sans)' }),
))
for (const path of ['packages/ui/src/tokens.css', 'apps/web/app/styles.css']) {
  postcss.parse(readFileSync(path, 'utf8'), { from: path }).walkRules(rule => {
    const selected = rule.selectors.filter(selector => /\.wm-(work-item|work-surface|filter|button|tool-chip|tag|badge)|\.work-surfaces|\.work-surface-|\.skeleton|^\.wm-theme :where|^\.app-shell (button|input|textarea|select)/.test(selector))
    const declarations = rule.nodes.filter(node => node.type === 'decl' && node.value.includes('var(--wm-'))
    if (!selected.length || !declarations.length) return
    const guard = `:is(${scope}, ${scope} *)`
    const clone = postcss.rule({ selector: selected.map(selector => {
      const pseudo = selector.indexOf('::')
      return pseudo < 0 ? selector + guard : selector.slice(0, pseudo) + guard + selector.slice(pseudo)
    }).join(',\n') })
    for (const declaration of declarations) clone.append(declaration.clone({ value: convert(declaration.value) }))
    let parent = clone
    for (let ancestor = rule.parent; ancestor?.type === 'atrule'; ancestor = ancestor.parent) {
      assert(!ancestor.name.includes('keyframes'))
      parent = postcss.atRule({ name: ancestor.name, params: ancestor.params }).append(parent)
    }
    output.append(parent)
  })
}
writeFileSync('apps/web/features/work-items/board-shared.css', '/* D1b 看板局部映射；列表、项目导航、详情及共享portal保留原规则。 */\n' + output.toString().trimEnd() + '\n')
