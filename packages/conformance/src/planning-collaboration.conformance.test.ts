import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { childAgentSessionResponseSchema, reviewDelegationResponseSchema, type ChildAgentSession, type ReviewDelegationResponse } from '@workmesh/contracts'
import { createPlanningCollaborationFixture, savePlanningEvidence, type ModelCall } from './planning-collaboration.fixture.js'

type Fixture = Awaited<ReturnType<typeof createPlanningCollaborationFixture>>
let f: Fixture
const call = async <T>(client: Client, name: string, arguments_: Record<string, unknown>): Promise<T> => {
  const result = await client.callTool({ name, arguments: arguments_ })
  expect(result.isError, JSON.stringify(result.structuredContent)).not.toBe(true)
  return (result.structuredContent as { data: T }).data
}
const boundFields = ['parent_session_id','plan_step_version_id','required_for_parent','inherited_budget','max_child_sessions']
describe('M2 真实HTTP、MCP与Pi规划协作闭环', () => {
  beforeAll(async () => { f = await createPlanningCollaborationFixture() })
  afterAll(async () => { if (f) await f.close() })

  it('有限预算100→child60→reviewer40：受控交付、双证据、父终态拒读与完整响应字段', async () => {
    const parent = await f.createExecution('M2 finite lifecycle', false, { maxInputTokens: 100 })
    const target = await f.registerTarget()
    const step = randomUUID(), reviewStep = randomUUID()
    const current = await parent.client.getSession<{ revision: number }>(parent.sessionId)
    await parent.client.publishPlan(parent.sessionId, { changeSummary: 'M2 bounded chain', steps: [
      { id: step, title: 'Implement', ordinal: 0, status: 'pending', dependsOn: [], acceptanceCriteria: [], expectedArtifacts: [] },
      { id: reviewStep, title: 'Review', ordinal: 1, status: 'pending', dependsOn: [], acceptanceCriteria: [], expectedArtifacts: [] },
    ] }, { ifMatch: current.revision })
    const plan = await parent.client.getPlan<{ id: string }>(parent.sessionId)
    const mcp = await f.connect('read-write', parent)
    const created = await call<ChildAgentSession>(mcp, 'create_child_session', { parentSessionId: parent.sessionId, agentId: target.agentId, planStepId: step, planVersionId: plan.id, initialPrompt: 'Implement with bounded budget', budget: { maxInputTokens: 60 } })
    expect(childAgentSessionResponseSchema.parse(created)).toMatchObject({ parent_session_id: parent.sessionId, plan_step_version_id: plan.id, budget: { maxInputTokens: 60 }, inherited_budget: { maxInputTokens: 60 } })
    for (const field of boundFields) expect(created).toHaveProperty(field)
    const child = await f.receive(created.id, target.token)
    const complete = async (sessionId: string, artifactId?: string): Promise<ModelCall> => {
      const revision = (await f.db.query<{ revision: number }>('SELECT revision FROM agent_sessions WHERE id=$1', [sessionId])).rows[0]!.revision
      return { name: 'workmesh_complete_session', arguments: { ifMatch: revision, summary: 'M2 verified completion', ...(artifactId ? { artifactIds: [artifactId] } : { noArtifactReason: 'Deterministic bounded lifecycle test.' }) } }
    }
    const childPi = await f.pi(child, target.token, [() => complete(child.sessionId)])
    expect(childPi[0]!.tools).not.toContain('workmesh_publish_plan')
    const projection = await call<{ items: Array<{ id: string; state: string }> }>(mcp, 'list_child_sessions', { parentSessionId: parent.sessionId })
    expect(projection.items).toContainEqual(expect.objectContaining({ id: child.sessionId, state: 'completed' }))
    const input = { reviewerAgentId: target.agentId, planStepId: reviewStep, planVersionId: plan.id, initialPrompt: 'Review independently', ttlSeconds: 300 }
    for (const budget of [undefined, {}, { maxInputTokens: 41 }] as Array<Record<string, number> | undefined>) {
      await expect(parent.client.createReviewDelegation(parent.sessionId, { ...input, ...(budget ? { budget } : {}) })).rejects.toMatchObject({ code: 'CHILD_BUDGET_EXCEEDED' })
    }
    const review = await call<ReviewDelegationResponse>(mcp, 'create_review_delegation', { sessionId: parent.sessionId, ...input, budget: { maxInputTokens: 40 } })
    expect(reviewDelegationResponseSchema.parse(review).session.budget).toEqual({ maxInputTokens: 40 })
    for (const field of boundFields) expect(review.session).toHaveProperty(field)
    const reviewer = await f.receive(review.session.id, target.token)
    const room = (await f.db.query<{ id: string }>("SELECT id FROM work_room_channels WHERE subject_kind='session' AND subject_id=$1", [parent.sessionId])).rows[0]!.id
    const artifactId = async () => (await f.db.query<{ id: string }>("SELECT id FROM artifacts WHERE session_id=$1 AND type='code_review'", [reviewer.sessionId])).rows[0]!.id
    const beforeReview = await reviewer.client.getSession<{ revision: number }>(reviewer.sessionId)
    await expect(reviewer.client.complete(reviewer.sessionId, { summary: 'Cannot waive review evidence', noArtifactReason: 'No artifact waiver' }, { ifMatch: beforeReview.revision })).rejects.toMatchObject({ code: 'REVIEW_COMPLETION_EVIDENCE_REQUIRED' })
    const captures = await f.pi(reviewer, target.token, [
      async () => ({ name: 'workmesh_get_session', arguments: {} }),
      async () => ({ name: 'workmesh_publish_artifact', arguments: { type: 'code_review', title: 'M2 independent review', metadata: { verdict: 'approved', summary: 'Reviewed bounded lifecycle' } } }),
      async () => ({ name: 'workmesh_send_room_message', arguments: { roomId: room, intent: 'review_result', body: 'M2 independent review approved.' } }),
      async () => complete(reviewer.sessionId, await artifactId()),
    ])
    expect(captures[0]!.tools).not.toContain('workmesh_publish_plan')
    expect(JSON.stringify(captures)).toContain('code_review')
    expect(captures.some(capture => capture.results.some(result => result.includes('maxInputTokens') && result.includes('40')))).toBe(true)
    const usage = (await f.db.query<{ usage: { inputTokens: number; outputTokens: number; totalTokens: number } }>('SELECT usage FROM workbench_runner_attempts WHERE agent_session_id=$1', [reviewer.sessionId])).rows[0]!.usage
    expect(usage.inputTokens).toBeGreaterThan(0); expect(usage.inputTokens).toBeLessThanOrEqual(40)
    expect(usage.totalTokens).toBe(usage.inputTokens+usage.outputTokens)
    const budgets = (await f.db.query<{ budget: unknown; inherited_budget: unknown; reserved: unknown }>(`SELECT child.budget,child.inherited_budget,reservation.reserved FROM agent_sessions child JOIN session_budget_reservations reservation ON reservation.child_session_id=child.id WHERE child.parent_session_id=$1 ORDER BY child.created_at`, [parent.sessionId])).rows
    expect(budgets).toEqual([60,40].map(value => ({ budget: { maxInputTokens: value }, inherited_budget: { maxInputTokens: value }, reserved: { maxInputTokens: value } })))
    const parentPi = await f.pi(parent, f.connectionToken, [async () => ({ name: 'workmesh_list_child_sessions', arguments: { limit: 1 } }), () => complete(parent.sessionId)])
    expect(JSON.stringify(parentPi)).toContain('completed')
    await expect(parent.client.listChildSessions(parent.sessionId)).rejects.toBeDefined()
    savePlanningEvidence('finite-budget-chain.json', { parentId: parent.sessionId, childId: child.sessionId, reviewerId: reviewer.sessionId, budgets, projection, captures, parentPi })
  })

  it('投影签名分页绑定父/过滤且每页重验授权，GET零业务写、零token/prompt', async () => {
    const parent = await f.createExecution('M2 projection')
    const target = await f.registerTarget()
    const step = randomUUID()
    const revision = (await parent.client.getSession<{ revision: number }>(parent.sessionId)).revision
    await parent.client.publishPlan(parent.sessionId, { changeSummary: 'M2 pagination', steps: [{ id: step, title: 'Read children', ordinal: 0, status: 'pending', dependsOn: [], acceptanceCriteria: [], expectedArtifacts: [] }] }, { ifMatch: revision })
    const plan = await parent.client.getPlan<{ id: string }>(parent.sessionId)
    // Privileged test capacity only; no client limit DTO exists.
    await f.db.query('UPDATE agent_definitions SET max_concurrency=8 WHERE id=$1', [target.agentId])
    const ids: string[] = []
    for (let i=0;i<3;i++) ids.push((await parent.client.createChildSession(parent.sessionId, { agentId: target.agentId, planStepId: step, planVersionId: plan.id, initialPrompt: 'Secret prompt must never appear in projection' })).id)
    const facts = async () => (await f.db.query(`SELECT (SELECT count(*) FROM domain_events)::text AS events,(SELECT count(*) FROM outbox_events)::text AS outbox,(SELECT count(*) FROM agent_activities)::text AS activities,(SELECT count(*) FROM inbox_items)::text AS inbox`)).rows[0]
    const before = await facts()
    const first = await parent.client.listChildSessions(parent.sessionId, {}, { limit: 1 })
    expect(first.items).toHaveLength(1); expect(first.nextCursor).toBeTruthy()
    const second = await parent.client.listChildSessions(parent.sessionId, {}, { limit: 2, cursor: first.nextCursor! })
    expect(new Set([...first.items,...second.items].map(item=>item.id))).toEqual(new Set(ids))
    expect(JSON.stringify([first,second])).not.toMatch(/token|prompt|Secret/)
    expect(await facts()).toEqual(before)
    await expect(parent.client.listChildSessions(parent.sessionId, { childSessionId: ids[0] }, { cursor: first.nextCursor! })).rejects.toBeDefined()
    await expect(parent.client.listChildSessions(parent.sessionId, { childSessionId: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await f.db.query('UPDATE agent_team_access SET revoked_at=clock_timestamp() WHERE agent_id=$1 AND team_id=$2', [f.agentId,f.teamId])
    await expect(parent.client.listChildSessions(parent.sessionId, {}, { cursor: first.nextCursor! })).rejects.toBeDefined()
    expect(await facts()).toEqual(before)
    savePlanningEvidence('projection-pages-denial.json', { first,second,before,after:await facts() })
  })
})
