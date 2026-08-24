import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseDocument } from 'yaml'

type OpenApiNode = Record<string, unknown>
type Operation = {
  operationId?: string
  responses?: Record<string, { $ref?: string }>
  security?: Array<Record<string, unknown[]>>
}

type OpenApiDocument = {
  paths: Record<string, Record<string, Operation>>
  components: {
    requestBodies: Record<string, unknown>
    schemas: Record<string, OpenApiNode>
    securitySchemes: Record<string, OpenApiNode>
  }
}

const runtimeReliabilitySchemas = [
  'AgentConnectionAuthenticatedCredential',
  'AgentConnectionCurrentIdentity',
  'AgentExecutionConcurrencyState',
  'AgentConcurrencyLimitDetails',
  'AgentConcurrencyLimitError',
] as const

const executionAdmissionOperationIds = [
  'delegateAndStartAgentSession',
  'claimWorkItem',
  'retryAgentSession',
  'acceptHandoff',
  'createChildAgentSession',
  'createReviewDelegation',
  'runLoopNow',
  'acceptA2ATask',
] as const

describe('runtime reliability OpenAPI contract', () => {
  it('keeps the new response models in schemas and every local reference resolvable', async () => {
    const openapi = await readOpenApi()

    for (const schemaName of runtimeReliabilitySchemas) {
      expect(openapi.components.schemas[schemaName], schemaName).toBeDefined()
      expect(openapi.components.requestBodies[schemaName], schemaName).toBeUndefined()
    }

    for (const reference of collectLocalReferences(openapi)) {
      expect(resolveLocalReference(openapi, reference), reference).toBeDefined()
    }
  })

  it('documents the dedicated identity credential and every execution-capacity conflict', async () => {
    const openapi = await readOpenApi()
    expect(openapi.components.securitySchemes.AgentConnectionInstallationToken).toMatchObject({
      type: 'apiKey',
      in: 'header',
      name: 'X-WorkMesh-Installation-Token',
    })

    const currentIdentity = findOperation(openapi, 'getCurrentAgentConnectionIdentity')
    expect(currentIdentity.security).toEqual([{ AgentConnectionInstallationToken: [] }])
    expect(resolveObjectPath(
      openapi.components.schemas.AgentCapabilityManifest,
      ['properties', 'operations', 'items', 'properties', 'authentication', 'enum'],
    )).toEqual(expect.arrayContaining(['coordination_connection']))

    for (const operationId of executionAdmissionOperationIds) {
      const operation = findOperation(openapi, operationId)
      expect(operation.responses?.['409']?.$ref, operationId)
        .toBe('#/components/responses/AgentConcurrencyLimit')
    }
  })
})

async function readOpenApi(): Promise<OpenApiDocument> {
  const source = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
  const document = parseDocument(source, { prettyErrors: true })
  expect(document.errors).toEqual([])
  return document.toJS() as OpenApiDocument
}

function findOperation(openapi: OpenApiDocument, operationId: string): Operation {
  for (const pathItem of Object.values(openapi.paths)) {
    for (const operation of Object.values(pathItem)) {
      if (operation.operationId === operationId) {
        return operation
      }
    }
  }
  throw new Error(`Missing OpenAPI operation: ${operationId}`)
}

function collectLocalReferences(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectLocalReferences)
  }
  if (value === null || typeof value !== 'object') {
    return []
  }
  const node = value as OpenApiNode
  const references = typeof node.$ref === 'string' && node.$ref.startsWith('#/')
    ? [node.$ref]
    : []
  return references.concat(Object.values(node).flatMap(collectLocalReferences))
}

function resolveLocalReference(root: unknown, reference: string): unknown {
  return reference
    .slice(2)
    .split('/')
    .map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((value, segment) => {
      if (value === null || typeof value !== 'object') {
        return undefined
      }
      return (value as OpenApiNode)[segment]
    }, root)
}

function resolveObjectPath(root: unknown, segments: readonly string[]): unknown {
  return segments.reduce<unknown>((value, segment) => {
    if (value === null || typeof value !== 'object') {
      return undefined
    }
    return (value as OpenApiNode)[segment]
  }, root)
}
