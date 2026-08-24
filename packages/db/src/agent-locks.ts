import type { PoolClient } from 'pg'

export type AgentTeamGrantLock = Readonly<{
  workspaceId: string
  agentId: string
  teamId: string
}>

export type AgentAuthorityLockPlan = Readonly<{
  definitionIds?: readonly string[]
  teamGrants?: readonly AgentTeamGrantLock[]
  delegationIds?: readonly string[]
  sessionIds?: readonly string[]
  sessionTokenIds?: readonly string[]
  installationTokenIds?: readonly string[]
  workItemIds?: readonly string[]
  projectIds?: readonly string[]
}>

type InstallationTokenRankWrite<T> = (tx: PoolClient) => Promise<T>

const sortedIds = (values: readonly string[] | undefined): string[] =>
  [...new Set(values ?? [])].sort((left, right) => left.localeCompare(right))

const sortedTeamGrants = (
  values: readonly AgentTeamGrantLock[] | undefined,
): AgentTeamGrantLock[] => {
  const unique = new Map<string, AgentTeamGrantLock>()
  for (const value of values ?? []) {
    unique.set(
      `${value.workspaceId}:${value.agentId}:${value.teamId}`,
      value,
    )
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.agentId.localeCompare(right.agentId)
      || left.teamId.localeCompare(right.teamId)
      || left.workspaceId.localeCompare(right.workspaceId),
  )
}

async function lockIds(
  tx: PoolClient,
  table: string,
  ids: readonly string[] | undefined,
): Promise<void> {
  const sorted = sortedIds(ids)
  if (!sorted.length) return
  await tx.query(
    `SELECT id FROM ${table}
      WHERE id=ANY($1::uuid[])
      ORDER BY id
      FOR UPDATE`,
    [sorted],
  )
}

/**
 * Acquires every Agent authority/resource lock in one global order.
 *
 * Callers may use unlocked locator reads only to discover IDs and immutable
 * routing keys. They must build the complete plan before calling this helper,
 * then re-read and validate every binding and live authority fact afterwards.
 */
export async function lockAgentAuthorityPlan(
  tx: PoolClient,
  plan: AgentAuthorityLockPlan,
): Promise<void> {
  await lockAgentAuthorityPlanWithInstallationTokenWrite(
    tx,
    plan,
    async () => undefined,
  )
}

/**
 * Runs a narrowly scoped InstallationToken reconciliation at rank 7 while the
 * rest of the authority plan remains in the canonical rank order. Callers must
 * discover every lower-rank authority ID before entering this helper and pass
 * any existing InstallationToken row in installationTokenIds.
 */
export async function lockAgentAuthorityPlanWithInstallationTokenWrite<T>(
  tx: PoolClient,
  plan: AgentAuthorityLockPlan,
  writeInstallationToken: InstallationTokenRankWrite<T>,
): Promise<T> {
  await lockIds(tx, 'agent_definitions', plan.definitionIds)

  const grants = sortedTeamGrants(plan.teamGrants)
  if (grants.length) {
    await tx.query(
      `SELECT access.workspace_id,access.agent_id,access.team_id
         FROM agent_team_access access
         JOIN unnest($1::uuid[],$2::uuid[],$3::uuid[])
              AS requested(workspace_id,agent_id,team_id)
           ON requested.workspace_id=access.workspace_id
          AND requested.agent_id=access.agent_id
          AND requested.team_id=access.team_id
        ORDER BY access.agent_id,access.team_id,access.workspace_id
        FOR UPDATE OF access`,
      [
        grants.map(grant => grant.workspaceId),
        grants.map(grant => grant.agentId),
        grants.map(grant => grant.teamId),
      ],
    )
  }

  await lockIds(tx, 'delegations', plan.delegationIds)
  await lockIds(tx, 'agent_sessions', plan.sessionIds)
  await lockIds(tx, 'agent_session_tokens', plan.sessionTokenIds)
  await lockIds(tx, 'agent_installation_tokens', plan.installationTokenIds)
  const result = await writeInstallationToken(tx)
  await lockIds(tx, 'work_items', plan.workItemIds)
  await lockIds(tx, 'projects', plan.projectIds)
  return result
}
