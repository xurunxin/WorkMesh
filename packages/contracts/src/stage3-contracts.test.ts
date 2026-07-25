import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import {
  agentApiErrorCodeSchema,
  artifactUploadIntentInputSchema,
  completionSuggestionDecisionInputSchema,
  deliveryArtifactInputSchema,
  mergeIntentInputSchema,
  projectUpdateInputSchema,
  providerActionInputSchema,
  providerConnectionInputSchema,
  repositoryInputSchema,
  repositoryContextInputSchema,
  stage3RouteManifest,
  structuredReviewInputSchema,
} from './index.js'

const id = '00000000-0000-4000-8000-000000000001'

describe('Stage 3 contracts', () => {
  it('requires pinned context scope and rejects caller-asserted guidance provenance', () => {
    expect(repositoryContextInputSchema.parse({
      workItemId: id, baseBranch: 'main', baseSha: 'abc', allowedPaths: ['apps/api/**'],
      permissions: ['read', 'write_branch', 'ci'],
    }).baseSha).toBe('abc')
    expect(() => repositoryContextInputSchema.parse({
      workItemId: id, baseBranch: 'main', baseSha: 'abc', allowedPaths: ['apps/api/**'],
      permissions: ['read'],
      guidance: [{ path: 'AGENTS.md', blobSha: 'caller-asserted', contentHash: `sha256:${'a'.repeat(64)}` }],
    })).toThrow()
    expect(() => repositoryContextInputSchema.parse({
      workItemId: id, projectId: id, baseBranch: 'main', baseSha: 'abc',
      allowedPaths: ['**'], permissions: ['read'],
    })).toThrow()
    expect(() => repositoryContextInputSchema.parse({
      workItemId: id, baseBranch: 'main', baseSha: 'abc', branchPattern: 'workmesh/{unknown}',
      allowedPaths: ['**'], permissions: ['read'],
    })).toThrow()
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://user:password@example.test/repository',
  ])('rejects unsafe external URL input %s', url => {
    expect(() => repositoryInputSchema.parse({
      connectionId: id, teamId: id, externalId: '1', fullName: 'acme/workmesh',
      defaultBranch: 'main', cloneUrl: url,
    })).toThrow()
    expect(() => deliveryArtifactInputSchema.parse({
      workItemId: id, sessionId: id, type: 'test_report', title: 'test',
      uri: url, checksum: `sha256:${'a'.repeat(64)}`, sourceTool: 'vitest',
    })).toThrow()
  })

  it('requires exact-head structured review and merge approval inputs', () => {
    expect(structuredReviewInputSchema.parse({
      sessionId: id, artifactId: id, headSha: 'head', verdict: 'approved',
      summary: 'reviewed', findings: [{
        severity: 'high', file: 'src/index.ts', line: 12, summary: 'Unsafe path',
        evidence: 'The call is reachable.', recommendation: 'Add an authorization check.',
      }],
    }).findings[0]).toEqual(expect.objectContaining({
      severity: 'high', file: 'src/index.ts', line: 12,
      summary: 'Unsafe path', evidence: 'The call is reachable.',
      recommendation: 'Add an authorization check.',
    }))
    expect(mergeIntentInputSchema.parse({
      sessionId: id, approvalId: id, actionPayloadHash: `sha256:${'b'.repeat(64)}`,
      headSha: 'head', method: 'squash',
    }).method).toBe('squash')
  })

  it('keeps provider actions provider-neutral and manifests public webhook auth', () => {
    expect(providerActionInputSchema.parse({
      kind: 'create_branch', repositoryId: id, workItemId: id, sessionId: id,
      name: 'wm/ENG-42', baseSha: 'base',
    }).kind).toBe('create_branch')
    expect(stage3RouteManifest.find((route) => route.path.includes('provider-webhooks'))?.authenticated).toBe(false)
  })

  it('requires GitHub credentials, exact upload links, draft-only updates, and explicit completion decisions', () => {
    expect(providerConnectionInputSchema.parse({
      provider: 'fake', externalAccountId: 'fake-1', displayName: 'Fake',
      webhookSecret: 'sixteen-byte-secret',
    }).provider).toBe('fake')
    expect(() => providerConnectionInputSchema.parse({
      provider: 'github', externalAccountId: 'github-1', displayName: 'GitHub',
      webhookSecret: 'sixteen-byte-secret',
    })).toThrow()
    expect(artifactUploadIntentInputSchema.parse({
      workItemId: id, sessionId: id, repositoryId: id, sourceTool: 'vitest',
      filename: 'report.txt', mimeType: 'text/plain', sizeBytes: 1,
      checksum: `sha256:${'a'.repeat(64)}`,
    }).repositoryId).toBe(id)
    expect(() => artifactUploadIntentInputSchema.parse({
      workItemId: id, sessionId: id, repositoryId: id, pullRequestId: id,
      sourceTool: 'vitest', filename: 'report.txt', mimeType: 'text/plain', sizeBytes: 1,
      checksum: `sha256:${'a'.repeat(64)}`,
    })).toThrow()
    expect(deliveryArtifactInputSchema.parse({
      workItemId: id, sessionId: id, repositoryId: id, pullRequestId: id, headSha: 'head',
      type: 'code_review', title: 'Exact-head review evidence', sourceTool: 'workmesh-mcp',
      checksum: `sha256:${'b'.repeat(64)}`,
    }).headSha).toBe('head')
    expect(() => deliveryArtifactInputSchema.parse({
      workItemId: id, sessionId: id, repositoryId: id, pullRequestId: id,
      type: 'code_review', title: 'Unbound review evidence', sourceTool: 'workmesh-mcp',
      checksum: `sha256:${'b'.repeat(64)}`,
    })).toThrow()
    expect(() => projectUpdateInputSchema.parse({
      health: 'on_track', body: 'Agent may draft only', status: 'published',
    })).toThrow()
    expect(completionSuggestionDecisionInputSchema.parse({ decision: 'dismissed' }).decision).toBe('dismissed')
    expect(agentApiErrorCodeSchema.parse('ARTIFACT_UPLOAD_EXPIRED')).toBe('ARTIFACT_UPLOAD_EXPIRED')
  })

  it('keeps the OpenAPI webhook replay and provider-action union in parity with runtime contracts', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const webhook = openapi.slice(openapi.indexOf('  /api/v1/provider-webhooks/{connectionId}/github:'), openapi.indexOf('  /api/v1/repositories:'))
    expect(webhook).toContain('"200"')
    expect(webhook).toContain('"202"')
    const providerAction = openapi.slice(openapi.indexOf('    ProviderActionInput:'), openapi.indexOf('    DeliveryArtifactInput:'))
    for (const kind of ['create_branch', 'create_commit', 'open_pull_request']) expect(providerAction).toContain(`const: ${kind}`)
    const commit = providerAction.slice(providerAction.indexOf('const: create_commit'), providerAction.indexOf('const: open_pull_request'))
    const pullRequest = providerAction.slice(providerAction.indexOf('const: open_pull_request'))
    for (const field of ['projectId', 'planStepId']) {
      expect(commit).toContain(`${field}:`)
      expect(pullRequest).toContain(`${field}:`)
    }
    expect(providerAction).toContain('discriminator: { propertyName: kind }')

    const repositories = openapi.slice(openapi.indexOf('  /api/v1/repositories:'), openapi.indexOf('  /api/v1/provider-actions:'))
    expect(repositories.match(/security: \[\{ SessionCookie: \[\] \}, \{ AgentSessionToken: \[\] \}\]/g)).toHaveLength(2)
    const download = openapi.slice(openapi.indexOf('  /api/v1/artifact-upload-intents/{id}/download:'), openapi.indexOf('  /api/v1/pull-requests/{id}/reviews:'))
    expect(download).toContain('security: [{ SessionCookie: [] }, { AgentSessionToken: [] }]')
    const finalize = openapi.slice(openapi.indexOf('  /api/v1/artifact-upload-intents/{id}/finalize:'), openapi.indexOf('  /api/v1/artifact-upload-intents/{id}/download:'))
    expect(finalize).toContain('"400": { $ref: "#/components/responses/BadRequest" }')
    const error = openapi.slice(openapi.indexOf('    Error:'), openapi.indexOf('    AgentProtocol:'))
    expect(error).toContain('ARTIFACT_UPLOAD_EXPIRED')
    const projectUpdates = openapi.slice(openapi.indexOf('  /api/v1/projects/{id}/updates:'), openapi.indexOf('  /api/v1/projects/{id}/dependencies:'))
    expect(projectUpdates).toContain('security: [{ SessionCookie: [] }, { AgentSessionToken: [] }]')
    expect(projectUpdates).toContain('{ $ref: "#/components/parameters/IfMatch" }')

    const connection = openapi.slice(openapi.indexOf('    ProviderConnectionInput:'), openapi.indexOf('    RepositoryInput:'))
    expect(connection).toContain('oneOf:')
    expect(connection).toContain('const: github')
    for (const field of ['installationId', 'appId', 'privateKey']) expect(connection).toContain(field)
    const context = openapi.slice(openapi.indexOf('    RepositoryContextInput:'), openapi.indexOf('    ProviderActionInput:'))
    expect(context).toContain('oneOf: [{ required: [projectId] }, { required: [workItemId] }, { required: [sessionId] }]')
    expect(context).not.toContain('guidance:')
    expect(context).toContain('merge, ci')
    const structuredReview = openapi.slice(openapi.indexOf('    StructuredReviewInput:'), openapi.indexOf('    MergeIntentInput:'))
    for (const field of ['severity', 'file', 'line', 'summary', 'evidence', 'recommendation'])
      expect(structuredReview).toContain(`${field}:`)
    const artifact = openapi.slice(openapi.indexOf('    DeliveryArtifactInput:'), openapi.indexOf('    ArtifactUploadIntentInput:'))
    expect(artifact).toContain('dependentRequired: { pullRequestId: [headSha], headSha: [pullRequestId] }')
    const update = openapi.slice(openapi.indexOf('    ProjectUpdateInput:'), openapi.indexOf('    ProjectDependencyInput:'))
    expect(update).toContain('status: { const: draft')
  })
})
