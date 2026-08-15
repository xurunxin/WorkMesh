import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CollaborationStatePanel } from './collaboration-hub'

const featureDir = fileURLToPath(new URL('.', import.meta.url))
const routeSource = readFileSync(new URL('../../app/evidence/collaboration-faults/page.tsx', import.meta.url), 'utf8')
const homeSource = readFileSync(new URL('../../app/page.tsx', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../../app/styles.css', import.meta.url), 'utf8')

describe('active collaboration fault evidence seam', () => {
  it('renders the exact production conflict and expired state copy', () => {
    const conflict = renderToStaticMarkup(createElement(CollaborationStatePanel, { state: 'conflict' }))
    const expired = renderToStaticMarkup(createElement(CollaborationStatePanel, { state: 'expired' }))

    expect(conflict).toContain('data-collaboration-state="conflict"')
    expect(conflict).toContain('Collaboration facts changed')
    expect(conflict).toContain('Reload current server facts before making another decision.')
    expect(expired).toContain('data-collaboration-state="expired"')
    expect(expired).toContain('The approval expired')
    expect(expired).toContain('Reload the Inbox to see its durable current status.')
  })

  it('keeps the evidence route read-only, disclosed, noindex, and unlinked', () => {
    expect(featureDir).toContain('features')
    expect(routeSource).toContain('robots: { index: false, follow: false }')
    expect(routeSource).toContain('simulates presentation only')
    expect(routeSource).toContain('performs no server request or mutation')
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
