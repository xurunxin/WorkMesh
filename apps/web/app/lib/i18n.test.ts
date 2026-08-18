import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, beforeEach } from 'vitest'
import { LocaleProvider, useLocale } from './i18n'

// Minimal DOM polyfill so the test can run under vitest's default
// node environment without adding jsdom/happy-dom. The polyfill is
// scoped to the test file; the production web build uses Next's
// browser environment.
type CookieJar = { value: string }
type StorageJar = { items: Map<string, string> }
const g = globalThis as unknown as { document?: CookieJar; window?: { localStorage: StorageJar } }
if (!g.document) g.document = { value: '' }
if (!g.window) g.window = { localStorage: { items: new Map<string, string>() } }
const cookieJar = g.document
const storageJar = g.window.localStorage
function readCookie(name: string): string | null {
  const match = cookieJar.value.split('; ').find(entry => entry.startsWith(`${name}=`))
  return match ? match.slice(name.length + 1) : null
}

function Probe() {
  const ctx = useLocale()
  return createElement('pre', null, JSON.stringify({
    keys: Object.keys(ctx).sort(),
    settingsLoadingZh: ctx.settingsCopy.loading,
    loginTitleZh: ctx.loginCopy.title,
    installTitleZh: ctx.installCopy.title,
    operationsTitleZh: ctx.operationsCopy.title,
    connectTitleZh: ctx.connectCopy.title,
    agentsLabelZh: ctx.agentsCopy.agents,
  }))
}

describe('web i18n entry', () => {
  beforeEach(() => {
    const existing = readCookie('workmesh_locale')
    if (existing != null) cookieJar.value = cookieJar.value.split('; ').filter(entry => !entry.startsWith('workmesh_locale=')).join('; ')
    cookieJar.value = `${cookieJar.value ? cookieJar.value + '; ' : ''}workmesh_locale=; Path=/; Max-Age=0`
    storageJar.items.delete('workmesh_locale')
  })

  it('exposes ten Copy subsets and the primary t helper', () => {
    const html = renderToStaticMarkup(createElement(LocaleProvider, null, createElement(Probe)))
    const stripped = html
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
    const payload = JSON.parse(stripped)
    expect(payload.keys).toEqual([
      'agentsCopy',
      'connectCopy',
      'detailCopy',
      'guidanceCopy',
      'installCopy',
      'issueCopy',
      'locale',
      'loginCopy',
      'operationsCopy',
      'setLocale',
      'settingsCopy',
      'surfaceCopy',
      't',
    ])
    expect(payload.settingsLoadingZh).toBe('正在加载设置…')
    expect(payload.loginTitleZh).toBe('登录')
    expect(payload.installTitleZh).toBe('安装 WorkMesh')
    expect(payload.operationsTitleZh).toBe('运营与规划')
    expect(payload.connectTitleZh).toBe('连接智能体到 WorkMesh')
    expect(payload.agentsLabelZh).toBe('智能体')
  })
})
