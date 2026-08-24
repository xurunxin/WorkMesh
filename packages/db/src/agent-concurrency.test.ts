import { describe, expect, it, vi } from 'vitest'
import { DomainError, agentExecutionCapacityStates } from '@workmesh/domain'
import {
  agentExecutionCapacitySqlPredicate,
  assertAgentExecutionCapacityAfterLock,
} from './agent-concurrency.js'

describe('Agent execution capacity', () => {
  it('uses the shared execution-only non-terminal predicate', () => {
    const predicate = agentExecutionCapacitySqlPredicate('session')
    expect(predicate).toContain("session.session_kind='execution'")
    for (const state of agentExecutionCapacityStates)
      expect(predicate).toContain(`'${state}'`)
    for (const state of ['completed', 'failed', 'canceled'])
      expect(predicate).not.toContain(`'${state}'`)
    expect(() => agentExecutionCapacitySqlPredicate('session;DELETE')).toThrow()
  })

  it('admits below capacity and reports a safe snapshot', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ max_concurrency: 3 }] })
      .mockResolvedValueOnce({ rows: [
        { state: 'planning', count: 1 },
        { state: 'paused', count: 1 },
      ] })
    await expect(assertAgentExecutionCapacityAfterLock(
      { query } as never,
      { workspaceId: 'workspace-id', agentId: 'agent-id' },
    )).resolves.toEqual({
      maxConcurrency: 3,
      activeExecutionSessionCount: 2,
      activeExecutionSessionsByState: { planning: 1, paused: 1 },
    })
    expect(query.mock.calls[1]?.[0]).toContain("session.session_kind='execution'")
    expect(query.mock.calls[1]?.[0]).toContain('GROUP BY session.state')
  })

  it('rejects at capacity with actionable, credential-safe details', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ max_concurrency: 1 }] })
      .mockResolvedValueOnce({ rows: [{ state: 'executing', count: 1 }] })
    try {
      await assertAgentExecutionCapacityAfterLock(
        { query } as never,
        { workspaceId: 'workspace-id', agentId: 'agent-id' },
      )
      throw new Error('Expected capacity rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect(error).toMatchObject({
        code: 'AGENT_CONCURRENCY_LIMIT',
        details: {
          maxConcurrency: 1,
          activeExecutionSessionCount: 1,
          countedSessionKinds: ['execution'],
          countedSessionStates: [...agentExecutionCapacityStates],
          activeExecutionSessionsByState: { executing: 1 },
        },
      })
      expect((error as Error).message).toContain('Coordination Sessions do not consume capacity')
    }
  })
})
