import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '@workmesh/db'
import { agentCapabilityManifestResponseSchema, guidanceDiffResponseSchema, guidanceHistoryResponseSchema, guidanceResponseSchema, sessionContextResponseSchema } from '@workmesh/contracts'
import { buildApp } from '../src/server.js'
import { seedAgentSessionBearer } from './agent-session-test-credentials.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Guidance integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Guidance integration requires a dedicated *test* database.')

const db = createDb(databaseUrl)
const app = buildApp()
type Response = { statusCode: number; headers: Record<string, string | string[] | number | undefined>; json: <T>() => T }
type Human = { cookie: string; csrf: string }
type Page<T> = { items: T[]; nextCursor: string | null }

const humanCall = async (human: Human, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object, headers: Record<string, string> = {}): Promise<Response> =>
  await app.inject({ method, url, payload, headers: { cookie: human.cookie, 'x-csrf-token': human.csrf, 'idempotency-key': randomUUID(), ...headers } }) as unknown as Response
const agentCall = async (token: string, url: string): Promise<Response> =>
  await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } }) as unknown as Response

describe('versioned Guidance acceptance', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE workspaces CASCADE')
  }, 300_000)
  afterAll(async () => { await app.close(); await db.end() })

  it('publishes immutable scoped revisions, pins Session context, and audits pointer-only rollback', async () => {
    const install = await app.inject({
      method: 'POST', url: '/api/v1/auth/install',
      payload: { name: 'Guidance Workspace', slug: `guidance-${randomUUID().slice(0, 8)}`, adminName: 'Guidance Admin', email: `${randomUUID()}@guidance.test`, password: 'guidance-test-password' },
      headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! },
    }) as unknown as Response
    expect(install.statusCode, JSON.stringify(install.json())).toBe(200)
    const rawCookie = Array.isArray(install.headers['set-cookie']) ? install.headers['set-cookie'][0] : install.headers['set-cookie']
    const human = { cookie: String(rawCookie).split(';')[0] ?? '', csrf: install.json<{ csrfToken: string }>().csrfToken }
    const me = await humanCall(human, 'GET', '/api/v1/auth/me')
    const actor = me.json<{ actor: { id: string; workspace_id: string } }>().actor
    const teamId = (await humanCall(human, 'GET', '/api/v1/teams')).json<Page<{ id: string }>>().items[0]!.id
    const projectResponse = await humanCall(human, 'POST', '/api/v1/projects', { teamId, name: 'Guided Project', description: 'Product intent remains a Project description.' })
    expect(projectResponse.statusCode, JSON.stringify(projectResponse.json())).toBe(200)
    const projectId = projectResponse.json<{ id: string }>().id

    for (const [scope, id] of [['workspaces', actor.workspace_id], ['teams', teamId], ['projects', projectId]] as const) {
      const unpublished = guidanceResponseSchema.parse((await humanCall(human, 'GET', `/api/v1/${scope}/${id}/guidance`)).json())
      expect(unpublished).toMatchObject({ status: 'unpublished', revision: 0, markdown: '', currentRevision: null })
    }
    expect((await db.query<{ description: string }>('SELECT description FROM projects WHERE id=$1', [projectId])).rows[0]!.description).toBe('Product intent remains a Project description.')

    const publish = async (scope: 'workspaces' | 'teams' | 'projects', id: string, markdown: string, changeSummary: string, revision = 0, key = randomUUID()): Promise<Response> =>
      humanCall(human, 'PUT', `/api/v1/${scope}/${id}/guidance`, { markdown, changeSummary }, { 'if-match': `"revision-${revision}"`, 'idempotency-key': key })
    const workspaceMarkdown = '# Workspace\n\nFollow platform policy.'
    const teamV1Markdown = '# Team\n\nPrefer small reversible changes.'
    const projectMarkdown = '# Project\n\nPreserve the release evidence.'
    expect((await publish('workspaces', actor.workspace_id, workspaceMarkdown, 'Workspace baseline')).statusCode).toBe(200)
    const teamKey = randomUUID()
    const teamV1Response = await publish('teams', teamId, teamV1Markdown, 'Team baseline', 0, teamKey)
    const teamV1Replay = await publish('teams', teamId, teamV1Markdown, 'Team baseline', 0, teamKey)
    expect([teamV1Response.statusCode, teamV1Replay.statusCode]).toEqual([200, 200])
    expect(teamV1Replay.json()).toEqual(teamV1Response.json())
    const teamV1 = guidanceResponseSchema.parse(teamV1Response.json())
    expect(teamV1.currentRevision).toMatchObject({ revisionNumber: 1, authorActorId: actor.id, authorDisplayName: 'Guidance Admin', contentHash: `sha256:${createHash('sha256').update(teamV1Markdown).digest('hex')}` })
    expect((await publish('projects', projectId, projectMarkdown, 'Project baseline')).statusCode).toBe(200)

    const rejectedSecret = await publish('projects', projectId, 'token: super-secret-value', 'must be rejected', 1)
    expect(rejectedSecret.statusCode).toBe(400)
    expect(rejectedSecret.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM guidance_revisions WHERE document_id=$1', [guidanceResponseSchema.parse((await humanCall(human, 'GET', `/api/v1/projects/${projectId}/guidance`)).json()).documentId])).rows[0]!.count).toBe(1)

    const readyId = (await humanCall(human, 'GET', `/api/v1/teams/${teamId}/states`)).json<Page<{ id: string; name: string }>>().items.find(state => state.name === 'Ready')!.id
    const work = await humanCall(human, 'POST', '/api/v1/work-items', { teamId, projectId, title: 'Pinned Guidance work', statusId: readyId, responsibleHumanActorId: actor.id })
    const workItem = work.json<{ id: string; revision: number }>()
    const capabilities = ['work:read', 'work:write', 'plan:write']
    const registration = await humanCall(human, 'POST', '/api/v1/agents/register', { slug: `guidance-agent-${randomUUID().slice(0, 8)}`, name: 'Guidance Agent', provider: 'fake', version: '1', supportedProtocols: ['native_http'], requestedCapabilities: capabilities, approvedCapabilities: capabilities, maxConcurrency: 1 })
    expect(registration.statusCode, JSON.stringify(registration.json())).toBe(200)
    const registered = registration.json<{ id: string }>()
    expect((await humanCall(human, 'PUT', `/api/v1/agents/${registered.id}/team-access/${teamId}`, { approvedCapabilities: capabilities })).statusCode).toBe(200)
    const startedResponse = await humanCall(human, 'POST', `/api/v1/work-items/${workItem.id}/agent-session`, { agentId: registered.id, principalHumanActorId: actor.id, role: 'executor', requestedCapabilities: capabilities, initialPrompt: 'Use pinned Guidance.', budget: {} }, { 'if-match': `"revision-${workItem.revision}"` })
    expect(startedResponse.statusCode, JSON.stringify(startedResponse.json())).toBe(200)
    const started = startedResponse.json<{ session: { id: string } }>().session
    const token = await seedAgentSessionBearer(db, started.id, registered.id)
    const humanManifest = await humanCall(human, 'GET', '/api/v1/agent-capabilities')
    expect(humanManifest.statusCode).toBe(403)
    const manifestResponse = await app.inject({ method: 'GET', url: '/api/v1/agent-capabilities', headers: { authorization: `Bearer ${token}`, 'workmesh-client-profile': '1.0' } }) as unknown as Response
    expect(manifestResponse.statusCode, JSON.stringify(manifestResponse.json())).toBe(200)
    const manifest = agentCapabilityManifestResponseSchema.parse(manifestResponse.json())
    expect(manifest.agent).toMatchObject({ sessionId: started.id, supportedProtocols: ['native_http'] })
    expect(manifest.agent.effectiveCapabilities).toEqual(expect.arrayContaining(capabilities))
    expect(manifest.operations.find(operation => operation.operationId === 'getAgentCapabilityManifest')).toMatchObject({ supported: true, eligibleByCapability: true, transports: { mcpBindings: expect.arrayContaining(['resource:agent-capabilities']) } })
    expect(manifest.extensions.find(extension => extension.id === 'workmesh.engineering-graph')).toMatchObject({ enabled: false, negotiationRequired: true })

    const limitedWorkResponse = await humanCall(human, 'POST', '/api/v1/work-items', { teamId, projectId, title: 'Capability discovery without read grant', statusId: readyId, responsibleHumanActorId: actor.id })
    expect(limitedWorkResponse.statusCode, JSON.stringify(limitedWorkResponse.json())).toBe(200)
    const limitedWork = limitedWorkResponse.json<{ id: string; revision: number }>()
    const limitedCapabilities = ['work:write']
    const limitedAssignmentCapabilities = ['work:read', 'work:write']
    const limitedRegistration = await humanCall(human, 'POST', '/api/v1/agents/register', { slug: `limited-agent-${randomUUID().slice(0, 8)}`, name: 'Limited Agent', provider: 'fake', version: '1', supportedProtocols: ['native_http'], requestedCapabilities: limitedAssignmentCapabilities, approvedCapabilities: limitedAssignmentCapabilities, maxConcurrency: 1 })
    expect(limitedRegistration.statusCode, JSON.stringify(limitedRegistration.json())).toBe(200)
    const limitedAgent = limitedRegistration.json<{ id: string }>()
    expect((await humanCall(human, 'PUT', `/api/v1/agents/${limitedAgent.id}/team-access/${teamId}`, { approvedCapabilities: limitedAssignmentCapabilities })).statusCode).toBe(200)
    const limitedStartedResponse = await humanCall(human, 'POST', `/api/v1/work-items/${limitedWork.id}/agent-session`, { agentId: limitedAgent.id, principalHumanActorId: actor.id, role: 'executor', requestedCapabilities: limitedAssignmentCapabilities, initialPrompt: 'Discover supported operations.', budget: {} }, { 'if-match': `"revision-${limitedWork.revision}"` })
    expect(limitedStartedResponse.statusCode, JSON.stringify(limitedStartedResponse.json())).toBe(200)
    const limitedStarted = limitedStartedResponse.json<{ session: { id: string } }>().session
    const limitedToken = await seedAgentSessionBearer(db, limitedStarted.id, limitedAgent.id)
    await db.query(
      'UPDATE agent_definitions SET approved_capabilities=$2 WHERE id=$1',
      [limitedAgent.id, limitedCapabilities],
    )
    await db.query(
      'UPDATE agent_team_access SET approved_capabilities=$3 WHERE agent_id=$1 AND team_id=$2',
      [limitedAgent.id, teamId, limitedCapabilities],
    )
    const limitedManifestResponse = await app.inject({ method: 'GET', url: '/api/v1/agent-capabilities', headers: { authorization: `Bearer ${limitedToken}`, 'workmesh-client-profile': '1.0' } }) as unknown as Response
    expect(limitedManifestResponse.statusCode, JSON.stringify(limitedManifestResponse.json())).toBe(200)
    const limitedManifest = agentCapabilityManifestResponseSchema.parse(limitedManifestResponse.json())
    expect(limitedManifest.agent.effectiveCapabilities).toEqual(limitedCapabilities)
    expect(limitedManifest.operations.find(operation => operation.operationId === 'getAgentCapabilityManifest')).toMatchObject({ eligibleByCapability: true, requirements: { capabilities: [] } })
    const limitedAcknowledged = await app.inject({ method: 'POST', url: `/api/v1/agent-sessions/${limitedStarted.id}/ack`, payload: { summary: 'Capability discovery complete', externalUrls: [] }, headers: { authorization: `Bearer ${limitedToken}`, 'idempotency-key': randomUUID() } }) as unknown as Response
    expect(limitedAcknowledged.statusCode, JSON.stringify(limitedAcknowledged.json())).toBe(200)
    const limitedContext = await agentCall(limitedToken, `/api/v1/agent-sessions/${limitedStarted.id}/context`)
    expect(limitedContext.statusCode).toBe(403)
    expect(limitedContext.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'CAPABILITY_DENIED' } })

    const unsupportedProfile = await app.inject({ method: 'GET', url: '/api/v1/agent-capabilities', headers: { authorization: `Bearer ${token}`, 'workmesh-client-profile': '2.0' } }) as unknown as Response
    expect(unsupportedProfile.statusCode).toBe(400)
    expect(unsupportedProfile.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'PROFILE_VERSION_UNSUPPORTED' } })
    const acknowledged = await app.inject({ method: 'POST', url: `/api/v1/agent-sessions/${started.id}/ack`, payload: { summary: 'Guidance loaded', externalUrls: [] }, headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() } }) as unknown as Response
    expect(acknowledged.statusCode, JSON.stringify(acknowledged.json())).toBe(200)
    const executing = await app.inject({ method: 'POST', url: `/api/v1/agent-sessions/${started.id}/state`, payload: { state: 'executing', reason: 'Validate pinned Guidance' }, headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID(), 'if-match': `"revision-${acknowledged.json<{ revision: number }>().revision}"` } }) as unknown as Response
    expect(executing.statusCode, JSON.stringify(executing.json())).toBe(200)
    const planStepId = randomUUID()
    const publishedPlan = await app.inject({
      method: 'PUT', url: `/api/v1/agent-sessions/${started.id}/plan`,
      payload: { changeSummary: 'Exercise the pinned Context plan projection.', steps: [{ id: planStepId, title: 'Read Guidance', description: 'Use the pinned revisions.', status: 'in_progress', ordinal: 0, dependsOn: [], acceptanceCriteria: ['Context remains parseable'], expectedArtifacts: [] }] },
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID(), 'if-match': `"revision-${executing.json<{ revision: number }>().revision}"` },
    }) as unknown as Response
    expect(publishedPlan.statusCode, JSON.stringify(publishedPlan.json())).toBe(200)
    const contextBefore = await agentCall(token, `/api/v1/agent-sessions/${started.id}/context`)
    expect(contextBefore.statusCode, JSON.stringify(contextBefore.json())).toBe(200)
    const pinnedBefore = sessionContextResponseSchema.parse(contextBefore.json())
    expect(pinnedBefore.plan?.steps).toMatchObject([{ id: planStepId, description: 'Use the pinned revisions.' }])
    expect(pinnedBefore.plan?.steps[0]).not.toHaveProperty('ownerActorId')
    expect(pinnedBefore.plan?.steps[0]).not.toHaveProperty('cancellationReason')
    expect(pinnedBefore.guidancePins.map(pin => pin.scope)).toEqual(['workspace', 'team', 'project'])
    const pinnedTeam = pinnedBefore.guidancePins.find(pin => pin.scope === 'team')!
    expect(pinnedTeam).toMatchObject({ revisionId: teamV1.currentRevision!.id, contentHash: teamV1.currentRevision!.contentHash })
    const snapshotManifest = (await db.query<{ manifest: { scope: unknown } }>('SELECT manifest FROM context_snapshots WHERE id=$1', [pinnedBefore.contextSnapshotId])).rows[0]!.manifest
    expect(snapshotManifest.scope).toEqual({ workspaceId: actor.workspace_id, teamId, projectId })

    const otherTeam = await humanCall(human, 'POST', '/api/v1/teams', { name: 'Other Team', key: `O${randomUUID().replaceAll('-', '').slice(0, 5).toUpperCase()}` })
    expect(otherTeam.statusCode, JSON.stringify(otherTeam.json())).toBe(200)
    expect((await agentCall(token, `/api/v1/teams/${otherTeam.json<{ id: string }>().id}/guidance`)).statusCode).toBe(403)

    const teamV2Markdown = '# Team\n\nPrefer small reversible changes.\n\nRecord evidence.'
    const concurrent = await Promise.all([
      publish('teams', teamId, teamV2Markdown, 'Add evidence rule', 1),
      publish('teams', teamId, `${teamV2Markdown}\n\nConflicting edit.`, 'Concurrent edit', 1),
    ])
    expect(concurrent.map(response => response.statusCode).sort()).toEqual([200, 409])
    const teamV2 = guidanceResponseSchema.parse(concurrent.find(response => response.statusCode === 200)!.json())
    const stale = await publish('teams', teamId, '# Stale', 'Stale edit', 1)
    expect(stale.statusCode).toBe(409)
    const contextAfter = await agentCall(token, `/api/v1/agent-sessions/${started.id}/context`)
    expect(contextAfter.statusCode, JSON.stringify(contextAfter.json())).toBe(200)
    const pinnedAfter = sessionContextResponseSchema.parse(contextAfter.json())
    expect(pinnedAfter.guidancePins.find(pin => pin.scope === 'team')).toEqual(pinnedTeam)

    const historyResponse = await humanCall(human, 'GET', `/api/v1/teams/${teamId}/guidance/history`)
    expect(historyResponse.statusCode).toBe(200)
    const history = guidanceHistoryResponseSchema.parse(historyResponse.json())
    expect(history.revisions.map(revision => revision.revisionNumber)).toEqual([2, 1])
    const diffResponse = await humanCall(human, 'GET', `/api/v1/teams/${teamId}/guidance/diff?fromRevisionId=${teamV1.currentRevision!.id}&toRevisionId=${teamV2.currentRevision!.id}`)
    expect(diffResponse.statusCode, JSON.stringify(diffResponse.json())).toBe(200)
    expect(guidanceDiffResponseSchema.parse(diffResponse.json()).changes.some(change => change.kind === 'added' && change.text === 'Record evidence.')).toBe(true)

    const rolledBackResponse = await humanCall(human, 'POST', `/api/v1/teams/${teamId}/guidance/rollback`, { revisionId: teamV1.currentRevision!.id, reason: 'Restore reviewed guidance' }, { 'if-match': `"revision-${teamV2.revision}"` })
    expect(rolledBackResponse.statusCode, JSON.stringify(rolledBackResponse.json())).toBe(200)
    const rolledBack = guidanceResponseSchema.parse(rolledBackResponse.json())
    expect(rolledBack).toMatchObject({ status: 'active', markdown: teamV1Markdown, currentRevision: { id: teamV1.currentRevision!.id } })
    const archivedResponse = await humanCall(human, 'POST', `/api/v1/teams/${teamId}/guidance/archive`, { reason: 'Superseded by a future policy' }, { 'if-match': `"revision-${rolledBack.revision}"` })
    expect(archivedResponse.statusCode, JSON.stringify(archivedResponse.json())).toBe(200)
    expect(guidanceResponseSchema.parse(archivedResponse.json())).toMatchObject({ status: 'archived', markdown: '', currentRevision: { id: teamV1.currentRevision!.id } })
    const finalHistory = guidanceHistoryResponseSchema.parse((await humanCall(human, 'GET', `/api/v1/teams/${teamId}/guidance/history`)).json())
    expect(finalHistory.revisions).toHaveLength(2)
    expect(finalHistory.audit.map(fact => fact.action)).toEqual(expect.arrayContaining(['published', 'rolled_back', 'archived']))

    const events = await db.query<{ payload: Record<string, unknown> }>("SELECT payload FROM domain_events WHERE aggregate_id=$1 AND event_type LIKE 'guidance.%'", [teamId])
    expect(events.rows.length).toBeGreaterThanOrEqual(4)
    expect(JSON.stringify(events.rows)).not.toContain(teamV1Markdown)
  })
})
