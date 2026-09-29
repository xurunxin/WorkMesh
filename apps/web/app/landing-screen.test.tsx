// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ControlCenterDigest, HumanAttentionItem } from '@workmesh/contracts'

// The prototype's `#/home` is a summary, not a second workspace. These tests
// pin the two properties that make that true: every section is capped and links
// to the surface that owns the full list, and a run with no measurable budget
// states its liveness without drawing an empty meter.
const requests: string[] = []

const runDigest = (overrides: Partial<ControlCenterDigest> = {}): ControlCenterDigest => ({
  id: 'agent_session:22222222-2222-4222-8222-222222222222',
  kind: 'run',
  title: 'Atlas',
  summary: 'Running the assigned step.',
  projectId: null,
  workItemId: '33333333-3333-4333-8333-333333333333',
  sessionId: '22222222-2222-4222-8222-222222222222',
  state: 'executing',
  revision: 3,
  source: { type: 'agent_session', id: '22222222-2222-4222-8222-222222222222', revision: 3 },
  responsibleHuman: null,
  activeAgent: { id: '55555555-5555-4555-8555-555555555555', kind: 'agent', displayName: 'Atlas' },
  workItem: { id: '33333333-3333-4333-8333-333333333333', title: 'Ship the budget row' },
  currentStep: { id: '66666666-6666-4666-8666-666666666666', title: 'normalize-apply-hash', status: 'in_progress', ordinal: 1 },
  health: { heartbeat: 'healthy', lastHeartbeatAt: '2026-09-30T00:00:00.000Z' },
  budgetUtilization: null,
  lastActivity: null,
  pendingHumanActionCount: 0,
  evidenceCount: 1,
  verified: true,
  updatedAt: '2026-09-30T00:00:00.000Z',
  ...overrides,
})

const attentionItem = (id: string): HumanAttentionItem => ({
  id,
  kind: 'approval',
  title: `Approve ${id}`,
  summary: 'A run is waiting on a Human decision.',
  requestedBy: { id: '11111111-1111-4111-8111-111111111111', kind: 'agent', displayName: 'Atlas' },
  severity: 'medium',
  urgency: 'soon',
  status: 'open',
  options: [],
  recommendedOptionId: null,
  audience: { relationship: 'assigned_to_me', canRespond: true },
  response: { workflow: 'approval', requiresReason: false },
  bulk: { eligible: false, compatibilityKey: id },
  impactSummary: 'The run stays blocked until this is answered.',
  affectedResources: [],
  evidence: [],
  expiresAt: null,
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
  projectId: null,
  workItemId: null,
  sessionId: null,
} as unknown as HumanAttentionItem)

function stubFetch(runs: ControlCenterDigest[]) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    requests.push(url)
    const json = url.startsWith('/api/v1/human-attention')
      ? { items: [attentionItem('a1'), attentionItem('a2')], nextCursor: null }
      : url.startsWith('/api/v1/work-items')
        ? { items: [], nextCursor: null }
        : { collections: { running: { items: runs, nextCursor: null } } }
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
}

beforeEach(() => { requests.length = 0 })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('LandingScreen', () => {
  it('reads three independent sources, each capped, and links the attention section to its own surface', async () => {
    stubFetch([runDigest()])
    const { default: LandingScreen } = await import('./landing-screen')
    render(<LandingScreen locale="en" />)

    await waitFor(() => expect(screen.getByText('Agent runs')).toBeTruthy())
    // The work-item list is capped rather than paging the whole surface.
    expect(requests).toContain('/api/v1/work-items?limit=5')
    expect(requests).toContain('/api/v1/human-attention?view=active&limit=3')
    expect(requests).toContain('/api/v1/control-center?collection=running&limit=4')
    // The bounded section never becomes a second place to work: it defers to
    // the surface that owns the full list.
    expect(screen.getByRole('link', { name: 'Handle all' }).getAttribute('href')).toBe('/?view=inbox')
  })

  it('states heartbeat but no meter when a run has no measurable budget', async () => {
    stubFetch([runDigest({ budgetUtilization: null })])
    const { default: LandingScreen } = await import('./landing-screen')
    const { container } = render(<LandingScreen locale="en" />)

    await waitFor(() => expect(screen.getByText('Agent runs')).toBeTruthy())
    expect(container.querySelectorAll('.wm-run-digest')).toHaveLength(1)
    expect(container.querySelectorAll('.wm-budget-chip')).toHaveLength(0)
    // Liveness is not spend, so it keeps its own figure.
    expect(container.querySelector('.wm-run-digest-telemetry')?.textContent).toContain('Heartbeat')
  })

  it('renders the derived budget the server sent, without re-deriving it', async () => {
    stubFetch([runDigest({
      budgetUtilization: { limit: 'runtimeSeconds', cap: 600, used: 480, ratio: 0.8, measurable: true, warning: true, exhausted: false },
    })])
    const { default: LandingScreen } = await import('./landing-screen')
    const { container } = render(<LandingScreen locale="en" />)

    await waitFor(() => expect(screen.getByText('Agent runs')).toBeTruthy())
    const chip = container.querySelector('.wm-budget-chip')
    expect(chip?.textContent).toContain('80%')
    // 0.80 sits in the row's warning band, so the tone is carried by the fill.
    expect(chip?.className).toContain('wm-budget-chip-warning')
  })

  it('keeps the three sections readable when one source fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('/api/v1/control-center')) return new Response('boom', { status: 500 })
      const json = url.startsWith('/api/v1/human-attention')
        ? { items: [attentionItem('a1')], nextCursor: null }
        : { items: [], nextCursor: null }
      return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    const { default: LandingScreen } = await import('./landing-screen')
    const { container } = render(<LandingScreen locale="en" />)

    await waitFor(() => expect(screen.getByText('Agent runs')).toBeTruthy())
    await waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull())
    // A failed section reports itself; the others stay usable.
    expect(screen.getByText('My work items')).toBeTruthy()
    expect(screen.getByText('Needs you')).toBeTruthy()
  })
})
