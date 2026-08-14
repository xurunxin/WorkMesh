import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseDocument } from 'yaml'
import type { ZodType } from 'zod'
import * as contracts from './index.js'

const publicContracts = contracts as unknown as Record<string, ZodType>
const id = '11111111-1111-4111-8111-111111111111'

type OpenApiDocument = Readonly<{
  paths: Record<string, Record<string, unknown>>
  components: { schemas: Record<string, unknown> }
}>

describe('planning domain parity public contract', () => {
  it('represents parent hierarchy and typed relations in strict Zod DTOs', () => {
    expect(contracts.workItemInputSchema.parse({ teamId: id, title: 'Child', statusId: id, parentId: id }))
      .toMatchObject({ parentId: id })
    expect(contracts.workItemPatchSchema.parse({ parentId: null })).toEqual({ parentId: null })
    expect(publicContracts.workItemRelationInputSchema).toBeDefined()
    expect(publicContracts.workItemRelationResponseSchema).toBeDefined()
    expect(publicContracts.workItemRelationInputSchema!.parse({ targetWorkItemId: id, kind: 'blocks' }))
      .toEqual({ targetWorkItemId: id, kind: 'blocks' })
  })

  it('publishes milestone update and response DTOs rather than untyped JSON', () => {
    expect(publicContracts.milestonePatchSchema).toBeDefined()
    expect(publicContracts.milestoneResponseSchema).toBeDefined()
    expect(publicContracts.milestonePatchSchema!.parse({ description: null, targetDate: null }))
      .toEqual({ description: null, targetDate: null })
    expect(publicContracts.milestonePatchSchema!.safeParse({}).success).toBe(false)
  })

  it('publishes stable planning invariant error codes', () => {
    for (const code of [
      'WORK_ITEM_PARENT_SELF',
      'WORK_ITEM_PARENT_DELETED',
      'WORK_ITEM_PARENT_PROJECT_MISMATCH',
      'WORK_ITEM_PARENT_SCOPE_MISMATCH',
      'WORK_ITEM_PARENT_CYCLE',
      'WORK_ITEM_MILESTONE_PROJECT_MISMATCH',
      'WORK_ITEM_MILESTONE_DELETED',
      'WORK_ITEM_RELATION_SELF',
      'WORK_ITEM_RELATED_ORDER',
      'WORK_ITEM_RELATION_SCOPE_MISMATCH',
      'WORK_ITEM_RELATION_ENDPOINT_DELETED',
      'WORK_ITEM_BLOCK_CYCLE',
      'WORK_ITEM_HAS_ACTIVE_PARENT',
      'WORK_ITEM_HAS_ACTIVE_CHILDREN',
      'WORK_ITEM_HAS_ACTIVE_RELATIONS',
      'MILESTONE_HAS_ACTIVE_WORK_ITEMS',
      'PLANNING_RELATION_ALREADY_EXISTS',
    ]) expect(contracts.apiErrorCodeSchema.options).toContain(code)
  })

  it('keeps the OpenAPI schemas and complete REST surface aligned with Zod', async () => {
    const source = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const document = parseDocument(source, { prettyErrors: true })
    expect(document.errors).toEqual([])
    const openapi = document.toJS() as OpenApiDocument

    expect(openapi.components.schemas.WorkItemInput).toMatchObject({
      properties: { parentId: { $ref: '#/components/schemas/Id' } },
    })
    expect(openapi.components.schemas.WorkItem).toMatchObject({
      required: expect.arrayContaining(['parent_id']),
      properties: { parent_id: { type: ['string', 'null'], format: 'uuid' } },
    })
    expect(openapi.components.schemas.WorkItemRelationInput).toBeDefined()
    expect(openapi.components.schemas.WorkItemRelationResponse).toBeDefined()
    expect(openapi.components.schemas.MilestonePatch).toBeDefined()
    expect(openapi.components.schemas.MilestoneResponse).toBeDefined()

    expect(openapi.paths['/api/v1/projects/{id}/milestones']).toEqual(expect.objectContaining({ get: expect.anything(), post: expect.anything() }))
    expect(openapi.paths['/api/v1/milestones/{id}']).toEqual(expect.objectContaining({ get: expect.anything(), patch: expect.anything(), delete: expect.anything() }))
    expect(openapi.paths['/api/v1/work-items/{id}/relations']).toEqual(expect.objectContaining({ get: expect.anything(), post: expect.anything() }))
    expect(openapi.paths['/api/v1/work-items/{id}/relations/{relationId}']).toEqual(expect.objectContaining({ delete: expect.anything() }))

    expect(openapi.paths['/api/v1/projects/{id}/milestones']!.get).toMatchObject({ responses: { '200': { $ref: '#/components/responses/Milestones' } } })
    expect(openapi.paths['/api/v1/projects/{id}/milestones']!.post).toMatchObject({ responses: { '200': { $ref: '#/components/responses/Milestone' } } })
    expect(openapi.paths['/api/v1/milestones/{id}']!.get).toMatchObject({ responses: { '200': { $ref: '#/components/responses/Milestone' } } })
    expect(openapi.paths['/api/v1/milestones/{id}']!.patch).toMatchObject({ responses: { '200': { $ref: '#/components/responses/Milestone' } } })
    expect(openapi.paths['/api/v1/milestones/{id}']!.delete).toMatchObject({ responses: { '200': { $ref: '#/components/responses/Command' } } })
    expect(openapi.paths['/api/v1/work-items/{id}/relations']!.get).toMatchObject({ responses: { '200': { $ref: '#/components/responses/WorkItemRelations' } } })
    expect(openapi.paths['/api/v1/work-items/{id}/relations']!.post).toMatchObject({ responses: { '200': { $ref: '#/components/responses/WorkItemRelation' } } })
    expect(openapi.paths['/api/v1/work-items/{id}/relations/{relationId}']!.delete).toMatchObject({ responses: { '200': { $ref: '#/components/responses/Command' } } })
  })
})
