import type { PoolClient } from 'pg'
import { DomainError, agentExecutionCapacityStates } from '@workmesh/domain'

const capacityStateList = agentExecutionCapacityStates
  .map(state => `'${state}'`)
  .join(',')

/**
 * Returns the canonical SQL predicate for an Agent execution-capacity query.
 * The alias is restricted because callers interpolate this trusted fragment.
 */
export function agentExecutionCapacitySqlPredicate(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(alias))
    throw new Error('Agent Session SQL alias is invalid')
  return `${alias}.session_kind='execution' AND ${alias}.state IN (${capacityStateList})`
}

export type AgentExecutionCapacity = Readonly<{
  maxConcurrency: number
  activeExecutionSessionCount: number
  activeExecutionSessionsByState: Readonly<Partial<Record<typeof agentExecutionCapacityStates[number], number>>>
}>

/**
 * Reads capacity after the caller has locked the Agent definition through
 * lockAgentAuthorityPlan. Keeping the assertion after that lock serializes all
 * Session admission paths without introducing a second lock order.
 */
export async function readAgentExecutionCapacityAfterLock(
  tx: PoolClient,
  input: Readonly<{ workspaceId: string; agentId: string }>,
): Promise<AgentExecutionCapacity> {
  const definition = (await tx.query<{ max_concurrency: number }>(
    `SELECT max_concurrency FROM agent_definitions
      WHERE id=$1 AND workspace_id=$2 AND is_active=true`,
    [input.agentId, input.workspaceId],
  )).rows[0]
  if (!definition) throw new DomainError('NOT_FOUND', 'Active Agent definition not found')
  const activeExecutionSessionsByState = Object.fromEntries((await tx.query<{
    state: typeof agentExecutionCapacityStates[number]
    count: number
  }>(
    `SELECT session.state, count(*)::int AS count FROM agent_sessions session
      WHERE session.agent_id=$1 AND session.workspace_id=$2
        AND ${agentExecutionCapacitySqlPredicate('session')}
      GROUP BY session.state`,
    [input.agentId, input.workspaceId],
  )).rows.map(row => [row.state, row.count])) as Partial<Record<typeof agentExecutionCapacityStates[number], number>>
  const activeExecutionSessionCount = Object.values(activeExecutionSessionsByState)
    .reduce((total, count) => total + count, 0)
  return {
    maxConcurrency: definition.max_concurrency,
    activeExecutionSessionCount,
    activeExecutionSessionsByState,
  }
}

export async function assertAgentExecutionCapacityAfterLock(
  tx: PoolClient,
  input: Readonly<{ workspaceId: string; agentId: string }>,
): Promise<AgentExecutionCapacity> {
  const capacity = await readAgentExecutionCapacityAfterLock(tx, input)
  if (capacity.activeExecutionSessionCount >= capacity.maxConcurrency) {
    throw new DomainError(
      'AGENT_CONCURRENCY_LIMIT',
      'Agent execution concurrency limit reached. Coordination Sessions do not consume capacity; complete, stop, or cancel an execution Session, or increase maxConcurrency before retrying.',
      {
        maxConcurrency: capacity.maxConcurrency,
        activeExecutionSessionCount: capacity.activeExecutionSessionCount,
        countedSessionKinds: ['execution'],
        countedSessionStates: [...agentExecutionCapacityStates],
        activeExecutionSessionsByState: capacity.activeExecutionSessionsByState,
      },
    )
  }
  return capacity
}
