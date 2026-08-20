import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CollaborationStatePanel } from './collaboration-hub'
import { LocaleProvider } from '../../app/lib/i18n'

const featureDir = fileURLToPath(new URL('.', import.meta.url))
const routeSource = readFileSync(new URL('../../app/evidence/collaboration-faults/page.tsx', import.meta.url), 'utf8')
const homeSource = readFileSync(new URL('../../app/page.tsx', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../../app/styles.css', import.meta.url), 'utf8')

describe('active collaboration fault evidence seam', () => {
  it('renders the exact production conflict and expired state copy', () => {
    const conflict = renderToStaticMarkup(createElement(LocaleProvider, null, createElement(CollaborationStatePanel, { state: 'conflict' })))
    const expired = renderToStaticMarkup(createElement(LocaleProvider, null, createElement(CollaborationStatePanel, { state: 'expired' })))

    expect(conflict).toContain('data-collaboration-state="conflict"')
    expect(conflict).toContain('协作事实已变更')
    expect(conflict).toContain('在做出下一次决策前重新加载当前服务端事实')
    expect(expired).toContain('data-collaboration-state="expired"')
    expect(expired).toContain('审批已过期')
    expect(expired).toContain('重新加载收件箱以查看持久化的当前状态')
  })

  it('keeps the evidence route read-only, disclosed, noindex, and unlinked', () => {
    expect(featureDir).toContain('features')
    expect(routeSource).toContain('robots: { index: false, follow: false }')
    expect(routeSource).toContain('仅用于模拟展示')
    expect(routeSource).toContain('不会发送任何服务端请求或写入')
    for (const forbidden of [
      'fetch(', 'apiRequest', 'apiMutation', 'publicRequest', 'publicMutation',
      'Dogfood Owner', 'authenticated Human', 'localStorage', 'sessionStorage',
    ]) expect(routeSource).not.toContain(forbidden)
    expect(homeSource).not.toContain('/evidence/collaboration-faults')
  })

  it('uses the light-surface text token for fault-state headings', () => {
    expect(stylesSource).toMatch(/\.wm-work-surface-state h2\s*\{[^}]*color:\s*var\(--wm-text\)/)
  })
})
