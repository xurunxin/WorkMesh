// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ControlCenterResponse } from '@workmesh/contracts'
import { LocaleProvider } from './lib/i18n'
import { ProjectControlCenter, projectControlCenterFeatureEnabled } from './project-control-center'

const projectId = '11111111-1111-4111-8111-111111111111'
const digest = (overrides: Partial<ControlCenterResponse['collections']['running']['items'][number]> = {}) => ({
  id: 'agent_session:22222222-2222-4222-8222-222222222222',
  kind: 'run',
  title: 'Codex',
  summary: 'Implement the authoritative Project digest.',
  projectId,
  workItemId: '33333333-3333-4333-8333-333333333333',
  sessionId: '22222222-2222-4222-8222-222222222222',
  state: 'executing',
  revision: 3,
  source: { type: 'agent_session', id: '22222222-2222-4222-8222-222222222222', revision: 3 },
  responsibleHuman: { id: '44444444-4444-4444-8444-444444444444', kind: 'human' as const, displayName: 'Xu Runxin' },
  activeAgent: { id: '55555555-5555-4555-8555-555555555555', kind: 'agent' as const, displayName: 'Codex' },
  workItem: { id: '33333333-3333-4333-8333-333333333333', title: 'Project Control Center' },
  currentStep: { id: '66666666-6666-4666-8666-666666666666', title: 'Bind production projection', status: 'in_progress' as const, ordinal: 1 },
  health: { heartbeat: 'healthy' as const, lastHeartbeatAt: '2026-08-26T06:20:00.000Z' },
  lastActivity: { id: '77777777-7777-4777-8777-777777777777', kind: 'action_completed', summary: 'Contract typecheck passed.', createdAt: '2026-08-26T06:21:00.000Z' },
  pendingHumanActionCount: 1,
  evidenceCount: 2,
  verified: true,
  updatedAt: '2026-08-26T06:21:00.000Z',
  ...overrides,
})

const response: ControlCenterResponse = {
  projectionVersion: 1,
  scope: { workspaceId: '88888888-8888-4888-8888-888888888888', projectId },
  project: { id: projectId, name: 'Runtime Reliability', status: 'active', targetDate: '2026-09-30', responsibleHuman: { id: '44444444-4444-4444-8444-444444444444', kind: 'human', displayName: 'Xu Runxin' }, revision: 4 },
  revision: 4,
  freshness: { state: 'current', observedAt: '2026-08-26T06:22:00.000Z', sourceUpdatedAt: '2026-08-26T06:21:00.000Z' },
  collections: {
    attention: { items: [], nextCursor: null },
    running: { items: [digest()], nextCursor: 'next-running' },
    risks: { items: [], nextCursor: null },
    recently_verified: { items: [], nextCursor: null },
    ready_work: { items: [], nextCursor: null },
    blocked_work: { items: [], nextCursor: null },
  },
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

describe('Project Control Center', () => {
  it('preserves the Stable Project Overview when the feature is disabled', () => {
    expect(projectControlCenterFeatureEnabled('0')).toBe(false)
    expect(projectControlCenterFeatureEnabled('1')).toBe(true)
    expect(projectControlCenterFeatureEnabled(undefined)).toBe(true)
  })

  it('loads one bounded projection and renders the complete Run digest', async () => {
    const fetchMock = vi.fn(async (_input: string) => ({ ok: true, status: 200, json: async () => response }))
    vi.stubGlobal('fetch', fetchMock)
    render(<LocaleProvider><ProjectControlCenter onOpenWork={() => undefined} project={{ id: projectId, name: 'Runtime Reliability', summary: 'Reliable Agent runs', description: null, status: 'active' }} /></LocaleProvider>)

    expect(await screen.findByRole('heading', { name: 'Project Control Center' })).toBeVisible()
    expect(screen.getAllByText('Bind production projection').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Contract typecheck passed.').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Xu Runxin').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Codex').length).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/projects/${projectId}/control-center?limit=10`)
  })

  it('paginates a collection independently and restores focus after closing detail', async () => {
    const next = { ...response, collections: { ...response.collections, running: { items: [digest({ id: 'agent_session:99999999-9999-4999-8999-999999999999', sessionId: '99999999-9999-4999-8999-999999999999', title: 'Second Agent' })], nextCursor: null } } }
    const fetchMock = vi.fn(async (input: string) => ({ ok: true, status: 200, json: async () => input.includes('cursor=') ? next : response }))
    vi.stubGlobal('fetch', fetchMock)
    render(<LocaleProvider><ProjectControlCenter onOpenWork={() => undefined} project={{ id: projectId, name: 'Runtime Reliability', summary: null, description: null, status: 'active' }} /></LocaleProvider>)

    const details = (await screen.findAllByRole('button', { name: '查看详情' }))[0]!
    details.focus()
    fireEvent.click(details)
    expect(await screen.findByRole('dialog', { name: 'Codex' })).toBeVisible()
    expect(window.location.search).toContain('drawer=digest')
    fireEvent.click(screen.getByRole('button', { name: '关闭 Codex' }))
    await waitFor(() => expect(details).toHaveFocus())
    expect(window.location.search).not.toContain('drawer=')

    fireEvent.click(screen.getByRole('button', { name: '加载更多工作项' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock.mock.calls[1]?.[0]).toContain('collection=running')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('cursor=next-running')
  })

  it('owns server-side filters in the URL and projection request', async () => {
    const fetchMock = vi.fn(async (_input: string) => ({ ok: true, status: 200, json: async () => response }))
    vi.stubGlobal('fetch', fetchMock)
    render(<LocaleProvider><ProjectControlCenter onOpenWork={() => undefined} project={{ id: projectId, name: 'Runtime Reliability', summary: null, description: null, status: 'active' }} /></LocaleProvider>)
    await screen.findByRole('heading', { name: 'Project Control Center' })

    fireEvent.change(screen.getByRole('combobox', { name: '负责人' }), { target: { value: '44444444-4444-4444-8444-444444444444' } })
    fireEvent.change(screen.getByRole('combobox', { name: '时间窗口' }), { target: { value: '24h' } })
    fireEvent.click(screen.getByRole('button', { name: '应用筛选' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(window.location.search).toContain('responsibleHumanActorId=44444444-4444-4444-8444-444444444444')
    expect(window.location.search).toContain('timeWindow=24h')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('responsibleHumanActorId=44444444-4444-4444-8444-444444444444')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('timeWindow=24h')
  })
})
