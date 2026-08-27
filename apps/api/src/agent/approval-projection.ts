import type { Pool, PoolClient } from 'pg'
import {
  agentSessionStateSchema,
  approvalResponseSchema,
  approvalStatusSchema,
  type ApprovalResponse,
  type ApprovalViewerActionability,
} from '@workmesh/contracts'
import { DomainError, evaluateApprovalViewerActionability } from '@workmesh/domain'
import type { ApiActor } from './types.js'

type Queryable = Pick<Pool | PoolClient, 'query'>
type ApprovalRow = Record<string, unknown> & {
  id: string
  required_approvals: number
  status: string
  expires_at: Date | string
}
type ApprovalProjectionFacts = {
  approval_id: string
  session_state: string
  definition_active: boolean
  team_grant_active: boolean
  delegation_active: boolean
  resource_scope_active: boolean
  viewer_already_decided: boolean
  decisions: unknown
  approved_count: number
  rejected_count: number
  policy_approved: boolean
}

export type ApprovalQuorum = {
  required: number
  approved: number
  rejected: number
  reached: boolean
}

const serialize = (value: unknown): unknown => {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown
  } catch {
    throw new DomainError('INTERNAL_ERROR', 'Approval response is not serializable')
  }
}

export function normalizeApprovalResponse(
  row: Record<string, unknown>,
  decisions: unknown,
  quorum: ApprovalQuorum,
  viewerActionability?: ApprovalViewerActionability,
): ApprovalResponse {
  const candidate = serialize({
    ...row,
    decisions,
    quorum,
    ...(viewerActionability ? { viewer_actionability: viewerActionability } : {}),
  })
  const parsed = approvalResponseSchema.safeParse(candidate)
  if (!parsed.success)
    throw new DomainError('INTERNAL_ERROR', 'Approval row violates the response contract')
  return parsed.data
}

/**
 * Adds immutable decisions, quorum, and the current Human viewer preview to a
 * page of Approval rows in one bounded query. Agent context reads intentionally
 * omit viewer_actionability because Agents cannot make Human decisions.
 */
