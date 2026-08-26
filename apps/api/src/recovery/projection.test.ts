import { describe, expect, it } from 'vitest'
import { projectRecoveryRow, type RecoveryRow } from './projection.js'

const uuid = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
const base = (condition: RecoveryRow['condition']): RecoveryRow => ({
  condition, lifecycle: 'active', happened_at: '2026-08-27T01:00:00.000Z',
  source_type: condition === 'lease_lost' ? 'lease' : 'agent_session', source_id: uuid(1), source_status: condition === 'session_failed' ? 'failed' : 'stale', source_revision: 4, event_cursor: '91',
  workspace_id: uuid(2), team_id: uuid(3), project_id: uuid(4), project_name: 'Runtime Reliability', work_item_id: uuid(5), work_item_title: 'Recover execution', session_id: uuid(6), plan_step_id: uuid(7),
  session_state: condition === 'session_failed' ? 'failed' : 'stale', session_revision: 4, session_updated_at: '2026-08-27T01:00:00.000Z', state_reason: 'Heartbeat elapsed', error_code: null, error_summary: null, heartbeat_health: 'stale', acknowledged_at: '2026-08-27T00:55:00.000Z', last_heartbeat_at: '2026-08-27T00:56:00.000Z',
  delegation_id: uuid(8), delegation_status: 'active', responsible_human_id: uuid(9), responsible_human_name: 'Owner', agent_actor_id: uuid(10), agent_name: 'Runtime Agent', connection_status: 'active', active_executor: false, latest_session_id: uuid(6), latest_session_state: condition === 'session_failed' ? 'failed' : 'stale',
  lease_id: condition === 'lease_lost' ? uuid(1) : null, lease_status: condition === 'lease_lost' ? 'expired' : null, lease_version: condition === 'lease_lost' ? 2 : null, lease_expires_at: condition === 'lease_lost' ? '2026-08-27T00:59:00.000Z' : null, replacement_lease_id: null,
  approval_id: null, approval_status: null, approval_revision: null, approval_expires_at: null, replacement_approval_id: null,
  retry_session_id: null, retry_session_revision: null, retry_count: 2, context_snapshot_id: uuid(11), artifacts: [{ id: uuid(12), type: 'commit', title: 'Commit abc123', status: 'produced' }], message_count: '3', failed_validation_count: '0', budget: { maxRetries: 3 },
})

describe('Recovery deterministic projection', () => {
  it('distinguishes a terminal-only assignment and preserves durable work', () => {
    const item = projectRecoveryRow(base('session_failed'), new Date('2026-08-27T01:01:00.000Z'))
    expect(item.executor.state).toBe('terminal_only_assignment')
    expect(item.executor.active).toBe(false)
    expect(item.preservedWork.artifacts).toMatchObject([{ type: 'commit', title: 'Commit abc123' }])
    expect(item.preservedWork.uncommitted).toBe('unknown')
    expect(item.actions.find(action => action.kind === 'retry')).toMatchObject({ requiresCurrent: true, consequencePreviewPath: `/api/v1/agent-sessions/${uuid(6)}/control-preview` })
    expect(item.attempts).toEqual({ used: 2, limit: 3, remaining: 1, circuitBreaker: 'closed' })
  })

  it('marks Lease loss stale and removes mutation descriptors after replacement', () => {
    const item = projectRecoveryRow({ ...base('lease_lost'), lifecycle: 'resolved', replacement_lease_id: uuid(13) }, new Date('2026-08-27T01:01:00.000Z'))
    expect(item.freshness.state).toBe('stale')
    expect(item.lease.status).toBe('expired')
    expect(item.resolvedBy).toMatchObject({ type: 'lease', id: uuid(13) })
    expect(item.actions.every(action => action.method === 'GET')).toBe(true)
  })

  it('marks missing event provenance partial rather than current', () => {
    const item = projectRecoveryRow({ ...base('session_failed'), event_cursor: null }, new Date('2026-08-27T01:01:00.000Z'))
    expect(item.freshness.state).toBe('partial')
  })
})
