import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '@workmesh/db'
import { seedAgentSessionBearer } from './agent-session-test-credentials.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl)
  throw new Error('Autonomous control plane integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Autonomous control plane integration requires a dedicated *test* database.')

process.env.WORKMESH_WEB_PUSH_PUBLIC_KEY = 'BKPRygfOoDj2tSMtbJjC4DyT6Dzx2W9kgkJv1LvW2VHC6J9RAieg7JmNSPW2C68ktDN3_JtoLa_Et8Zcktx_wtg'
process.env.WORKMESH_WEB_PUSH_PRIVATE_KEY = 'yp_2oj7pDPeoTmf0DWzeSs0IttF4bAyH-zsxMb8qDGE'
process.env.WORKMESH_WEB_PUSH_SUBJECT = 'mailto:integration@workmesh.test'
process.env.WORKMESH_BETA_COORDINATION_MCP = 'true'

const { buildApp } = await import('../src/server.js')
const db = createDb(databaseUrl)
const app = buildApp()
type Reply = {
  statusCode: number
  headers: Record<string, string | string[] | number | undefined>
  json: <T>() => T
}
type Human = { cookie: string; csrf: string }
type Page<T> = { items: T[]; nextCursor: string | null }

const humanCall = async (
  human: Human,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
  headers: Record<string, string> = {},
  idempotencyKey = randomUUID(),
): Promise<Reply> => app.inject({
  method,
  url,
  payload,
  headers: {
    cookie: human.cookie,
    'x-csrf-token': human.csrf,
    'idempotency-key': idempotencyKey,
    ...headers,
  },
}) as unknown as Reply

const agentCall = async (token: string, url: string, payload: object): Promise<Reply> => app.inject({
  method: 'POST',
  url,
  payload,
  headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() },
}) as unknown as Reply

