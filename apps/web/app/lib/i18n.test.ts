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
    inboxTitleZh: ctx.inboxCopy.title,
    sessionLoadingZh: ctx.sessionDetailCopy.loading,
    liveAgentsZh: ctx.agentWorkCopy.liveAgents,
    relationsTitleZh: ctx.relationsCopy.title,
    evidenceTitleZh: ctx.evidenceCopy.title,
    workRoomTitleZh: ctx.workRoomCopy.title,
    healthOnTrackZh: ctx.projectDeliveryHealthLabel('on_track'),
  }))
}

describe('web i18n entry', () => {
  it('exposes sixteen Copy subsets and the primary t helper', () => {
    const html = renderToStaticMarkup(createElement(LocaleProvider, null, createElement(Probe)))
    const stripped = html
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
    const payload = JSON.parse(stripped)
    expect(payload.keys).toEqual([
      'agentWorkCopy',
      'agentsCopy',
      'connectCopy',
      'detailCopy',
      'evidenceCopy',
      'guidanceCopy',
      'inboxCopy',
      'installCopy',
      'issueCopy',
      'locale',
      'loginCopy',
      'operationsCopy',
      'projectDeliveryHealthLabel',
      'relationsCopy',
      'sessionDetailCopy',
      'setLocale',
      'settingsCopy',
      'surfaceCopy',
      't',
      'workRoomCopy',
    ])
    expect(payload.settingsLoadingZh).toBe('正在加载设置…')
    expect(payload.loginTitleZh).toBe('登录')
    expect(payload.installTitleZh).toBe('安装 WorkMesh')
    expect(payload.operationsTitleZh).toBe('运营与规划')
    expect(payload.connectTitleZh).toBe('连接智能体到 WorkMesh')
    expect(payload.agentsLabelZh).toBe('智能体')
    expect(payload.inboxTitleZh).toBe('收件箱')
    expect(payload.sessionLoadingZh).toBe('正在加载智能体 Session…')
    expect(payload.liveAgentsZh).toBe('在线智能体')
    expect(payload.relationsTitleZh).toBe('阻塞与关联工作')
    expect(payload.evidenceTitleZh).toBe('协作状态展示')
    expect(payload.workRoomTitleZh).toBe('Work Room')
    expect(payload.healthOnTrackZh).toBe('进展顺利')
  })
})
