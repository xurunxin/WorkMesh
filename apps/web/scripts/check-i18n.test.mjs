import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkSources } from './check-i18n.mjs'

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.virtual-i18n-fixtures')
const fixturePath = path => resolve(fixtureRoot, path)

function source(path, text) {
  return { path: fixturePath(path), text }
}

function validI18nSource(extra = '') {
  return `export type Locale = 'zh-CN' | 'en'
export type TranslationKey = 'hello' | 'bye'
export type LocalCopy = {
  label: string
  nested: { title: string }
  format: (value: string) => string
}
const messages: Record<Locale, Record<TranslationKey, string>> = {
  'zh-CN': { hello: '你好', bye: '再见' },
  en: { hello: 'Hello', bye: 'Bye' },
}
const localCopies: Record<Locale, LocalCopy> = {
  'zh-CN': { label: '标签', nested: { title: '标题' }, format: value => \`值 \${value}\` },
  en: { label: 'Label', nested: { title: 'Title' }, format: value => \`Value \${value}\` },
}
export type LocaleContextValue = { t: (key: TranslationKey) => string }
export function useLocale(): LocaleContextValue { throw new Error('fixture') }
${extra}`
}

function runFixture({
  i18n = validI18nSource(),
  components = [],
  inventory = ['messages', 'localCopies'],
  copyContracts = {},
  partialOmissionAllowlist = [],
  hardcodedCopyAllowlist = [],
} = {}) {
  return checkSources({
    i18nSource: source('apps/web/app/lib/i18n.tsx', i18n),
    componentSources: components,
    copyContracts,
    partialOmissionAllowlist,
    hardcodedCopyAllowlist,
    localeTableInventory: inventory,
    repoRoot: fixtureRoot,
  })
}

function codes(result) {
  return result.diagnostics.map(diagnostic => diagnostic.code)
}

test('accepts a complete pair and checker-resolved alias, member, destructured, and injected translators', () => {
  const component = source('apps/web/app/page.ts', `import { useLocale as useLanguage } from './lib/i18n'
export function translateAll(injected: (key: 'hello' | 'bye') => string) {
  const locale = useLanguage()
  const { t: renamed } = locale
  return [locale.t('hello'), renamed('bye'), injected('hello')]
}`)
  const result = runFixture({ components: [component] })
  assert.deepEqual(result, { ok: true, exitCode: 0, diagnostics: [] })
})

test('reports flat locale drift plus unknown and dynamic translator calls at stable locations', () => {
  const i18n = validI18nSource()
    .replace("'zh-CN': { hello: '你好', bye: '再见' }", "'zh-CN': { hello: '你好', bye: '再见', extra: '多余' }")
    .replace("en: { hello: 'Hello', bye: 'Bye' }", "en: { hello: 'Hello' }")
  const component = source('apps/web/app/page.ts', `import { useLocale } from './lib/i18n'
export function bad(key: 'hello' | 'bye') {
  const { t } = useLocale()
  t('missing')
  return t(key)
}`)
  const result = runFixture({ i18n, components: [component] })
  assert.equal(result.ok, false)
  assert.equal(result.exitCode, 1)
  assert.deepEqual(codes(result), [
    'I18N_LOCALE_KEY_EXTRA',
    'I18N_LOCALE_KEY_MISSING',
    'I18N_TRANSLATOR_UNKNOWN_KEY',
    'I18N_TRANSLATOR_DYNAMIC_KEY',
  ])
  assert.deepEqual(
    result.diagnostics.slice(2).map(({ code, path, line, column }) => ({ code, path, line, column })),
    [
      { code: 'I18N_TRANSLATOR_UNKNOWN_KEY', path: 'apps/web/app/page.ts', line: 4, column: 5 },
      { code: 'I18N_TRANSLATOR_DYNAMIC_KEY', path: 'apps/web/app/page.ts', line: 5, column: 12 },
    ],
  )
})

