import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseDocument } from 'yaml'

type ParameterRef = { $ref?: string }
type Operation = {
  parameters?: ParameterRef[]
  responses?: Record<string, { $ref?: string }>
}
type OpenApiDocument = {
  paths: Record<string, { get?: Operation }>
  components: {
    parameters: Record<string, {
      schema?: {
        type?: string
        minimum?: number
        maximum?: number
        default?: number
      }
    }>
    schemas: {
      Error?: {
        properties?: {
          error?: {
            properties?: {
              code?: { enum?: string[] }
            }
          }
        }
      }
    }
  }
}

const collectionPaths = [
  '/api/v1/teams',
  '/api/v1/teams/{id}/states',
  '/api/v1/projects',
  '/api/v1/projects/{id}/milestones',
  '/api/v1/actors/humans',
  '/api/v1/work-items',
  '/api/v1/work-items/{id}/comments',
  '/api/v1/work-items/{id}/relations',
  '/api/v1/views',
  '/api/v1/agents',
  '/api/v1/agent-connections',
  '/api/v1/agent-sessions',
  '/api/v1/agent-sessions/{id}/activities',
  '/api/v1/agent-sessions/{id}/plans',
  '/api/v1/artifacts',
  '/api/v1/approvals',
  '/api/v1/human-attention',
  '/api/v1/control-center',
  '/api/v1/projects/{projectId}/control-center',
  '/api/v1/rooms/{id}/timeline',
  '/api/v1/inbox',
  '/api/v1/leases',
  '/api/v1/handoffs',
  '/api/v1/repositories',
  '/api/v1/cycles',
  '/api/v1/initiatives',
  '/api/v1/advanced-views',
  '/api/v1/advanced-views/{id}/results',
  '/api/v1/projects/{id}/health',
  '/api/v1/automation-rules',
  '/api/v1/automation-runs',
  '/api/v1/loops',
  '/api/v1/notifications',
  '/api/v1/templates',
] as const

const limit100Paths = new Set<string>([
  '/api/v1/control-center',
  '/api/v1/projects/{projectId}/control-center',
])

describe('pagination OpenAPI contract', () => {
  it('declares the common cursor and limit on every paged collection', async () => {
    const source = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const document = parseDocument(source, { prettyErrors: true })
    expect(document.errors).toEqual([])
    const openapi = document.toJS() as OpenApiDocument

    expect(openapi.components.parameters.Limit?.schema).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 200,
      default: 50,
    })
    expect(openapi.components.parameters.Limit100?.schema).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 20,
    })
    for (const path of collectionPaths) {
      const operation = openapi.paths[path]?.get
      expect(operation, path).toBeDefined()
      expect(operation?.parameters, path).toEqual(expect.arrayContaining([
        { $ref: '#/components/parameters/Cursor' },
        {
          $ref: limit100Paths.has(path)
            ? '#/components/parameters/Limit100'
            : '#/components/parameters/Limit',
        },
      ]))
      expect(operation?.responses?.['200']?.$ref, path).toMatch(
        /^#\/components\/responses\/(?:PagedJson|Teams|WorkflowStates|Projects|HumanActors|WorkItems|Comments|SavedViews|Agents|AgentConnections|AgentSessions|AgentActivities|PlanVersions|Artifacts|Approvals|HumanAttentionItems|ControlCenter|InboxItems|Milestones|WorkItemRelations)$/,
      )
    }
    const opaqueCursorPaths = Object.entries(openapi.paths)
      .filter(([, item]) => item.get?.parameters?.some(parameter =>
        parameter.$ref === '#/components/parameters/Cursor'))
      .map(([path]) => path)
      .sort()
    expect(opaqueCursorPaths).toEqual([...collectionPaths].sort())
  })

  it('keeps durable event cursors separate and documents generic cursor failures', async () => {
    const source = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const openapi = parseDocument(source).toJS() as OpenApiDocument
    const eventParameters = openapi.paths['/api/v1/events']?.get?.parameters ?? []
    expect(eventParameters).not.toContainEqual({ $ref: '#/components/parameters/Cursor' })
    expect(eventParameters).not.toContainEqual({ $ref: '#/components/parameters/Limit' })
    const runParameters = openapi.paths['/api/v1/agent-sessions/{sessionId}/explanation']?.get?.parameters ?? []
    expect(runParameters).toContainEqual({ $ref: '#/components/parameters/RunSequenceCursor' })
    expect(runParameters).not.toContainEqual({ $ref: '#/components/parameters/Cursor' })
    expect(
      openapi.components.schemas.Error
        ?.properties?.error?.properties?.code?.enum,
    ).toEqual(expect.arrayContaining([
      'PAGINATION_CURSOR_INVALID',
      'PAGINATION_CURSOR_MISMATCH',
    ]))
  })
})
