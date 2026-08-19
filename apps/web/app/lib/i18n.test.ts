import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, beforeAll } from 'vitest'
import { LocaleProvider, useLocale } from './i18n'

// Minimum no-op DOM shim so this test file can be loaded under vitest's
// default `node` environment without adding jsdom/happy-dom. The test
// renders with `renderToStaticMarkup`, which never executes `useEffect`,
// so the cookie/localStorage reads inside `LocaleProvider` never actually
// run — the shim only exists to keep module evaluation safe.
beforeAll(() => {
  if (typeof globalThis.document === 'undefined') {
    Object.defineProperty(globalThis, 'document', {
      value: { cookie: '' },
      configurable: true,
    })
  }
  if (typeof globalThis.window === 'undefined') {
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: {
          removeItem: () => {},
          getItem: () => null,
          setItem: () => {},
        },
      },
      configurable: true,
    })
  }
})

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