export async function projectApprovalResponses(
  db: Queryable,
  rows: readonly ApprovalRow[],
  viewer: ApiActor,
  now = Date.now(),
): Promise<ApprovalResponse[]> {
  if (!rows.length) return []
  const facts = (await db.query<ApprovalProjectionFacts>(
    `SELECT approval.id AS approval_id,
            session.state AS session_state,
            (
              coalesce(definition.is_active,false)
              AND 'work:write'=ANY(coalesce(definition.approved_capabilities,'{}'::text[]))
            ) AS definition_active,
            (
              access.agent_id IS NOT NULL
              AND access.revoked_at IS NULL
              AND 'work:write'=ANY(coalesce(access.approved_capabilities,'{}'::text[]))
            ) AS team_grant_active,
            (
              delegation.id IS NOT NULL
              AND delegation.status='active'
              AND 'work:write'=ANY(coalesce(delegation.permissions_snapshot,'{}'::text[]))
            ) AS delegation_active,
            (
              coalesce(delegation.capability_scope->'teamIds','[]'::jsonb) ? session.team_id::text
              AND (
                session.work_item_id IS NULL
                OR coalesce(delegation.capability_scope->'workItemIds','[]'::jsonb) ? session.work_item_id::text
              )
              AND (
                session.work_item_id IS NOT NULL
                OR coalesce(item.project_id,session.project_id) IS NULL
                OR coalesce(delegation.capability_scope->'projectIds','[]'::jsonb) ? coalesce(item.project_id,session.project_id)::text
              )
              AND (session.work_item_id IS NULL OR item.id IS NOT NULL)
              AND (
                coalesce(item.project_id,session.project_id) IS NULL
                OR project.id IS NOT NULL
              )
            ) AS resource_scope_active,
            EXISTS(
              SELECT 1 FROM approval_decisions viewer_decision
               WHERE viewer_decision.approval_id=approval.id
                 AND viewer_decision.actor_id=$2
            ) AS viewer_already_decided,
            coalesce((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'actor_id',decision.actor_id,
                  'decision',decision.decision,
                  'reason',decision.reason,
                  'source',decision.source,
                  'policy_workspace_id',decision.policy_workspace_id,
                  'policy_revision',decision.policy_revision,
                  'decided_at',decision.decided_at
                ) ORDER BY decision.decided_at,decision.id
              )
                FROM approval_decisions decision
               WHERE decision.approval_id=approval.id
            ),'[]'::jsonb) AS decisions,
            (SELECT count(*)::int FROM approval_decisions decision
              WHERE decision.approval_id=approval.id AND decision.decision='approved') AS approved_count,
            (SELECT count(*)::int FROM approval_decisions decision
              WHERE decision.approval_id=approval.id AND decision.decision='rejected') AS rejected_count,
            EXISTS(
              SELECT 1 FROM approval_decisions decision
               WHERE decision.approval_id=approval.id
                 AND decision.decision='approved'
                 AND decision.source='workspace_policy'
            ) AS policy_approved
       FROM approvals approval
       JOIN agent_sessions session ON session.id=approval.session_id
       LEFT JOIN agent_definitions definition ON definition.id=session.agent_id
       LEFT JOIN agent_team_access access
         ON access.workspace_id=session.workspace_id
        AND access.agent_id=session.agent_id
        AND access.team_id=session.team_id
       LEFT JOIN delegations delegation ON delegation.id=session.delegation_id
       LEFT JOIN work_items item
         ON item.id=session.work_item_id
        AND item.workspace_id=session.workspace_id
        AND item.deleted_at IS NULL
       LEFT JOIN projects project
         ON project.id=coalesce(item.project_id,session.project_id)
        AND project.workspace_id=session.workspace_id
        AND project.deleted_at IS NULL
      WHERE approval.id=ANY($1::uuid[])`,
    [rows.map(row => row.id), viewer.id],
  )).rows
  const byId = new Map(facts.map(fact => [fact.approval_id, fact]))
  return rows.map(row => {
    const fact = byId.get(row.id)
    if (!fact) throw new DomainError('INTERNAL_ERROR', 'Approval projection facts are missing')
    const status = approvalStatusSchema.safeParse(row.status)
    const sessionState = agentSessionStateSchema.safeParse(fact.session_state)
    if (!status.success || !sessionState.success)
      throw new DomainError('INTERNAL_ERROR', 'Approval projection state is invalid')
    const quorum = {
      required: Number(row.required_approvals),
      approved: Number(fact.approved_count),
      rejected: Number(fact.rejected_count),
      reached: fact.policy_approved || Number(fact.approved_count) >= Number(row.required_approvals),
    }
    const viewerActionability = viewer.kind === 'human'
      ? evaluateApprovalViewerActionability({
          status: status.data,
          expiresAt: row.expires_at,
          sessionState: sessionState.data,
          definitionActive: fact.definition_active,
          teamGrantActive: fact.team_grant_active,
          delegationActive: fact.delegation_active,
          resourceScopeActive: fact.resource_scope_active,
          viewerAlreadyDecided: fact.viewer_already_decided,
        }, now)
      : undefined
    return normalizeApprovalResponse(row, fact.decisions, quorum, viewerActionability)
  })
}

export async function loadApprovalViewerActionability(
  db: Queryable,
  approvalIds: readonly string[],
  viewer: ApiActor,
  now = Date.now(),
): Promise<Map<string, ApprovalViewerActionability>> {
  if (viewer.kind !== 'human' || !approvalIds.length) return new Map()
  const ids = [...new Set(approvalIds)]
  const rows = (await db.query<ApprovalRow>(
    'SELECT * FROM approvals WHERE workspace_id=$1 AND id=ANY($2::uuid[])',
    [viewer.workspaceId, ids],
  )).rows
  const projected = await projectApprovalResponses(db, rows, viewer, now)
  return new Map(projected.flatMap(approval => approval.viewer_actionability
    ? [[approval.id, approval.viewer_actionability] as const]
    : []))
}