const importedCopySource = source('apps/web/features/imported-copy.ts', `export type ImportedCopy = {
  label: string
  nested: { title: string }
  format: (value: string) => string
}`)

function importedPartialI18n(zhBody, enBody) {
  return `import type { ImportedCopy as ImportedAlias } from '../../features/imported-copy'
export type Locale = 'zh-CN' | 'en'
export type TranslationKey = 'hello'
const messages: Record<Locale, Record<TranslationKey, string>> = {
  'zh-CN': { hello: '你好' },
  en: { hello: 'Hello' },
}
const importedCopies: Record<Locale, Partial<ImportedAlias>> = {
  'zh-CN': { ${zhBody} },
  en: { ${enBody} },
}`
}

test('resolves an imported Partial contract and rejects a bilateral omission without permission', () => {
  const i18n = importedPartialI18n("label: '标签', format: value => value", "label: 'Label', format: value => value")
  const result = runFixture({
    i18n,
    components: [importedCopySource],
    inventory: ['messages', 'importedCopies'],
  })
  assert.deepEqual(codes(result), ['I18N_PARTIAL_OMISSION_UNALLOWED'])
  assert.match(result.diagnostics[0].message, /importedCopies.*nested/)
})

test('accepts only an exact bilateral Partial omission allowlist entry', () => {
  const i18n = importedPartialI18n("label: '标签', format: value => value", "label: 'Label', format: value => value")
  const result = runFixture({
    i18n,
    components: [importedCopySource],
    inventory: ['messages', 'importedCopies'],
    partialOmissionAllowlist: [{ table: 'importedCopies', key: 'nested' }],
  })
  assert.deepEqual(result, { ok: true, exitCode: 0, diagnostics: [] })
})

test('rejects unilateral Partial omission even when allowlisted and reports stale entries', () => {
  const unilateral = runFixture({
    i18n: importedPartialI18n("label: '标签', format: value => value, nested: { title: '标题' }", "label: 'Label', nested: { title: 'Title' }"),
    components: [importedCopySource],
    inventory: ['messages', 'importedCopies'],
    partialOmissionAllowlist: [{ table: 'importedCopies', key: 'format' }],
  })
  assert.deepEqual(codes(unilateral), ['I18N_PARTIAL_OMISSION_UNILATERAL'])

  const stale = runFixture({
    i18n: importedPartialI18n("label: '标签', format: value => value, nested: { title: '标题' }", "label: 'Label', format: value => value, nested: { title: 'Title' }"),
    components: [importedCopySource],
    inventory: ['messages', 'importedCopies'],
    partialOmissionAllowlist: [{ table: 'importedCopies', key: 'format' }],
  })
  assert.deepEqual(codes(stale), ['I18N_PARTIAL_ALLOWLIST_STALE'])
})

test('recursively detects nested missing and empty values plus function/string shape mismatches', () => {
  const i18n = validI18nSource()
    .replace("'zh-CN': { label: '标签', nested: { title: '标题' }, format: value => `值 ${value}` }", "'zh-CN': { label: value => value, nested: {}, format: value => `值 ${value}` }")
    .replace("en: { label: 'Label', nested: { title: 'Title' }, format: value => `Value ${value}` }", "en: { label: '   ', nested: { title: '  ' }, format: 'format' }")
  const result = runFixture({ i18n })
  assert.deepEqual(codes(result), [
    'I18N_LOCALE_SHAPE_MISMATCH',
    'I18N_LOCALE_KEY_MISSING',
    'I18N_LOCALE_VALUE_EMPTY',
    'I18N_LOCALE_VALUE_EMPTY',
    'I18N_LOCALE_SHAPE_MISMATCH',
  ])
})

const hardcodedComponentText = `export function Page() {
  return <main className="page" data-testid="page">
    <code>agent.session.created</code>
    <span>/api/v1/agents</span>
    <h1>Hello world</h1>
    <button aria-label="Search issues" title="Open search">Go</button>
    <input placeholder={'Find issue'} />
    <input pattern="[A-Z]+" placeholder="ENG" />
    <img alt="WorkMesh logo" />
  </main>
}`

