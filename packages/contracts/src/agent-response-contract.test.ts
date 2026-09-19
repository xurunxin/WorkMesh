import { describe, expect, it } from 'vitest'
import { agentResponseSchema } from './index.js'

const id = '00000000-0000-4000-8000-000000000001'

describe('agent response contract', () => {
  it('accepts database dates after transport normalization and requires protocol arrays', () => {
    const response = agentResponseSchema.parse({
      id, workspace_id: id, actor_id: id, name: 'Codex', slug: 'codex', description: null,
      icon: null, provider: 'openai', version: '1', endpoint_url: null,
      supported_protocols: ['mcp'], skills: [], requested_capabilities: ['work:read'], approved_capabilities: ['work:read'],
      output_artifact_types: [], max_concurrency: 1, heartbeat_interval_seconds: 30, metadata: {}, team_access: [],
      is_active: true, lifecycle_status: 'active', revision: 1, archived_at: null, archived_by_actor_id: null,
      archived_reason: null, created_at: new Date('2026-08-29T00:00:00Z'), updated_at: new Date('2026-08-29T00:00:00Z'),
    })
    expect(response.supported_protocols).toEqual(['mcp'])
    expect(response.created_at).toBe('2026-08-29T00:00:00.000Z')
    expect(() => agentResponseSchema.parse({ ...response, supported_protocols: '{mcp}' })).toThrow()
    expect(agentResponseSchema.parse({ ...response, id: 'agent/route', actor_id: 'actor/route' }).id).toBe('agent/route')
    expect(() => agentResponseSchema.parse({ ...response, id: '' })).toThrow()
  })
})
