import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '@workmesh/db'
import {
  humanAttentionItemSchema,
  humanAttentionListResponseSchema,
} from '@workmesh/contracts'
import { buildApp } from '../src/server.js'
import { seedAgentSessionBearer } from './agent-session-test-credentials.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl)
  throw new Error('Human Attention integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Human Attention integration requires a dedicated *test* database.')

const db = createDb(databaseUrl)
const app = buildApp()
type Response = {
  statusCode: number
  headers: Record<string, string | string[] | number | undefined>
  json: <T>() => T
}
type Human = { cookie: string; csrf: string }
type Page<T> = { items: T[]; nextCursor: string | null }

const humanCall = async (
  human: Human,
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  payload?: object,
  headers: Record<string, string> = {},
): Promise<Response> => await app.inject({
  method,
  url,
  payload,
  headers: {
    cookie: human.cookie,
    'x-csrf-token': human.csrf,
    'idempotency-key': randomUUID(),
    ...headers,
  },
}) as unknown as Response

const agentCall = async (
  token: string,
  method: 'GET' | 'POST',
  url: string,
  payload?: object,
  headers: Record<string, string> = {},
): Promise<Response> => await app.inject({
  method,
  url,
  payload,
  headers: {
    authorization: `Bearer ${token}`,
    'idempotency-key': randomUUID(),
    ...headers,
  },
}) as unknown as Response

