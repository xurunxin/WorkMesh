import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryAuthorizedCommands } from './index'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})
const list = (items: unknown[]) => json({ items, nextCursor: null })

function fixtureFetch(failingPath?: string) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname === failingPath) return json({ error: { message: 'Source unavailable', code: 'UNAVAILABLE' } }, 503)
    if (url.pathname === '/api/v1/auth/me') return json({ actor: { id: 'human-1' }, csrfToken: 'redacted' })
    if (url.pathname === '/api/v1/features') return json({ features: [{ key: 'WORKMESH_BETA_OPERATIONS_UI', enabled: true }] })
    if (url.pathname === '/api/v1/teams') return list([{ id: 'team-1', name: 'General', key: 'GEN' }])
    if (url.pathname === '/api/v1/projects') return list([{ id: 'project-1', name: 'Adoption', summary: 'Kaneo UI', status: 'Active' }])
    if (url.pathname === '/api/v1/work-items') return list([{ id: 'item-1', title: 'Command center', number: 6, team_key: 'GEN', project_id: 'project-1', status_name: 'In Progress', priority: 'high' }])
    if (url.pathname === '/api/v1/agents') return list([{ id: 'agent-1', name: 'Codex', slug: 'codex', description: null, is_active: true }])
    if (url.pathname === '/api/v1/agent-sessions') return list([{ id: 'session-1', agent_id: 'agent-1', state: 'executing', work_item_id: 'item-1' }])
    if (url.pathname === '/api/v1/inbox') return list([{ id: 'inbox-1', kind: 'review_request', source_type: 'message', source_id: 'source-1', requires_response: true, payload: { title: 'Review command center' } }])
    throw new Error(`Unexpected request ${url.pathname}`)
  })
}

afterEach(() => { vi.unstubAllGlobals() })

describe('authorized command queries', () => {
  it('uses only existing read endpoints and normalizes fresh authorized resources', async () => {
    const fetchMock = fixtureFetch()
    vi.stubGlobal('fetch', fetchMock)
    const result = await queryAuthorizedCommands('GEN', new AbortController().signal)
    expect(result.operationsEnabled).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.sourceStatuses).toEqual([
      { source: 'projects', state: 'ready' },
      { source: 'work-items', state: 'ready' },
      { source: 'agents', state: 'ready' },
      { source: 'sessions', state: 'ready' },
      { source: 'inbox', state: 'ready' },
    ])
    expect(result.commands.map(command => command.id)).toEqual([
      'resource:project:project-1',
      'resource:work-item:item-1',
      'resource:agent:agent-1',
      'resource:session:session-1',
      'resource:inbox:inbox-1',
    ])
    const paths = fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname)
    expect(new Set(paths)).toEqual(new Set([
      '/api/v1/auth/me', '/api/v1/features', '/api/v1/teams', '/api/v1/projects',
      '/api/v1/work-items', '/api/v1/agents', '/api/v1/agent-sessions', '/api/v1/inbox',
    ]))
    const sessionUrl = fetchMock.mock.calls.map(([input]) => new URL(String(input))).find(url => url.pathname === '/api/v1/agent-sessions')
    expect(sessionUrl?.searchParams.get('teamId')).toBe('team-1')
  })

  it('does not issue resource queries before the one-character threshold', async () => {
    const fetchMock = fixtureFetch()
    vi.stubGlobal('fetch', fetchMock)
    const result = await queryAuthorizedCommands('   ', new AbortController().signal)
    expect(result.commands).toEqual([])
    expect(result.sourceStatuses).toEqual([])
    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      '/api/v1/auth/me', '/api/v1/features', '/api/v1/teams',
    ])
  })

  it('returns fresh partial results when one source fails', async () => {
    vi.stubGlobal('fetch', fixtureFetch('/api/v1/agents'))
    const result = await queryAuthorizedCommands('GEN', new AbortController().signal)
    expect(result.errors).toEqual([{ source: 'agents', message: 'Source unavailable', state: 'error' }])
    expect(result.commands.some(command => command.source === 'projects')).toBe(true)
    expect(result.commands.some(command => command.source === 'agents')).toBe(false)
    expect(result.sourceStatuses).toContainEqual({ source: 'agents', state: 'error' })
  })

  it('rejects an aborted generation before publishing resource results', async () => {
    const fetchMock = fixtureFetch()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort()
    await expect(queryAuthorizedCommands('GEN', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
