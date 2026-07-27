import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8')

describe('pagination surface inventory', () => {
  it('keeps every externally consumed collection on the shared paginator', () => {
    const source = [
      read('apps/api/src/server.ts'),
      read('apps/api/src/agent/routes.ts'),
      read('apps/api/src/collaboration/routes.ts'),
      read('apps/api/src/delivery/routes.ts'),
      read('apps/api/src/operations/routes.ts'),
    ].join('\n')
    for (const route of [
      '/api/v1/teams',
      '/api/v1/teams/:id/states',
      '/api/v1/projects',
      '/api/v1/actors/humans',
      '/api/v1/work-items',
      '/api/v1/work-items/:id/comments',
      '/api/v1/views',
      '/api/v1/agents',
      '/api/v1/agent-sessions',
      '/api/v1/agent-sessions/:id/activities',
      '/api/v1/agent-sessions/:id/plans',
      '/api/v1/artifacts',
      '/api/v1/approvals',
      '/api/v1/rooms/:id/timeline',
      '/api/v1/inbox',
      '/api/v1/leases',
      '/api/v1/handoffs',
      '/api/v1/repositories',
      '/api/v1/cycles',
      '/api/v1/initiatives',
      '/api/v1/advanced-views',
      '/api/v1/advanced-views/:id/results',
      '/api/v1/projects/:id/health',
      '/api/v1/automation-rules',
      '/api/v1/automation-runs',
      '/api/v1/loops',
      '/api/v1/templates',
    ]) expect(source).toContain(route)
    expect(source).not.toMatch(/\bOFFSET\b/i)
    expect(source).not.toContain("Buffer.from(q.cursor, 'base64url')")
  })

  it('preserves decimal durable event and A2A cursors outside opaque pagination', () => {
    const server = read('apps/api/src/server.ts')
    const operations = read('apps/api/src/operations/routes.ts')
    expect(server).toContain('parseCursor(')
    expect(server).toContain('Last-Event-ID')
    expect(operations).toContain('durableCursorSchema')
    expect(operations).toContain('ORDER BY event.cursor LIMIT 200')
  })

  it('keeps REST, Web, SDK, MCP, and OpenAPI on the page envelope', () => {
    expect(read('OPENAPI.yaml')).toContain('PagedJson:')
    expect(read('packages/agent-sdk/src/index.ts')).toContain('iterateListPages')
    expect(read('apps/mcp/src/index.ts')).toContain('nextCursor back as cursor')
    expect(read('apps/web/app/lib/api.ts')).toContain('apiListRequest')
  })
})
