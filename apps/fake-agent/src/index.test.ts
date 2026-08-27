import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { canonicalJsonSha256, FakeAgent } from './index.js'
import { WorkMeshSdkError } from '@workmesh/agent-sdk'

describe('FakeAgent', () => {
  it('deduplicates valid webhook deliveries before starting work', () => {
    const agent = new FakeAgent({ apiUrl: 'http://example.test', installationToken: 'installation', webhookSecrets: ['secret'], stale: true })
    const body = Buffer.from('{"events":[]}'), timestamp = Math.floor(Date.now() / 1_000)
    const signature = createHmac('sha256', 'secret').update(`${timestamp}.${body.toString()}`).digest('hex')
    const headers = { 'workmesh-delivery-id': 'delivery-1', 'workmesh-timestamp': String(timestamp), 'workmesh-signature': `v1=${signature}` }
    expect(agent.accept(body, headers)).toBe(true)
    expect(agent.accept(body, headers)).toBe(false)
  })

  it('exchanges once, ACKs with the in-memory session token, then acknowledges stop', async () => {
    const calls: string[] = []
    const client = {
      exchangeSessionToken: async () => { calls.push('exchange') },
      acknowledge: async () => { calls.push('ack') },
      getSessionContext: async () => { calls.push('context') },
      getSession: async () => ({ revision: 3 }),
      transitionState: async () => { calls.push('executing') },
      publishArtifact: async () => ({ id: '00000000-0000-4000-8000-000000000002' }),
      stopAcknowledgement: async () => { calls.push('stop-ack') },
      appendActivity: async (_sessionId: string, input: { summary: string }) => { calls.push('activity'); if (input.summary.includes('post-stop')) throw new WorkMeshSdkError('stopped', { code: 'SESSION_STOPPED', status: 409 }) },
    } as unknown as import('@workmesh/agent-sdk').WorkMeshClient
    const agent = new FakeAgent({ apiUrl: 'http://example.test', installationToken: 'installation', webhookSecrets: ['secret'], publishPlan: false, appendActivity: false, complete: false, writeAfterStop: true }, () => client)
    const timestamp = Math.floor(Date.now() / 1_000)
    const deliver = (deliveryId: string, event: unknown) => {
      const body = Buffer.from(JSON.stringify({ events: [event] }))
      const signature = createHmac('sha256', 'secret').update(`${timestamp}.${body.toString()}`).digest('hex')
      return agent.accept(body, { 'workmesh-delivery-id': deliveryId, 'workmesh-timestamp': String(timestamp), 'workmesh-signature': `v1=${signature}` })
    }
    const sessionId = '00000000-0000-4000-8000-000000000001'
    expect(deliver('created', { type: 'agent.session.created', sessionId, payload: { exchangeToken: 'x'.repeat(32) } })).toBe(true)
    await agent.whenIdle()
    expect(calls).toEqual(['exchange', 'ack', 'context', 'executing'])
    expect(deliver('stopped', { type: 'agent.session.signal.stop', sessionId })).toBe(true)
    await agent.whenIdle()
    expect(calls).toEqual(['exchange', 'ack', 'context', 'executing', 'stop-ack', 'activity'])
  })

  it('waits for prompt and approval before completing, with the server-compatible approval hash', async () => {
    const calls: string[] = []
    const requestApproval = async (input: { actionPayloadSanitized: unknown; actionPayloadHash: string }) => {
      calls.push('approval')
      expect(input.actionPayloadHash).toBe(canonicalJsonSha256(input.actionPayloadSanitized))
    }
    const client = {
      exchangeSessionToken: async () => { calls.push('exchange') },
      acknowledge: async () => { calls.push('ack') },
      getSessionContext: async () => { calls.push('context') },
      getSession: async () => ({ revision: 3 }),
      transitionState: async () => { calls.push('executing') },
      askQuestion: async () => { calls.push('question') },
      sendMessage: async () => { calls.push('message') },
      requestApproval,
      publishArtifact: async () => { calls.push('artifact'); return { id: '00000000-0000-4000-8000-000000000002' } },
    } as unknown as import('@workmesh/agent-sdk').WorkMeshClient
    const agent = new FakeAgent({ apiUrl: 'http://example.test', installationToken: 'installation', webhookSecrets: ['secret'], publishPlan: false, appendActivity: false, complete: false, askQuestion: true, requestApproval: true }, () => client)
    const timestamp = Math.floor(Date.now() / 1_000)
    const deliver = (deliveryId: string, event: unknown) => {
      const body = Buffer.from(JSON.stringify({ events: [event] }))
      const signature = createHmac('sha256', 'secret').update(`${timestamp}.${body.toString()}`).digest('hex')
      agent.accept(body, { 'workmesh-delivery-id': deliveryId, 'workmesh-timestamp': String(timestamp), 'workmesh-signature': `v1=${signature}` })
    }
    const sessionId = '00000000-0000-4000-8000-000000000001'
    deliver('created-awaiting-input', { type: 'agent.session.created', sessionId, payload: { exchangeToken: 'x'.repeat(32) } })
    await agent.whenIdle()
    expect(calls).toEqual(['exchange', 'ack', 'context', 'executing', 'question'])
    deliver('prompt-resume', { type: 'agent.session.prompted', sessionId })
    await agent.whenIdle()
    expect(calls).toEqual(['exchange', 'ack', 'context', 'executing', 'question', 'message', 'approval'])
    deliver('approval-continue', { type: 'approval.approved', sessionId })
    await agent.whenIdle()
    expect(calls).toEqual(['exchange', 'ack', 'context', 'executing', 'question', 'message', 'approval', 'artifact'])
  })

  it('retains the immutable decision reason when terminal approval delivery arrives first', async () => {
    const calls: string[] = []
    const client = {
      exchangeSessionToken: async () => { calls.push('exchange') },
      acknowledge: async () => { calls.push('ack') },
      getSessionContext: async () => { calls.push('context') },
      getSession: async () => ({ revision: 3 }),
      transitionState: async () => { calls.push('executing') },
      requestApproval: async () => { calls.push('approval') },
      appendActivity: async (_sessionId: string, input: { summary: string; detailsMarkdown?: string }) => { calls.push(input.detailsMarkdown?.startsWith('Decision reason:') ? 'decision-activity' : 'activity') },
      publishArtifact: async () => { calls.push('artifact'); return { id: '00000000-0000-4000-8000-000000000002' } },
    } as unknown as import('@workmesh/agent-sdk').WorkMeshClient
    const agent = new FakeAgent({ apiUrl: 'http://example.test', installationToken: 'installation', webhookSecrets: ['secret'], publishPlan: false, complete: false, requestApproval: true }, () => client)
    const timestamp = Math.floor(Date.now() / 1_000)
    const deliver = (deliveryId: string, event: unknown) => {
      const body = Buffer.from(JSON.stringify({ events: [event] }))
      const signature = createHmac('sha256', 'secret').update(`${timestamp}.${body.toString()}`).digest('hex')
      return agent.accept(body, { 'workmesh-delivery-id': deliveryId, 'workmesh-timestamp': String(timestamp), 'workmesh-signature': `v1=${signature}` })
    }
    const sessionId = '00000000-0000-4000-8000-000000000001'
    const approvalId = '00000000-0000-4000-8000-000000000003'
    expect(deliver('created-with-approval', { type: 'agent.session.created', sessionId, payload: { exchangeToken: 'x'.repeat(32) } })).toBe(true)
    await agent.whenIdle()
    expect(deliver('terminal-first', { type: 'approval.approved', sessionId, payload: { sessionId, approvalId } })).toBe(true)
    await agent.whenIdle()
    expect(agent.resultSummaries).toEqual([])
    expect(deliver('decision-recorded', { type: 'approval.decision.recorded', sessionId, payload: { sessionId, approvalId, decision: { decision: 'approved', reason: 'Keep the rollback evidence attached.' } } })).toBe(true)
    await agent.whenIdle()
    expect(agent.approvalDecisions).toEqual([{ sessionId, approvalId, decision: 'approved', reason: 'Keep the rollback evidence attached.', immutable: true }])
    expect(agent.resultSummaries[0]).toContain('Keep the rollback evidence attached.')
    expect(calls).toContain('decision-activity')
    expect(calls).toContain('artifact')
    expect(agent.errors).toEqual([])
  })
})
