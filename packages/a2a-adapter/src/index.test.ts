import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import {
  A2AAdapter,
  A2A_TASK_ID_MAX_LENGTH,
  A2AValidationError,
  FakeA2AAgent,
  mapAgentCard,
  mapStreamEvent,
  parseA2ATask,
} from './index.js'

describe('A2A v0.3 conformance boundary', () => {
  it('completes a standard task only after live authorization', async () => {
    const fake = new FakeA2AAgent()
    expect(mapAgentCard(fake.card)).toMatchObject({
      supportedProtocols: ['a2a'],
      manifest: { adapter: 'a2a', protocolVersion: '0.3' },
    })
    const order: string[] = []
    const authorize = vi.fn(async () => { order.push('authorize') })
    const createSession = vi.fn(async () => { order.push('create'); return { sessionId: 'session-1' } })
    const adapter = new A2AAdapter(authorize, createSession)
    const result = await adapter.acceptTask(fake.complete('task-1'), {
      workspaceId: 'workspace-1',
      bindingId: 'binding-1',
      agentId: 'agent-1',
      requestedCapabilities: ['work:read'],
      resource: { workItemId: 'work-1' },
    })
    expect(order).toEqual(['authorize', 'create'])
    expect(result).toMatchObject({
      sessionId: 'session-1',
      command: {
        externalTaskId: 'task-1',
        state: 'completed',
        artifacts: [{ title: 'triage-report' }],
      },
    })
    expect(mapStreamEvent('task-1', {
      type: 'session.state_changed',
      sessionId: 'session-1',
      state: 'completed',
      occurredAt: '2026-07-26T00:00:00Z',
    })).toMatchObject({ kind: 'status-update', final: true, status: { state: 'completed' } })
  })

  it('does not disclose or create context after authorization revocation', async () => {
    const createSession = vi.fn()
    const adapter = new A2AAdapter(
      async () => { throw new Error('A2A_AUTHORIZATION_REVOKED') },
      createSession,
    )
    await expect(adapter.acceptTask(new FakeA2AAgent().complete('task-denied'), {
      workspaceId: 'workspace-1',
      bindingId: 'binding-1',
      agentId: 'agent-1',
      requestedCapabilities: ['work:read'],
      resource: { workItemId: 'work-1' },
    })).rejects.toThrow('A2A_AUTHORIZATION_REVOKED')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('rejects unknown states and unsafe or untyped parts with stable errors', () => {
    const task = new FakeA2AAgent().complete('task-invalid')
    const code = (run: () => unknown): string => {
      try {
        run()
      } catch (error) {
        expect(error).toBeInstanceOf(A2AValidationError)
        return (error as A2AValidationError).code
      }
      throw new Error('Expected A2A validation to fail')
    }
    expect(code(() => parseA2ATask({ ...task, status: { state: 'unknown-future-state' } })))
      .toBe('A2A_TASK_STATE_INVALID')
    expect(code(() => parseA2ATask({
      ...task,
      status: {
        ...task.status,
        message: { id: 'invalid-part-message', role: 'agent', parts: [{ text: 'missing kind' }] },
      },
    }))).toBe('A2A_PART_INVALID')
    expect(code(() => parseA2ATask({
      ...task,
      artifacts: [{ id: 'bad-file', name: 'bad-file', parts: [{ kind: 'file', file: { uri: 'file:///etc/passwd' } }] }],
    }))).toBe('A2A_FILE_PART_INVALID')
  })

  it('keeps the runtime and OpenAPI task-id limit at 500 characters', async () => {
    const maximumId = 't'.repeat(A2A_TASK_ID_MAX_LENGTH)
    expect(parseA2ATask({ id: maximumId, status: { state: 'submitted' } }).id).toBe(maximumId)
    expect(() => parseA2ATask({
      id: `${maximumId}x`,
      status: { state: 'submitted' },
    })).toThrowError(A2AValidationError)

    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const route = openapi.match(
      /  \/api\/v1\/a2a-bindings\/\{id\}\/tasks\/\{taskId\}\/events:\r?\n([\s\S]*?)(?=\r?\n  \/api\/|\r?\ncomponents:)/,
    )?.[1]
    expect(route).toContain(`name: taskId`)
    expect(route).toContain(`maxLength: ${A2A_TASK_ID_MAX_LENGTH}`)
  })
})
