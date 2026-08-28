import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseDocument } from 'yaml'
import {
  agentRouteManifest,
  capabilitySchema,
  featureDefinitions,
  featureForApiRoute,
  routePolicyManifest,
} from './index.js'

const keyOf = (route: { method: string; path: string }): string =>
  `${route.method} ${route.path}`

type SecurityRequirement = Record<string, readonly unknown[]>

const securityFor = (
  authentication: (typeof routePolicyManifest)[number]['authentication'],
): readonly SecurityRequirement[] => {
  switch (authentication) {
    case 'public':
      return []
    case 'bootstrap':
      return [{ BootstrapToken: [] }]
    case 'human_session':
      return [{ SessionCookie: [] }]
    case 'agent_session':
      return [{ AgentSessionToken: [] }]
    case 'human_or_agent_session':
      return [{ SessionCookie: [] }, { AgentSessionToken: [] }]
    case 'human_or_coordination_connection':
      return [{ SessionCookie: [] }, { AgentConnectionInstallationToken: [] }]
    case 'coordination_connection':
      return [{ AgentConnectionInstallationToken: [] }]
    case 'installation_target':
      return [{ AgentInstallationToken: [] }]
    case 'provider_signature':
      return [{ GitHubWebhookSignature: [] }]
  }
}

describe('routePolicyManifest', () => {
  it('declares the intended shared credential-rate-limit operations', () => {
    expect(
      routePolicyManifest
        .filter(route => route.credentialRateLimit === 'shared_redis')
        .map(route => route.operationId),
    ).toEqual([
      'installWorkspace',
      'login',
      'exchangeAgentSessionToken',
      'refreshAgentSessionToken',
      'inspectExactTargetHandoff',
      'rejectHandoff',
      'redeemAgentConnection',
      'redeemAgentEnrollment',
    ])
  })

  it('is the unique serializable declaration for every runtime route', () => {
    const policyRoutes = routePolicyManifest.map(keyOf)
    const legacyRoutes = agentRouteManifest.map(keyOf)

    expect(routePolicyManifest).toHaveLength(232)
    expect(new Set(policyRoutes).size).toBe(routePolicyManifest.length)
    expect(new Set(routePolicyManifest.map(route => route.operationId)).size)
      .toBe(routePolicyManifest.length)
    expect(new Set(routePolicyManifest.map(route => route.policyId)).size)
      .toBe(routePolicyManifest.length)
    expect(new Set(policyRoutes)).toEqual(new Set(legacyRoutes))
    expect(() => JSON.parse(JSON.stringify(routePolicyManifest))).not.toThrow()
  })

  it('keeps lease coordination separate from authorization', () => {
    for (const route of routePolicyManifest) {
      expect(route.lease.grantsAuthorization).toBe(false)
      if (route.agent.requireActiveSession) {
        expect(route.agent.requireActiveDelegation).toBe(true)
        expect(route.agent.requireLiveGrantIntersection).toBe(true)
        expect(route.agent.sessionBinding).toBe('current_session')
      }
      if (route.approval.required) {
        expect(route.approval.bindsActionFingerprint).toBe(true)
      }
      if (
        route.method !== 'GET'
        && route.authentication !== 'provider_signature'
        && route.operationId !== 'previewAgentSessionControl'
      ) {
        expect(route.idempotency).toBe('required')
      }
      if (route.authentication === 'provider_signature') {
        expect(route.operationId).toBe('receiveGitHubWebhook')
        expect(route.idempotency).toBe('none')
      }
    }

    expect(
      routePolicyManifest.find(route => route.operationId === 'previewAgentSessionControl'),
    ).toMatchObject({
      method: 'POST',
      idempotency: 'none',
      resourceResolverId: 'none',
      agent: {
        capabilities: ['work:read'],
      },
    })
  })

  it('parses OPENAPI.yaml as valid YAML before checking generated extensions', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const document = parseDocument(openapi, { prettyErrors: true })

    expect(document.errors).toEqual([])
    expect(document.toJS()).toMatchObject({
      openapi: expect.any(String),
      paths: expect.any(Object),
    })
    const parsed = document.toJS() as {
      components: { securitySchemes: Record<string, unknown> }
    }
    expect(parsed.components.securitySchemes).toEqual({
      BootstrapToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-WorkMesh-Bootstrap-Token',
        description: 'One-time deployment bootstrap credential. It is required for Workspace installation and is not a human or Agent session.',
      },
      SessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'workmesh_session',
        description: 'HttpOnly server-side session cookie.',
      },
      AgentSessionToken: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'WorkMeshSessionToken',
        description: 'Short-lived agent session token; revocation is checked server-side.',
      },
      AgentInstallationToken: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'WorkMeshInstallationToken',
        description: 'Installation-scoped bearer credential used by installation_target operations, including token exchange, refresh, and exact-target handoff actions. It cannot perform ordinary session work.',
      },
      AgentConnectionInstallationToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-WorkMesh-Installation-Token',
        description: 'Agent Connection credential used only for Coordination MCP and current-identity requests. It is distinct from pairing codes and from Bearer installation-target credentials.',
      },
      GitHubWebhookSignature: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Hub-Signature-256',
        description: 'GitHub HMAC-SHA256 over the raw request body. X-GitHub-Delivery and X-GitHub-Event are also required and the server enforces its replay and delivery rules.',
      },
    })
  })

  it('matches OpenAPI operation IDs and feature tiers', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const document = parseDocument(openapi, { prettyErrors: true })
    expect(document.errors).toEqual([])
    const parsed = document.toJS() as {
      security?: readonly SecurityRequirement[]
      paths: Record<string, Record<string, Record<string, unknown> & {
        security?: readonly SecurityRequirement[]
      }>>
    }

    for (const route of routePolicyManifest) {
      const operation = parsed.paths[route.path]?.[route.method.toLowerCase()]
      expect(operation).toMatchObject({
        operationId: route.operationId,
        'x-workmesh-policy-id': route.policyId,
        'x-workmesh-actor-kinds': route.actorKinds,
        'x-workmesh-feature-key': route.feature.key ?? 'none',
        'x-workmesh-feature-tier': route.feature.tier,
      })
      const effectiveSecurity = operation
        && Object.hasOwn(operation, 'security')
        ? operation.security
        : parsed.security
      expect(
        effectiveSecurity,
        `${route.operationId} effective OpenAPI security must match ${route.authentication}`,
      ).toEqual(route.operationId === 'listWorkItems'
        ? [
            { SessionCookie: [] },
            { AgentSessionToken: [] },
            { AgentConnectionInstallationToken: [] },
          ]
        : securityFor(route.authentication))
      if (route.credentialRateLimit === 'shared_redis') {
        expect(operation).toMatchObject({
          'x-workmesh-auth-rate-limit': 'shared_redis',
          responses: {
            '429': { $ref: '#/components/responses/AuthRateLimited' },
            '503': { $ref: '#/components/responses/AuthRateLimitUnavailable' },
          },
        })
      } else {
        expect(operation).not.toHaveProperty('x-workmesh-auth-rate-limit')
      }
      const feature = featureForApiRoute(route.path)
      expect(route.feature.key).toBe(feature ?? null)
      if (feature) {
        expect(route.feature.tier).toBe(
          featureDefinitions.find(definition => definition.key === feature)?.tier,
        )
        expect(route.feature.disabledBehavior).toBe('feature_disabled')
      }
    }
  })

  it('uses only declared capabilities and preserves delivery route guards', () => {
    const declaredCapabilities = new Set(capabilitySchema.options)
    for (const route of routePolicyManifest) {
      for (const capability of route.agent.capabilities) {
        expect(
          declaredCapabilities.has(capability as (typeof capabilitySchema.options)[number]),
          `${route.operationId} declares unknown capability ${capability}`,
        ).toBe(true)
      }
    }

    const capabilitiesFor = (operationId: string): readonly string[] =>
      routePolicyManifest.find(route => route.operationId === operationId)
        ?.agent.capabilities ?? []

    expect(capabilitiesFor('publishStructuredReview')).toEqual(['artifact:write'])
    expect(capabilitiesFor('retryPullRequestCheck')).toEqual(['ci:run'])
    expect(capabilitiesFor('requestPullRequestMerge')).toEqual(['repo:merge'])
    expect(capabilitiesFor('recordUsage')).toEqual(['work:read'])
    expect(capabilitiesFor('postWorkRoomMessage')).toEqual(['work:write'])
    expect(capabilitiesFor('commentOnPlanStep')).toEqual(['work:write'])
    expect(capabilitiesFor('getArtifactUploadStatus')).toEqual(['work:read'])
    expect(capabilitiesFor('listWorkItemArtifacts')).toEqual(['work:read'])
    expect(capabilitiesFor('cancelArtifactUpload')).toEqual(['artifact:write'])
  })

  it('documents bootstrap authentication failures as a structured 401 response', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const document = parseDocument(openapi, { prettyErrors: true })
    expect(document.errors).toEqual([])
    const parsed = document.toJS() as {
      paths: Record<string, Record<string, {
        responses?: Record<string, unknown>
      }>>
      components: {
        responses: Record<string, {
          content?: {
            'application/json'?: {
              schema?: {
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
        }>
      }
    }
    expect(parsed.paths['/api/v1/auth/install']?.post?.responses?.['401'])
      .toEqual({ $ref: '#/components/responses/BootstrapAuthFailed' })
    expect(
      parsed.components.responses.BootstrapAuthFailed
        ?.content?.['application/json']?.schema
        ?.properties?.error?.properties?.code?.enum,
    ).toEqual(['BOOTSTRAP_AUTH_FAILED'])
  })

  it('requires If-Match only where the handler revalidates a revision', () => {
    const revisionFor = (operationId: string) =>
      routePolicyManifest.find(route => route.operationId === operationId)?.revision

    for (const operationId of [
      'promptAgentSession',
      'acceptHandoff',
      'rejectHandoff',
      'cancelHandoff',
      'completeHandoff',
    ]) {
      expect(revisionFor(operationId), operationId).toBe('none')
    }
    expect(revisionFor('forceReleaseLease')).toBe('if_match')
  })

  it('allows an ordinary Team member to contribute an independent Approval vote', () => {
    const policy = routePolicyManifest.find(route => route.operationId === 'decideApproval')
    expect(policy?.human).toMatchObject({
      membership: 'resolved_team',
      teamRoles: ['admin', 'maintainer', 'member'],
    })
  })

  it('limits forced assignment to a Human Session or Coordination Connection', () => {
    const policy = routePolicyManifest.find(
      route => route.operationId === 'delegateAndStartAgentSession',
    )
    expect(policy).toMatchObject({
      authentication: 'human_or_coordination_connection',
      actorKinds: ['human', 'agent'],
      agent: {
        capabilities: ['agent:delegate'],
        requireActiveSession: true,
        requireActiveDelegation: true,
        requireLiveGrantIntersection: true,
      },
    })
  })

  it('keeps deployment feature discovery authenticated for humans and agents', async () => {
    const policy = routePolicyManifest.find(
      route => route.operationId === 'getDeploymentFeatures',
    )

    expect(policy).toMatchObject({
      authentication: 'human_or_agent_session',
      actorKinds: ['human', 'agent'],
    })

    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const parsed = parseDocument(openapi).toJS() as {
      paths: Record<string, Record<string, { security?: readonly SecurityRequirement[] }>>
    }
    expect(parsed.paths['/api/v1/features']?.get?.security).toEqual([
      { SessionCookie: [] },
      { AgentSessionToken: [] },
    ])
    const handlerHumanOnlyOperationIds = [
      'listHumanActors',
      'listAgents',
      'getAgent',
      'getDelegation',
      'promptAgentSession',
      'getWorkRoomTimeline',
      'resolveWorkRoomMessage',
      'acceptHandoff',
      'connectRepository',
      'pinRepositoryContext',
      'publishProjectUpdate',
      'createProjectDependency',
      'setWorkItemCycle',
      'createAdvancedView',
      'dryRunAutomationRule',
      'triggerAutomationRule',
      'createNotification',
      'updateNotificationPreferences',
      'acceptA2ATask',
    ] as const

    for (const operationId of handlerHumanOnlyOperationIds) {
      expect(
        routePolicyManifest.find(route => route.operationId === operationId),
        operationId,
      ).toMatchObject({
        authentication: 'human_session',
        actorKinds: ['human'],
      })
    }
  })

  it('keeps the generated Markdown matrix in parity', async () => {
    const matrix = await readFile(
      new URL('../../../docs/route-policy-matrix.md', import.meta.url),
      'utf8',
    )
    const rows = matrix.split(/\r?\n/).filter(line => line.startsWith('| `'))
    expect(rows).toHaveLength(routePolicyManifest.length)
    for (const route of routePolicyManifest) {
      expect(matrix).toContain(
        `| \`${route.method}\` | \`${route.path}\` | \`${route.operationId}\` | \`${route.policyId}\` |`,
      )
    }
    expect(matrix).toContain(
      '| `POST` | `/api/v1/auth/install` | `installWorkspace` | `route.installWorkspace` | bootstrap | `bootstrap` |',
    )
  })
})
