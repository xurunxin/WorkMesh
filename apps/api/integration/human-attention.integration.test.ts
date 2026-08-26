import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '@workmesh/db'
import {
  humanAttentionItemSchema,
  humanAttentionListResponseSchema,
  actionPreviewResponseSchema,
  controlCenterResponseSchema,
  runExplanationResponseSchema,
  workItemExecutionSummaryResponseSchema,
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
      leadActorId: actor.id,
      targetDate: '2026-09-30',
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
    const approvalId = approval.json<{ id: string }>().id

    const agentActorId = (await db.query<{ actor_id: string }>(
      'SELECT actor_id FROM agent_definitions WHERE id=$1',
      [agent.id],
    )).rows[0]!.actor_id
    const clarificationMessage = (await db.query<{ id: string }>(
      `INSERT INTO room_messages(channel_id,workspace_id,author_actor_id,session_id,intent,recipient_actor_id,body,requires_response)
       SELECT channel.id,$1,$2,$3,'ask',$4,'Which release branch should execution use?',true
         FROM work_room_channels channel
        WHERE channel.workspace_id=$1 AND channel.subject_kind='session' AND channel.subject_id=$3
       RETURNING id`,
      [actor.workspace_id, agentActorId, session.id, actor.id],
    )).rows[0]!
    await db.query(
      `INSERT INTO inbox_items(
         workspace_id,recipient_human_actor_id,recipient_actor_id,session_id,
         team_id,kind,source_type,source_id,source_room_message_id,requires_response,payload
       ) VALUES($1,$2,$2,$3,$4,'waiting_input','room_message',$5,$5,true,$6)`,
      [actor.workspace_id, actor.id, session.id, teamId, clarificationMessage.id, { summary: 'waiting_input fixture' }],
    )
    for (const kind of ['blocker', 'session_stale'] as const) {
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

    for (let index = 0; index < 3; index += 1) {
      const activity = await agentCall(token, 'POST', `/api/v1/agent-sessions/${session.id}/activities`, {
        kind: 'action_completed',
        summary: 'Read the same bounded source',
        artifactIds: [],
        references: [],
        visibility: 'team',
        ephemeral: false,
      })
      expect(activity.statusCode, JSON.stringify(activity.json())).toBe(200)
    }

    const planVersion = (await db.query<{ id: string }>(
      `INSERT INTO agent_plan_versions(session_id,revision,change_summary,author_actor_id)
       VALUES($1,1,'Project Control Center digest fixture',$2) RETURNING id`,
      [session.id, agentActorId],
    )).rows[0]!
    const planStepId = randomUUID()
    await db.query(
      `INSERT INTO agent_plan_steps(plan_version_id,id,title,status,ordinal)
       VALUES($1,$2,'Verify authoritative digest','in_progress',0)`,
      [planVersion.id, planStepId],
    )
    await db.query(
      `UPDATE agent_sessions
          SET current_plan_version_id=$2,heartbeat_current_step_id=$3,
              heartbeat_health='healthy',last_heartbeat_at=now(),revision=revision+1
        WHERE id=$1`,
      [session.id, planVersion.id, planStepId],
    )
    const runningEvidence = (await db.query<{ id: string }>(
      `INSERT INTO artifacts(workspace_id,session_id,work_item_id,producer_actor_id,type,title,uri)
       VALUES($1,$2,$3,$4,'test_report','Control Center running evidence','https://example.test/running-evidence') RETURNING id`,
      [actor.workspace_id, session.id, work.id, agentActorId],
    )).rows[0]!

    const completedWithoutEvidence = (await db.query<{ id: string }>(
      `INSERT INTO agent_sessions(
         workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,
         state,result_summary,ended_at
       ) SELECT workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,
                'completed','Completed without evidence',now()
           FROM agent_sessions WHERE id=$1 RETURNING id`,
      [session.id],
    )).rows[0]!
    const completedWithEvidence = (await db.query<{ id: string }>(
      `INSERT INTO agent_sessions(
         workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,
         state,result_summary,ended_at
       ) SELECT workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,
                'completed','Completed with evidence',now()+interval '1 second'
           FROM agent_sessions WHERE id=$1 RETURNING id`,
      [session.id],
    )).rows[0]!
    await db.query(
      `INSERT INTO artifacts(workspace_id,session_id,work_item_id,producer_actor_id,type,title,uri)
       VALUES($1,$2,$3,$4,'test','Verified outcome evidence','https://example.test/verified-evidence')`,
      [actor.workspace_id, completedWithEvidence.id, work.id, agentActorId],
    )

    const controlCenterResponse = await humanCall(human, 'GET', `/api/v1/projects/${project.id}/control-center`)
    expect(controlCenterResponse.statusCode, JSON.stringify(controlCenterResponse.json())).toBe(200)
    expect(controlCenterResponse.headers.etag).toMatch(/^"control-center-v1-/)
    const controlCenter = controlCenterResponseSchema.parse(controlCenterResponse.json())
    expect(controlCenter.project?.id).toBe(project.id)
    expect(controlCenter.project).toMatchObject({ targetDate: '2026-09-30', responsibleHuman: { id: actor.id, kind: 'human' } })
    expect(controlCenter.collections.running.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sessionId: session.id,
        activeAgent: expect.objectContaining({ id: agentActorId, kind: 'agent' }),
        responsibleHuman: expect.objectContaining({ id: actor.id, kind: 'human' }),
        workItem: expect.objectContaining({ id: work.id, title: 'Attention source work' }),
        currentStep: expect.objectContaining({ id: planStepId, title: 'Verify authoritative digest' }),
        health: expect.objectContaining({ heartbeat: 'healthy', lastHeartbeatAt: expect.any(String) }),
        lastActivity: expect.objectContaining({ kind: 'action_completed', summary: 'Read the same bounded source' }),
        pendingHumanActionCount: expect.any(Number),
        evidenceCount: 1,
        verified: true,
      }),
    ]))
    expect(controlCenter.collections.attention.items.length).toBeGreaterThanOrEqual(3)
    expect(controlCenter.collections.recently_verified.items.map(item => item.sessionId)).toContain(completedWithEvidence.id)
    expect(controlCenter.collections.recently_verified.items.map(item => item.sessionId)).not.toContain(completedWithoutEvidence.id)

    const filteredControlCenter = controlCenterResponseSchema.parse((await humanCall(
      human,
      'GET',
      `/api/v1/projects/${project.id}/control-center?responsibleHumanActorId=${actor.id}&agentActorId=${agentActorId}&workItemState=planned&timeWindow=24h`,
    )).json())
    expect(filteredControlCenter.collections.running.items.map(item => item.sessionId)).toContain(session.id)
    const emptyAgentFilter = controlCenterResponseSchema.parse((await humanCall(
      human,
      'GET',
      `/api/v1/projects/${project.id}/control-center?agentActorId=${randomUUID()}`,
    )).json())
    expect(emptyAgentFilter.collections.running.items).toHaveLength(0)

    await db.query(
      `INSERT INTO work_items(workspace_id,team_id,number,title,status_id,priority,responsible_human_actor_id,labels,project_id)
       SELECT $1,$2,1000+series,concat('Ready fixture ',series),$3,'medium',$4,'{}'::text[],$5
         FROM generate_series(1,150) series`,
      [actor.workspace_id, teamId, readyId, actor.id, project.id],
    )
    const readyFirst = controlCenterResponseSchema.parse((await humanCall(
      human,
      'GET',
      `/api/v1/projects/${project.id}/control-center?collection=ready_work&limit=100`,
    )).json())
    expect(readyFirst.collections.ready_work.items).toHaveLength(100)
    expect(readyFirst.collections.ready_work.nextCursor).not.toBeNull()
    const readySecond = controlCenterResponseSchema.parse((await humanCall(
      human,
      'GET',
      `/api/v1/projects/${project.id}/control-center?collection=ready_work&limit=100&cursor=${encodeURIComponent(readyFirst.collections.ready_work.nextCursor!)}`,
    )).json())
    expect(readySecond.collections.ready_work.items).toHaveLength(50)
    const readyFirstIds = new Set(readyFirst.collections.ready_work.items.map(item => item.id))
    expect(readySecond.collections.ready_work.items.some(item => readyFirstIds.has(item.id))).toBe(false)

    const rejectedSensitiveActivity = await agentCall(token, 'POST', `/api/v1/agent-sessions/${session.id}/activities`, {
      kind: 'action_completed', summary: 'Sensitive invocation must never persist', artifactIds: [], references: [], visibility: 'team', ephemeral: false,
      toolInvocation: { toolName: 'ci.test', inputSanitized: { authorization: 'Bearer secret-value-12345' }, status: 'started' },
    })
    expect(rejectedSensitiveActivity.statusCode).toBe(400)
    expect(rejectedSensitiveActivity.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM agent_activities WHERE session_id=$1 AND summary='Sensitive invocation must never persist'", [session.id])).rows[0]!.count).toBe(0)

    const decisionActivity = await agentCall(token, 'POST', `/api/v1/agent-sessions/${session.id}/activities`, {
      kind: 'decision_request', summary: 'Human approval is required before recovery', artifactIds: [],
      references: [{ type: 'approval', id: approvalId }, { type: 'plan_step', id: planStepId }], visibility: 'team', ephemeral: false,
    })
    expect(decisionActivity.statusCode, JSON.stringify(decisionActivity.json())).toBe(200)

    const failedValidation = await agentCall(token, 'POST', `/api/v1/agent-sessions/${session.id}/activities`, {
      kind: 'action_completed', summary: 'Focused validation failed', artifactIds: [],
      references: [{ type: 'plan_step', id: planStepId }], visibility: 'team', ephemeral: false,
      toolInvocation: { toolName: 'ci.test', inputSanitized: { suite: 'run-explanation' }, status: 'failed', resultSummary: 'One focused assertion failed.' },
    })
    expect(failedValidation.statusCode, JSON.stringify(failedValidation.json())).toBe(200)
    const recoveredValidation = await agentCall(token, 'POST', `/api/v1/agent-sessions/${session.id}/activities`, {
      kind: 'action_completed', summary: 'Focused validation passed', artifactIds: [runningEvidence.id],
      references: [{ type: 'plan_step', id: planStepId }, { type: 'artifact', id: runningEvidence.id }], visibility: 'team', ephemeral: false,
      toolInvocation: { toolName: 'ci.test', inputSanitized: { suite: 'run-explanation' }, status: 'succeeded', resultSummary: 'All focused assertions passed.' },
    })
    expect(recoveredValidation.statusCode, JSON.stringify(recoveredValidation.json())).toBe(200)

    const explanationResponse = await humanCall(human, 'GET', `/api/v1/agent-sessions/${session.id}/explanation`)
    expect(explanationResponse.statusCode, JSON.stringify(explanationResponse.json())).toBe(200)
    expect(explanationResponse.headers.etag).toMatch(/^"run-explanation-v1-/)
    const explanation = runExplanationResponseSchema.parse(explanationResponse.json())
    expect(explanation.session.id).toBe(session.id)
    expect(explanation.causalGroups).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'action_completed', count: 3, sourceActivityIds: expect.any(Array) }),
      expect.objectContaining({ phase: 'validation', failure: true, count: 1, validation: expect.objectContaining({ state: 'failed' }) }),
      expect.objectContaining({ phase: 'validation', failure: false, count: 1, planStepId, evidence: expect.arrayContaining([expect.objectContaining({ id: runningEvidence.id })]) }),
    ]))
    expect(explanation.planVersions).toEqual(expect.arrayContaining([expect.objectContaining({ id: planVersion.id, steps: expect.arrayContaining([expect.objectContaining({ id: planStepId, causalGroupIds: expect.any(Array) })]) })]))
    expect(explanation.evidenceDetails).toEqual(expect.arrayContaining([expect.objectContaining({ id: runningEvidence.id, validationState: 'verified' })]))
    expect(explanation.verification.state).toBe('failed')
    expect(explanation.pendingAttention.length).toBeGreaterThanOrEqual(3)

    const attentionExplanation = runExplanationResponseSchema.parse((await humanCall(human, 'GET', `/api/v1/agent-sessions/${session.id}/explanation?attention=true&timeWindow=24h`)).json())
    expect(attentionExplanation.causalGroups.length).toBeGreaterThan(0)
    expect(attentionExplanation.causalGroups.every(group => group.attention)).toBe(true)
    expect(attentionExplanation.causalGroups).toEqual(expect.arrayContaining([expect.objectContaining({ actionType: 'decision', planStepId })]))
    expect(attentionExplanation.verification.state).toBe('failed')

    const currentMaxSequence = (await db.query<{ sequence: number }>('SELECT max(sequence)::int AS sequence FROM agent_activities WHERE session_id=$1', [session.id])).rows[0]!.sequence
    await db.query(
      `INSERT INTO agent_activities(session_id,actor_id,sequence,kind,summary,artifact_ids,references_json,visibility,ephemeral)
       SELECT $1,$2,$3+ordinal,'action_completed','Pagination fixture '||ordinal,'{}'::uuid[],'[]'::jsonb,'team',false
         FROM generate_series(1,45) ordinal`,
      [session.id, agentActorId, currentMaxSequence],
    )
    const explanationFirstPage = runExplanationResponseSchema.parse((await humanCall(human, 'GET', `/api/v1/agent-sessions/${session.id}/explanation?limit=20`)).json())
    expect(explanationFirstPage.causalGroups).toHaveLength(20)
    expect(explanationFirstPage.nextCursor).not.toBeNull()
    const explanationSecondPage = runExplanationResponseSchema.parse((await humanCall(human, 'GET', `/api/v1/agent-sessions/${session.id}/explanation?limit=20&cursor=${explanationFirstPage.nextCursor}`)).json())
    expect(explanationSecondPage.causalGroups).toHaveLength(20)
    const firstPageSources = new Set(explanationFirstPage.causalGroups.flatMap(group => group.sourceActivityIds))
    expect(explanationSecondPage.causalGroups.some(group => group.sourceActivityIds.some(id => firstPageSources.has(id)))).toBe(false)

    const executionResponse = await humanCall(human, 'GET', `/api/v1/work-items/${work.id}/execution-summary`)
    expect(executionResponse.statusCode, JSON.stringify(executionResponse.json())).toBe(200)
    const execution = workItemExecutionSummaryResponseSchema.parse(executionResponse.json())
    expect(execution.activeRuns).toEqual(expect.arrayContaining([
      expect.objectContaining({ sessionId: session.id }),
    ]))

    const previewResponse = await humanCall(human, 'POST', `/api/v1/agent-sessions/${session.id}/control-preview`, { action: 'stop' })
    expect(previewResponse.statusCode, JSON.stringify(previewResponse.json())).toBe(200)
    const preview = actionPreviewResponseSchema.parse(previewResponse.json())
    expect(preview).toMatchObject({ action: 'stop', allowed: true, releaseLease: true, advisory: true })
    expect((await agentCall(token, 'POST', `/api/v1/agent-sessions/${session.id}/control-preview`, { action: 'stop' })).statusCode).toBe(200)
    await db.query('UPDATE agent_sessions SET revision=revision+1,updated_at=now() WHERE id=$1', [session.id])
    const staleFinal = await humanCall(human, 'POST', `/api/v1/agent-sessions/${session.id}/signals`, { signal: 'stop', reason: 'stale preview race' }, { 'if-match': `"revision-${preview.sourceRevision}"` })
    expect(staleFinal.statusCode).toBe(409)
    expect(staleFinal.json<{ error: { code: string } }>()).toMatchObject({ error: { code: 'REVISION_CONFLICT' } })

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
      bulk: { eligible: false, prohibitedReason: 'bulk.risk_prohibited' },
    })
    expect(firstPage.items.every(item => item.audience.relationship === 'assigned_to_me')).toBe(true)
    const assigned = humanAttentionListResponseSchema.parse(
      (await humanCall(human, 'GET', `/api/v1/human-attention?view=active&audience=assigned_to_me&projectId=${project.id}&limit=50`)).json(),
    )
    expect(assigned.items.map(item => item.id).sort()).toEqual(firstPage.items.map(item => item.id).sort())
    const immediate = humanAttentionListResponseSchema.parse(
      (await humanCall(human, 'GET', '/api/v1/human-attention?view=active&urgency=immediate&limit=50')).json(),
    )
    expect(immediate.items.every(item => item.urgency === 'immediate')).toBe(true)

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

    const clarification = firstPage.items.find(item => item.kind === 'clarification')!
    const clarificationOption = clarification.options.find(option => option.command === 'replyInboxItem')!
    const humanReply = await humanCall(human, 'POST', clarificationOption.path, {
      body: 'Use the current release branch and preserve the published evidence.',
      payload: { attentionId: clarification.id },
    }, { 'if-match': `"revision-${clarificationOption.targetRevision}"` })
    expect(humanReply.statusCode, JSON.stringify(humanReply.json())).toBe(200)
    expect(humanReply.json<{ status: string; replyMessageId: string }>()).toMatchObject({
      status: 'resolved',
      replyMessageId: expect.any(String),
    })
    const afterReply = humanAttentionListResponseSchema.parse(
      (await humanCall(human, 'GET', '/api/v1/human-attention?kind=clarification&view=active&limit=50')).json(),
    )
    expect(afterReply.items.some(item => item.id === clarification.id)).toBe(false)

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

    const hiddenControlCenter = await agentCall(token, 'GET', `/api/v1/projects/${otherProject.id}/control-center`)
    expect(hiddenControlCenter.statusCode).toBe(404)

    const crossTeamId = randomUUID()
    const crossTeamProjectId = randomUUID()
    await db.query("INSERT INTO teams(id,workspace_id,name,key) VALUES($1,$2,'Hidden Team',$3)", [crossTeamId, actor.workspace_id, `hidden-${randomUUID().slice(0, 8)}`])
    await db.query("INSERT INTO projects(id,workspace_id,team_id,name,status) VALUES($1,$2,$3,'Cross Team Project','active')", [crossTeamProjectId, actor.workspace_id, crossTeamId])
    expect((await agentCall(token, 'GET', `/api/v1/projects/${crossTeamProjectId}/control-center`)).statusCode).toBe(404)

    const crossWorkspaceId = randomUUID()
    const crossWorkspaceTeamId = randomUUID()
    const crossWorkspaceProjectId = randomUUID()
    await db.query("INSERT INTO workspaces(id,name,slug) VALUES($1,'Hidden Workspace',$2)", [crossWorkspaceId, `hidden-${randomUUID().slice(0, 8)}`])
    await db.query("INSERT INTO teams(id,workspace_id,name,key) VALUES($1,$2,'Hidden Workspace Team',$3)", [crossWorkspaceTeamId, crossWorkspaceId, `hidden-${randomUUID().slice(0, 8)}`])
    await db.query("INSERT INTO projects(id,workspace_id,team_id,name,status) VALUES($1,$2,$3,'Cross Workspace Project','active')", [crossWorkspaceProjectId, crossWorkspaceId, crossWorkspaceTeamId])
    expect((await agentCall(token, 'GET', `/api/v1/projects/${crossWorkspaceProjectId}/control-center`)).statusCode).toBe(404)

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

    const delegationId = (await db.query<{ delegation_id: string }>('SELECT delegation_id FROM agent_sessions WHERE id=$1', [session.id])).rows[0]!.delegation_id
    await db.query("UPDATE delegations SET status='revoked',revoked_at=now() WHERE id=$1", [delegationId])
    expect([401,403,404,409]).toContain((await agentCall(token, 'GET', `/api/v1/agent-sessions/${session.id}/explanation`)).statusCode)
    await db.query("UPDATE delegations SET status='active',revoked_at=NULL WHERE id=$1", [delegationId])

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
    expect([401,403,404,409]).toContain((await agentCall(token, 'GET', `/api/v1/agent-sessions/${session.id}/explanation`)).statusCode)
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