describe('autonomous control plane, browser push, and Agent enrollment', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE workspaces CASCADE')
  }, 300_000)

  afterAll(async () => {
    await app.close()
    await db.end()
  })

  it('auto-approves outside exclusions and keeps excluded approvals human-visible', async () => {
    const install = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/install',
      payload: {
        name: 'Autonomous Control Workspace',
        slug: `autonomy-${randomUUID().slice(0, 8)}`,
        adminName: 'Autonomy Admin',
        email: `${randomUUID()}@autonomy.test`,
        password: 'autonomy-integration-password',
      },
      headers: {
        'idempotency-key': randomUUID(),
        'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN!,
      },
    }) as unknown as Reply
    expect(install.statusCode, JSON.stringify(install.json())).toBe(200)
    const rawCookie = Array.isArray(install.headers['set-cookie'])
      ? install.headers['set-cookie'][0]
      : install.headers['set-cookie']
    const human = {
      cookie: String(rawCookie).split(';')[0] ?? '',
      csrf: install.json<{ csrfToken: string }>().csrfToken,
    }
    const actor = (await humanCall(human, 'GET', '/api/v1/auth/me'))
      .json<{ actor: { id: string; workspace_id: string } }>().actor
    const teamId = (await humanCall(human, 'GET', '/api/v1/teams'))
      .json<Page<{ id: string }>>().items[0]!.id
    const readyId = (await humanCall(human, 'GET', `/api/v1/teams/${teamId}/states`))
      .json<Page<{ id: string; name: string }>>().items.find(state => state.name === 'Ready')!.id
    const project = (await humanCall(human, 'POST', '/api/v1/projects', {
      teamId,
      name: 'Autonomy Project',
      leadActorId: actor.id,
    })).json<{ id: string }>()
    const work = (await humanCall(human, 'POST', '/api/v1/work-items', {
      teamId,
      projectId: project.id,
      title: 'Autonomy source work',
      statusId: readyId,
      responsibleHumanActorId: actor.id,
    })).json<{ id: string; revision: number }>()
    const capabilities = ['work:read', 'work:write']
    const agent = (await humanCall(human, 'POST', '/api/v1/agents/register', {
      slug: `autonomy-agent-${randomUUID().slice(0, 8)}`,
      name: 'Autonomy Agent',
      provider: 'fake',
      version: '1',
      supportedProtocols: ['native_http'],
      requestedCapabilities: capabilities,
      approvedCapabilities: capabilities,
      maxConcurrency: 1,
    })).json<{ id: string }>()
    expect((await humanCall(human, 'PUT', `/api/v1/agents/${agent.id}/team-access/${teamId}`, {
      approvedCapabilities: capabilities,
    })).statusCode).toBe(200)
    const started = await humanCall(human, 'POST', `/api/v1/work-items/${work.id}/agent-session`, {
      agentId: agent.id,
      principalHumanActorId: actor.id,
      role: 'executor',
      requestedCapabilities: capabilities,
      initialPrompt: 'Exercise the autonomy policy.',
      budget: {},
    }, { 'if-match': `"revision-${work.revision}"` })
    expect(started.statusCode, JSON.stringify(started.json())).toBe(200)
    const sessionId = started.json<{ session: { id: string } }>().session.id
    const sessionToken = await seedAgentSessionBearer(db, sessionId, agent.id)
    expect((await agentCall(sessionToken, `/api/v1/agent-sessions/${sessionId}/ack`, {
      summary: 'Autonomy test ready.', externalUrls: [],
    })).statusCode).toBe(200)

    const initialPolicy = await humanCall(human, 'GET', '/api/v1/approval-autonomy-policy')
    expect(initialPolicy.json<{ mode: string; revision: number }>()).toMatchObject({ mode: 'human_required', revision: 1 })
    const yolo = await humanCall(human, 'PUT', '/api/v1/approval-autonomy-policy', {
      mode: 'yolo', excludedProjectIds: [],
    }, { 'if-match': '"revision-1"' })
    expect(yolo.statusCode, JSON.stringify(yolo.json())).toBe(200)
    expect(yolo.json<{ mode: string; revision: number }>()).toMatchObject({ mode: 'yolo', revision: 2 })

    const requestApproval = async (suffix: string) => {
      const payload = { operation: suffix }
      return agentCall(sessionToken, '/api/v1/approvals', {
        sessionId,
        approvalType: 'protected_action',
        actionName: `autonomy.${suffix}`,
        actionPayloadSanitized: payload,
        actionPayloadHash: `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`,
        riskLevel: 'critical',
        rationaleSummary: `Autonomy ${suffix}`,
        requiredApprovals: 3,
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      })
    }
    const automatic = await requestApproval('automatic')
    expect(automatic.statusCode, JSON.stringify(automatic.json())).toBe(200)
    expect(automatic.json<{ status: string; decisions: Array<{ source: string; policy_revision: number }> }>()).toMatchObject({
      status: 'approved',
      decisions: [{ source: 'workspace_policy', policy_revision: 2 }],
    })
    const automaticId = automatic.json<{ id: string }>().id
    expect((await db.query('SELECT 1 FROM inbox_items WHERE source_type=\'approval\' AND source_id=$1', [automaticId])).rowCount).toBe(0)
    expect((await db.query('SELECT 1 FROM notifications WHERE source_type=\'approval\' AND source_id=$1', [automaticId])).rowCount).toBe(0)
    expect((await db.query("SELECT 1 FROM domain_events WHERE event_type='approval.auto_approved' AND aggregate_id=$1", [automaticId])).rowCount).toBe(1)

    const excluded = await humanCall(human, 'PUT', '/api/v1/approval-autonomy-policy', {
      mode: 'yolo', excludedProjectIds: [project.id],
    }, { 'if-match': '"revision-2"' })
    expect(excluded.statusCode, JSON.stringify(excluded.json())).toBe(200)
    const pending = await requestApproval('excluded')
    expect(pending.statusCode, JSON.stringify(pending.json())).toBe(200)
    expect(pending.json<{ status: string; decisions: unknown[] }>()).toMatchObject({ status: 'pending', decisions: [] })
    const pendingId = pending.json<{ id: string }>().id
    expect((await db.query('SELECT 1 FROM inbox_items WHERE source_type=\'approval\' AND source_id=$1 AND resolved_at IS NULL', [pendingId])).rowCount).toBe(1)
    const notification = (await db.query<{ title: string; body: string }>(
      'SELECT title,body FROM notifications WHERE source_type=\'approval\' AND source_id=$1',
      [pendingId],
    )).rows[0]!
    expect(notification).toEqual({ title: 'WorkMesh 中有新的审批请求', body: '请打开 WorkMesh 控制面处理。' })
    const activeApprovals = (await humanCall(human, 'GET', '/api/v1/human-attention?view=active&kind=approval&limit=50'))
      .json<Page<{ id: string; status: string }>>().items
    expect(activeApprovals).toEqual([expect.objectContaining({ id: `v1:approval:${pendingId}`, status: 'open' })])
    const approvalHistory = (await humanCall(human, 'GET', '/api/v1/human-attention?view=history&kind=approval&limit=50'))
      .json<Page<{ id: string; status: string }>>().items
    expect(approvalHistory).toContainEqual(expect.objectContaining({
      id: `v1:approval:${automaticId}`,
      status: 'decided',
    }))

    const pushConfig = await humanCall(human, 'GET', '/api/v1/browser-push/config')
    expect(pushConfig.json<{ configured: boolean; public_key: string }>()).toMatchObject({
      configured: true,
      public_key: process.env.WORKMESH_WEB_PUSH_PUBLIC_KEY,
    })
    const subscription = await humanCall(human, 'POST', '/api/v1/browser-push/subscriptions', {
      endpoint: `https://push.example.test/${randomUUID()}`,
      keys: { p256dh: 'integration-p256dh', auth: 'integration-auth' },
      deviceId: `integration-${randomUUID()}`,
    })
    expect(subscription.statusCode, JSON.stringify(subscription.json())).toBe(201)
    const subscriptionBody = subscription.json<{ id: string; revision: number; status: string }>()
    expect(subscriptionBody).toMatchObject({ revision: 1, status: 'active' })
    expect((await humanCall(human, 'GET', '/api/v1/browser-push/subscriptions'))
      .json<Page<{ id: string }>>().items.map(item => item.id)).toContain(subscriptionBody.id)
    expect((await humanCall(human, 'DELETE', `/api/v1/browser-push/subscriptions/${subscriptionBody.id}`, undefined, {
      'if-match': `"revision-${subscriptionBody.revision}"`,
    })).statusCode).toBe(204)

    const createdPolicy = await humanCall(human, 'POST', '/api/v1/agent-enrollment-policies', {
      name: 'Codex automatic enrollment',
      teamId,
      allowedClientTypes: ['codex'],
      capabilityCeiling: ['work:read', 'work:write'],
      grantAgentDelegate: false,
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      maxUses: 1,
    })
    expect(createdPolicy.statusCode, JSON.stringify(createdPolicy.json())).toBe(201)
    const enrollment = createdPolicy.json<{
      policy: { id: string; revision: number }
      enrollment_token: string
    }>()
    const redemptionKey = randomUUID()
    const redemptionPayload = {
      enrollmentToken: enrollment.enrollment_token,
      name: 'Auto-enrolled Codex',
      slug: `auto-enrolled-${randomUUID().slice(0, 8)}`,
      client: { type: 'codex', version: '1.0.0', runtime: 'integration' },
      manifest: { protocolVersion: 'v1' },
      requestedCapabilities: ['work:read', 'work:write'],
    }
    const redeem = await app.inject({
      method: 'POST',
      url: '/api/v1/agent-enrollments/redeem',
      payload: redemptionPayload,
      headers: { 'idempotency-key': redemptionKey },
    }) as unknown as Reply
    expect(redeem.statusCode, JSON.stringify(redeem.json())).toBe(200)
    const redeemed = redeem.json<{
      connection: { id: string; revision: number; source: string }
      installation_token: string
    }>()
    expect(redeemed.connection.source).toBe('enrollment')
    expect(redeemed.installation_token).toMatch(/^wmi_/)
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/agent-enrollments/redeem',
      payload: redemptionPayload,
      headers: { 'idempotency-key': redemptionKey },
    }) as unknown as Reply
    expect(replay.statusCode).toBe(200)
    expect(replay.json()).toEqual(redeem.json())
    const identity = await app.inject({
      method: 'GET',
      url: '/api/v1/agent-connections/current-identity',
      headers: { 'x-workmesh-installation-token': redeemed.installation_token },
    }) as unknown as Reply
    expect(identity.statusCode, JSON.stringify(identity.json())).toBe(200)
    expect(identity.json<{ connection: { id: string } }>().connection.id).toBe(redeemed.connection.id)
    const enrolledAgentId = (await db.query<{ agent_id: string }>(
      'SELECT agent_id FROM agent_connections WHERE id=$1',
      [redeemed.connection.id],
    )).rows[0]!.agent_id

    const singleUsePolicyResponse = await humanCall(human, 'POST', '/api/v1/agent-enrollment-policies', {
      name: 'Single-use concurrent enrollment',
      teamId,
      allowedClientTypes: ['codex'],
      capabilityCeiling: ['work:read'],
      grantAgentDelegate: false,
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      maxUses: 1,
    })
    expect(singleUsePolicyResponse.statusCode, JSON.stringify(singleUsePolicyResponse.json())).toBe(201)
    const singleUseToken = singleUsePolicyResponse.json<{ enrollment_token: string }>().enrollment_token
    const concurrentPrefix = randomUUID().slice(0, 8)
    const concurrentRedemptions = await Promise.all([0, 1].map(index => app.inject({
      method: 'POST',
      url: '/api/v1/agent-enrollments/redeem',
      payload: {
        enrollmentToken: singleUseToken,
        name: `Concurrent Agent ${index}`,
        slug: `concurrent-${concurrentPrefix}-${index}`,
        client: { type: 'codex', version: '1.0.0', runtime: 'integration' },
        manifest: { protocolVersion: 'v1' },
        requestedCapabilities: ['work:read'],
      },
      headers: { 'idempotency-key': randomUUID() },
    })))
    expect(concurrentRedemptions.map(response => response.statusCode).sort()).toEqual([200, 400])
    expect((await db.query<{ redemption_count: number }>(
      'SELECT redemption_count FROM agent_enrollment_policies WHERE token_hash=$1',
      [createHash('sha256').update(singleUseToken).digest('hex')],
    )).rows[0]!.redemption_count).toBe(1)

    expect((await humanCall(human, 'DELETE', `/api/v1/agent-connections/${redeemed.connection.id}`, undefined, {
      'if-match': `"revision-${redeemed.connection.revision}"`,
    })).statusCode).toBe(204)
    expect((await humanCall(human, 'DELETE', `/api/v1/agents/${enrolledAgentId}/team-access/${teamId}`)).statusCode).toBe(200)
    const archived = (await db.query<{ is_active: boolean; archived_at: Date | null; archive_reason: string | null }>(
      'SELECT is_active,archived_at,archive_reason FROM agent_definitions WHERE id=$1',
      [enrolledAgentId],
    )).rows[0]!
    expect(archived.is_active).toBe(false)
    expect(archived.archived_at).not.toBeNull()
    expect(archived.archive_reason).toBe('authorization_revoked')
    expect((await db.query("SELECT 1 FROM domain_events WHERE event_type='agent.archived' AND aggregate_id=$1", [enrolledAgentId])).rowCount).toBe(1)
  })
})
