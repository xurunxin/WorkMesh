import { describe, expect, it } from 'vitest'
import {
  projectHumanAttentionRow,
  type HumanAttentionRow,
} from './projection.js'

const uuid = (suffix: number) =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`

const row = (
  sourceType: HumanAttentionRow['source_type'],
  kind: HumanAttentionRow['kind'],
  status: HumanAttentionRow['status'] = 'open',
): HumanAttentionRow => ({
  source_type: sourceType,
  source_id: uuid(1),
  source_status: status === 'open' ? 'pending' : status,
  source_revision: 3,
  kind,
  status,
  workspace_id: uuid(2),
  team_id: uuid(3),
  project_id: uuid(4),
  work_item_id: uuid(5),
  session_id: uuid(6),
  target_revision: 4,
  title: 'Attention title',
  summary: 'Authorized concise source summary',
  impact_summary: 'Authoritative work is waiting for a Human response.',
  risk_level: kind === 'recovery' || kind === 'conflict' ? 'high' : 'medium',
  expires_at: null,
  requested_by_actor_id: uuid(7),
  requested_by_kind: 'agent',
  requested_by_name: 'Agent',
  responsible_human_actor_id: uuid(8),
  responsible_human_name: 'Human',
  payload: {
    evidenceArtifactIds: [uuid(9), uuid(9)],
    affectedResources: [{ type: 'work_item', id: uuid(5) }],
  },
  correlation_id: 'correlation-1',
  created_at: '2026-08-26T00:00:00.000Z',
  updated_at: '2026-08-26T00:01:00.000Z',
  recipient_actor_id: uuid(8),
})

describe('Human Attention deterministic projection', () => {
  it('maps every source family to stable, deduplicated typed output', () => {
    const fixtures = [
      row('decision', 'decision'),
      row('approval', 'approval'),
      row('inbox_item', 'clarification'),
      row('inbox_item', 'conflict'),
      row('inbox_item', 'recovery'),
      row('completion_suggestion', 'completion_review'),
    ]
    const projected = fixtures.map(item => projectHumanAttentionRow(
      item,
      new Date('2026-08-26T00:02:00.000Z'),
    ))
    expect(projected.map(item => item.kind)).toEqual([
      'decision',
      'approval',
      'clarification',
      'conflict',
      'recovery',
      'completion_review',
    ])
    expect(projected[0]?.id).toBe(`v1:decision:${uuid(1)}`)
    expect(projected[0]?.affectedResources).toHaveLength(3)
    expect(projected[0]?.evidence).toHaveLength(1)
  })

  it('maps lifecycle terminals without exposing an action descriptor', () => {
    for (const status of ['decided', 'verified', 'expired', 'superseded'] as const) {
      const item = projectHumanAttentionRow(row('approval', 'approval', status))
      expect(item.status).toBe(status)
      expect(item.options).toEqual([])
      expect(item.recommendedOptionId).toBeNull()
    }
  })

  it('marks legacy rows without an event correlation as partial, not current', () => {
    const item = projectHumanAttentionRow({
      ...row('inbox_item', 'clarification'),
      correlation_id: null,
    })
    expect(item.freshness.state).toBe('partial')
    expect(item.correlationId).toBe(`source:inbox_item:${uuid(1)}`)
  })

  it('marks a stale Session fallback as stale with an explicit recovery reason', () => {
    const item = projectHumanAttentionRow({
      ...row('agent_session', 'recovery'),
      source_status: 'stale',
    })
    expect(item.id).toBe(`v1:agent_session:${uuid(1)}`)
    expect(item.freshness.state).toBe('stale')
    expect(item.reasonCodes).toEqual(['recovery.session_stale'])
    expect(item.options).toMatchObject([{ command: 'retryAgentSession' }])
  })

  it('retains the exact typed source behind an Inbox projection', () => {
    const item = projectHumanAttentionRow({
      ...row('inbox_item', 'clarification'),
      payload: {
        inboxSourceType: 'room_message',
        inboxSourceId: uuid(10),
      },
    })
    expect(item.evidence).toEqual([{ type: 'room_message', id: uuid(10) }])
  })

  it('declares viewer responsibility and only exact low-risk approval payloads as bulk compatible', () => {
    const item = projectHumanAttentionRow({
      ...row('approval', 'approval'),
      risk_level: 'low',
      payload: { actionPayloadHash: `sha256:${'a'.repeat(64)}` },
    }, new Date('2026-08-26T00:02:00.000Z'), {
      id: uuid(8),
      kind: 'human',
      workspaceRole: 'member',
    })
    expect(item.audience).toEqual({ relationship: 'assigned_to_me', canRespond: true })
    expect(item.bulk).toEqual({
      eligible: true,
      compatibilityKey: `approval:sha256:${'a'.repeat(64)}`,
      prohibitedReason: null,
      revalidateIndividually: true,
    })
  })

  it('uses Approval actionability to remove dead decisions and expose recovery', () => {
    const item = projectHumanAttentionRow({
      ...row('approval', 'approval'),
      payload: { actionPayloadHash: `sha256:${'a'.repeat(64)}` },
    }, new Date('2026-08-26T00:02:00.000Z'), {
      id: uuid(8),
      kind: 'human',
      workspaceRole: 'member',
    }, {
      status: 'blocked',
      reason: 'session_inactive',
    })

    expect(item.status).toBe('failed')
    expect(item.options).toEqual([])
    expect(item.audience.canRespond).toBe(false)
    expect(item.reasonCodes).toEqual(['approval.session_inactive'])
    expect(item.freshness.state).toBe('stale')
    expect(item.bulk.eligible).toBe(false)
    expect(item.bulk.prohibitedReason).toBe('bulk.approval_not_actionable')
    expect(item.response.requiresReason).toBe(false)
  })

  it('keeps a quorum-pending viewer decision visible without another response action', () => {
    const item = projectHumanAttentionRow(
      row('approval', 'approval'),
      new Date('2026-08-26T00:02:00.000Z'),
      { id: uuid(8), kind: 'human', workspaceRole: 'member' },
      { status: 'blocked', reason: 'viewer_already_decided' },
    )

    expect(item.status).toBe('seen')
    expect(item.options).toEqual([])
    expect(item.reasonCodes).toEqual(['approval.viewer_already_decided'])
  })

  it('does not advertise an Inbox reply to a workspace admin who is not the exact recipient', () => {
    const item = projectHumanAttentionRow({
      ...row('inbox_item', 'clarification'),
      payload: { sourceMessageId: uuid(10), inboxRevision: 2 },
    }, new Date('2026-08-26T00:02:00.000Z'), {
      id: uuid(11),
      kind: 'human',
      workspaceRole: 'admin',
    })
    expect(item.options).toMatchObject([{ command: 'replyInboxItem' }])
    expect(item.audience).toEqual({
      relationship: 'workspace_administration',
      canRespond: false,
    })
  })
})