describe('Human Attention projection acceptance', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE workspaces CASCADE')
  }, 300_000)
  afterAll(async () => { await app.close(); await db.end() })

  it('rebuilds six typed kinds and keeps list/detail scope non-inferential', async () => {
    const install = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/install',
      payload: {
        name: 'Human Attention Workspace',
        slug: `attention-${randomUUID().slice(0, 8)}`,
        adminName: 'Attention Admin',
        email: `${randomUUID()}@attention.test`,
        password: 'human-attention-test-password',
      },
      headers: {
        'idempotency-key': randomUUID(),
        'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN!,
      },
    }) as unknown as Response
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
      name: 'Attention Project',
    })).json<{ id: string }>()
    const work = (await humanCall(human, 'POST', '/api/v1/work-items', {
      teamId,
      projectId: project.id,
      title: 'Attention source work',
      statusId: readyId,
      responsibleHumanActorId: actor.id,
    })).json<{ id: string; revision: number }>()
    const capabilities = ['work:read', 'work:write']
    const registeredResponse = await humanCall(human, 'POST', '/api/v1/agents/register', {
      slug: `attention-agent-${randomUUID().slice(0, 8)}`,
      name: 'Attention Agent',
      provider: 'fake',
      version: '1',
      supportedProtocols: ['native_http'],
      requestedCapabilities: capabilities,
      approvedCapabilities: capabilities,
      maxConcurrency: 1,
    })
    expect(registeredResponse.statusCode, JSON.stringify(registeredResponse.json())).toBe(200)
    const agent = registeredResponse.json<{ id: string }>()
    expect((await humanCall(human, 'PUT', `/api/v1/agents/${agent.id}/team-access/${teamId}`, {
      approvedCapabilities: capabilities,
    })).statusCode).toBe(200)
    const startedResponse = await humanCall(
      human,
      'POST',
      `/api/v1/work-items/${work.id}/agent-session`,
      {
        agentId: agent.id,
        principalHumanActorId: actor.id,
        role: 'executor',
        requestedCapabilities: capabilities,
        initialPrompt: 'Create typed Human Attention fixtures.',
        budget: {},
      },
      { 'if-match': `"revision-${work.revision}"` },
    )
    expect(startedResponse.statusCode, JSON.stringify(startedResponse.json())).toBe(200)
    const session = startedResponse.json<{ session: { id: string } }>().session
    const token = await seedAgentSessionBearer(db, session.id, agent.id)
    const acknowledged = await agentCall(token, 'POST', `/api/v1/agent-sessions/${session.id}/ack`, {
      summary: 'Attention projection fixture ready.',
      externalUrls: [],
    })
    expect(acknowledged.statusCode, JSON.stringify(acknowledged.json())).toBe(200)

    const decision = await agentCall(token, 'POST', `/api/v1/agent-sessions/${session.id}/decisions`, {
      title: 'Choose the recovery path',
      rationale: 'A Human must select the authoritative option.',
      options: ['retry', 'handoff'],
      evidence: [],
      affectedResources: [{ resourceType: 'work_item', resourceId: work.id, impact: 'execution' }],
    })
    expect(decision.statusCode, JSON.stringify(decision.json())).toBe(200)
    const approvalPayload = { target: 'delivery' }
    const approval = await agentCall(token, 'POST', '/api/v1/approvals', {
      sessionId: session.id,
      approvalType: 'protected_action',
      actionName: 'retry_delivery',
      actionPayloadSanitized: approvalPayload,
      actionPayloadHash: `sha256:${createHash('sha256').update(JSON.stringify(approvalPayload)).digest('hex')}`,
      riskLevel: 'high',
      rationaleSummary: 'Retrying the delivery needs approval.',
      requiredApprovals: 1,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
    })
    expect(approval.statusCode, JSON.stringify(approval.json())).toBe(200)

    const agentActorId = (await db.query<{ actor_id: string }>(
      'SELECT actor_id FROM agent_definitions WHERE id=$1',
      [agent.id],
    )).rows[0]!.actor_id
    for (const kind of ['waiting_input', 'blocker', 'session_stale'] as const) {
      await db.query(
        `INSERT INTO inbox_items(
           workspace_id,recipient_human_actor_id,recipient_actor_id,session_id,
           team_id,kind,source_type,source_id,requires_response,payload
         ) VALUES($1,$2,$2,$3,$4,$5,'activity',$6,true,$7)`,
        [
          actor.workspace_id,
          actor.id,
          session.id,
          teamId,
          kind,
          randomUUID(),
          { summary: `${kind} fixture` },
        ],
      )
    }
    const completion = await agentCall(token, 'POST', `/api/v1/projects/${project.id}/completion-suggestions`, {
      workItemId: work.id,
      rationale: 'Evidence is ready for Human acceptance.',
      evidenceArtifactIds: [],
    })
    expect(completion.statusCode, JSON.stringify(completion.json())).toBe(200)

    const first = await humanCall(human, 'GET', '/api/v1/human-attention?status=open&limit=50')
    expect(first.statusCode, JSON.stringify(first.json())).toBe(200)
    const firstPage = humanAttentionListResponseSchema.parse(first.json())
    expect(new Set(firstPage.items.map(item => item.kind))).toEqual(new Set([
      'decision',
      'approval',
      'clarification',
      'conflict',
      'recovery',
      'completion_review',
    ]))
    expect(firstPage.items.every(item => item.requestedBy.id === agentActorId)).toBe(true)
    expect(firstPage.items.find(item => item.kind === 'approval')).toMatchObject({
      severity: 'high',
      urgency: 'immediate',
      options: [{ id: 'approve' }, { id: 'reject' }],
    })

    const rebuilt = humanAttentionListResponseSchema.parse(
      (await humanCall(human, 'GET', '/api/v1/human-attention?status=open&limit=50')).json(),
    )
    expect(rebuilt.items.map(item => item.id).sort()).toEqual(
      firstPage.items.map(item => item.id).sort(),
    )
    const selected = firstPage.items.find(item => item.kind === 'decision')!
    const detail = await humanCall(human, 'GET', `/api/v1/human-attention/${encodeURIComponent(selected.id)}`)
    expect(detail.statusCode, JSON.stringify(detail.json())).toBe(200)
    expect(humanAttentionItemSchema.parse(detail.json())).toMatchObject({
      id: selected.id,
      source: selected.source,
      sourceRevision: selected.sourceRevision,
      kind: selected.kind,
      status: selected.status,
    })

    const otherProject = (await humanCall(human, 'POST', '/api/v1/projects', {
      teamId,
      name: 'Out of scope project',
    })).json<{ id: string }>()
    const otherWork = (await humanCall(human, 'POST', '/api/v1/work-items', {
      teamId,
      projectId: otherProject.id,
      title: 'Out of scope completion',
      statusId: readyId,
      responsibleHumanActorId: actor.id,
    })).json<{ id: string }>()
    const otherSuggestion = (await db.query<{ id: string }>(
      `INSERT INTO completion_suggestions(
         workspace_id,project_id,work_item_id,suggested_by_actor_id,rationale
       ) VALUES($1,$2,$3,$4,'Must remain outside the exact Agent scope')
       RETURNING id`,
      [actor.workspace_id, otherProject.id, otherWork.id, agentActorId],
    )).rows[0]!

    const agentPageResponse = await agentCall(token, 'GET', '/api/v1/human-attention?status=open&limit=50')
    expect(agentPageResponse.statusCode, JSON.stringify(agentPageResponse.json())).toBe(200)
    const agentPage = humanAttentionListResponseSchema.parse(agentPageResponse.json())
    expect(agentPage.items.some(item => item.source.id === otherSuggestion.id)).toBe(false)
    const deniedDetail = await agentCall(
      token,
      'GET',
      `/api/v1/human-attention/${encodeURIComponent(`v1:completion_suggestion:${otherSuggestion.id}`)}`,
    )
    expect(deniedDetail.statusCode).toBe(404)
    expect(deniedDetail.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'NOT_FOUND' } })

    await db.query(
      `UPDATE inbox_items
          SET status='resolved',resolved_at=now(),resolved_by_actor_id=$2,
              revision=revision+1,updated_at=now()
        WHERE session_id=$1 AND kind='session_stale' AND status='open'`,
      [session.id, actor.id],
    )
    await db.query(
      `UPDATE agent_sessions
          SET state='failed',error_code='EXECUTION_FAILED',
              error_summary='Recovery fixture failed',ended_at=now(),
              revision=revision+1,updated_at=now()
        WHERE id=$1`,
      [session.id],
    )
    const failedRecovery = humanAttentionListResponseSchema.parse(
      (await humanCall(human, 'GET', '/api/v1/human-attention?kind=recovery&status=open&limit=50')).json(),
    )
    expect(failedRecovery.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `v1:agent_session:${session.id}`,
        reasonCodes: ['recovery.session_failed'],
        source: expect.objectContaining({ status: 'failed' }),
      }),
    ]))

    await db.query(
      `INSERT INTO agent_sessions(
         workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,
         project_id,state,state_reason,budget,retry_of_session_id
       )
       SELECT workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,
              project_id,'queued','Recovery fixture retry',budget,id
         FROM agent_sessions WHERE id=$1`,
      [session.id],
    )
    const recovered = humanAttentionListResponseSchema.parse(
      (await humanCall(human, 'GET', '/api/v1/human-attention?kind=recovery&status=open&limit=50')).json(),
    )
    expect(recovered.items.some(item => item.id === `v1:agent_session:${session.id}`)).toBe(false)
  }, 300_000)
})