test('finds visible JSX and all UI-facing attributes while structurally ignoring routes, protocol IDs, CSS, and test IDs', () => {
  const component = source('apps/web/app/page.tsx', hardcodedComponentText)
  const result = runFixture({ components: [component] })
  assert.deepEqual(result.diagnostics.map(({ code, line, message }) => ({ code, line, message })), [
    { code: 'I18N_HARDCODED_UI_COPY', line: 5, message: "Hardcoded jsx-text copy 'Hello world' requires localized copy or an exact allowlist entry." },
    { code: 'I18N_HARDCODED_UI_COPY', line: 6, message: "Hardcoded aria-label copy 'Search issues' requires localized copy or an exact allowlist entry." },
    { code: 'I18N_HARDCODED_UI_COPY', line: 6, message: "Hardcoded title copy 'Open search' requires localized copy or an exact allowlist entry." },
    { code: 'I18N_HARDCODED_UI_COPY', line: 6, message: "Hardcoded jsx-text copy 'Go' requires localized copy or an exact allowlist entry." },
    { code: 'I18N_HARDCODED_UI_COPY', line: 7, message: "Hardcoded placeholder copy 'Find issue' requires localized copy or an exact allowlist entry." },
    { code: 'I18N_HARDCODED_UI_COPY', line: 9, message: "Hardcoded alt copy 'WorkMesh logo' requires localized copy or an exact allowlist entry." },
  ])
})

test('uses exact hardcoded-copy allowlists and rejects unmatched or stale entries', () => {
  const component = source('apps/web/app/page.tsx', '<h1>Hello world</h1>')
  const accepted = runFixture({
    components: [component],
    hardcodedCopyAllowlist: [{ path: 'apps/web/app/page.tsx', kind: 'jsx-text', literal: 'Hello world' }],
  })
  assert.deepEqual(accepted, { ok: true, exitCode: 0, diagnostics: [] })

  const rejected = runFixture({
    components: [component],
    hardcodedCopyAllowlist: [{ path: 'apps/web/app/page.tsx', kind: 'title', literal: 'Hello world' }],
  })
  assert.deepEqual(codes(rejected), ['I18N_HARDCODED_ALLOWLIST_STALE', 'I18N_HARDCODED_UI_COPY'])
})

test('rejects spread, computed, duplicate, shorthand, and unknown locale tables', () => {
  const i18n = `export type Locale = 'zh-CN' | 'en'
export type TranslationKey = 'hello'
type LocalCopy = { label: string }
const messages: Record<Locale, Record<TranslationKey, string>> = {
  'zh-CN': { hello: '你好' }, en: { hello: 'Hello' },
}
const base = { label: 'Base' }
const unknownCopies: Record<Locale, LocalCopy> = {
  'zh-CN': { ...base, ['label']: '标签', label: '标签', label: '重复' },
  en: { base },
}`
  const result = runFixture({ i18n, inventory: ['messages'] })
  assert.equal(result.exitCode, 1)
  assert.ok(codes(result).includes('I18N_UNKNOWN_LOCALE_TABLE'))
  assert.ok(codes(result).includes('I18N_UNSUPPORTED_OBJECT_MEMBER'))
  assert.ok(codes(result).includes('I18N_COMPUTED_KEY'))
  assert.ok(codes(result).includes('I18N_DUPLICATE_KEY'))
})

test('sorts multiple diagnostics by normalized path, line, column, and code', () => {
  const result = runFixture({
    components: [
      source('apps/web/features/zeta.tsx', '<p>Zeta copy</p>'),
      source('apps/web/app/alpha.tsx', '<p>Alpha copy</p>'),
    ],
  })
  assert.deepEqual(result.diagnostics.map(diagnostic => diagnostic.path), [
    'apps/web/app/alpha.tsx',
    'apps/web/features/zeta.tsx',
  ])
})
