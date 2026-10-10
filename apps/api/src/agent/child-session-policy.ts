import type { PoolClient } from 'pg'
import { agentExecutionCapacitySqlPredicate } from '@workmesh/db'
import { DomainError, inheritChildBudget, reserveChildBudget } from '@workmesh/domain'

/** Caller holds the parent authority/session locks; both creation paths share this admission. */
export async function admitChildSession(tx: PoolClient, parent: {
  id: string; current_plan_version_id: string | null; max_child_sessions: number;
  budget: Record<string, unknown>
}, input: { planStepId: string; planVersionId: string; budget?: Record<string, number> }) {
  if (parent.current_plan_version_id !== input.planVersionId)
    throw new DomainError('STALE_PLAN_VERSION', 'Child sessions must use the parent current plan')
  const step = (await tx.query<{ max_child_sessions: number }>(
    `SELECT step.max_child_sessions FROM agent_plan_steps step
      JOIN agent_plan_versions version ON version.id=step.plan_version_id AND version.session_id=$3
      JOIN agent_plan_step_identities identity ON identity.session_id=version.session_id AND identity.stable_step_id=step.id
      WHERE step.plan_version_id=$1 AND step.id=$2`,
    [input.planVersionId, input.planStepId, parent.id],
  )).rows[0]
  if (!step) throw new DomainError('NOT_FOUND', 'Stable step is not part of the current parent plan')
  const counts = (await tx.query<{ total: number; active: number; step: number }>(
    `SELECT count(*)::int AS total,
      count(*) FILTER (WHERE ${agentExecutionCapacitySqlPredicate('child')})::int AS active,
      count(*) FILTER (WHERE child.plan_step_id=$2 AND ${agentExecutionCapacitySqlPredicate('child')})::int AS step
      FROM agent_sessions child WHERE child.parent_session_id=$1`, [parent.id, input.planStepId],
  )).rows[0]!
  if (counts.total >= parent.max_child_sessions || counts.active >= parent.max_child_sessions)
    throw new DomainError('CHILD_SESSION_LIMIT', 'Parent child-session limit reached', {
      totalChildren: counts.total, activeChildren: counts.active, maxChildren: parent.max_child_sessions,
    })
  if (counts.step >= step.max_child_sessions)
    throw new DomainError('PLAN_STEP_CHILD_SESSION_LIMIT', 'Stable step child-session limit reached', {
      activeChildren: counts.step, maxChildren: step.max_child_sessions, planStepId: input.planStepId,
    })
  const budget = inheritChildBudget(parent.budget as Record<string, number>, input.budget ?? {})
  const reservations = (await tx.query<{ reserved: Record<string, number> }>(
    `SELECT reserved FROM session_budget_reservations WHERE parent_session_id=$1 AND status='reserved' FOR UPDATE`,
    [parent.id],
  )).rows.map(row => row.reserved)
  // Legacy reviews did not reserve a row: count active budgets without rewriting history.
  const legacy = (await tx.query<{ budget: Record<string, number> }>(
    `SELECT child.budget FROM agent_sessions child
      JOIN delegations delegation ON delegation.id=child.delegation_id
      WHERE child.parent_session_id=$1 AND delegation.role='reviewer'
        AND ${agentExecutionCapacitySqlPredicate('child')}
        AND NOT EXISTS (SELECT 1 FROM session_budget_reservations reservation WHERE reservation.child_session_id=child.id)`,
    [parent.id],
  )).rows.map(row => row.budget)
  try { reserveChildBudget(parent.budget as Record<string, number>, [...reservations, ...legacy], budget) }
  catch (error) {
    if (error instanceof DomainError && error.code === 'CHILD_BUDGET_RESERVATION_EXCEEDED')
      throw new DomainError('CHILD_BUDGET_EXCEEDED', 'Child budget exceeds parent reservation', error.details)
    throw error
  }
  return budget
}
