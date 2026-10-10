import type { PoolClient } from 'pg'
import { principalTeamAuthorityPredicate } from '@workmesh/db'
import { DomainError } from '@workmesh/domain'
import type { ApiActor } from '../agent/types.js'
import type { PreparedPage } from '../pagination.js'
import { liveSessionReadPredicate } from '../live-read-authorization.js'

export function liveRepositoryReadPredicate(current: ApiActor, repositorySql: string, values: unknown[], contextIdSql?:string): string {
  const live = liveSessionReadPredicate(current, 'reader.id', 'reader.workspace_id', values, 'repo:read')
  values.push(current.agentSessionId ?? null)
  const sessionId = `$${values.length}`
  return `EXISTS(SELECT 1 FROM agent_sessions reader JOIN delegations rd ON rd.id=reader.delegation_id
    JOIN repositories repo ON repo.id=${repositorySql} AND repo.workspace_id=reader.workspace_id AND repo.team_id=reader.team_id AND repo.active
    JOIN provider_connections conn ON conn.id=repo.connection_id AND conn.workspace_id=repo.workspace_id AND conn.active
    JOIN LATERAL (SELECT candidate.* FROM repository_contexts candidate
      WHERE candidate.repository_id=repo.id AND candidate.workspace_id=reader.workspace_id
        AND (candidate.session_id=reader.id OR candidate.work_item_id=reader.work_item_id
          OR candidate.project_id=COALESCE(reader.project_id,(SELECT w.project_id FROM work_items w WHERE w.id=reader.work_item_id AND w.deleted_at IS NULL)))
      ORDER BY CASE WHEN candidate.session_id IS NOT NULL THEN 0 WHEN candidate.work_item_id IS NOT NULL THEN 1 ELSE 2 END,
               candidate.created_at DESC,candidate.id DESC LIMIT 1) context ON true
    WHERE reader.id=${sessionId} AND coalesce(rd.capability_scope->'repositoryIds','[]'::jsonb) ? repo.id::text
      AND 'read'=ANY(context.permissions) ${contextIdSql ? `AND context.id=${contextIdSql}` : ''}
      AND ${live} AND ${reviewRepositoryParentPredicate('reader','repo','context')})`
}

/** Correlated, current parent authority for a bounded review child. */
export function reviewRepositoryParentPredicate(s: string, r: string, rc: string): string {
  return `(${s}.parent_session_id IS NULL OR NOT EXISTS(SELECT 1 FROM delegations cd
             WHERE cd.id=${s}.delegation_id AND cd.role='reviewer') OR EXISTS (
    SELECT 1 FROM agent_sessions parent
      JOIN delegations pd ON pd.id=parent.delegation_id AND pd.status='active'
      JOIN delegations cd ON cd.id=${s}.delegation_id AND cd.parent_delegation_id=pd.id
      JOIN agent_definitions ad ON ad.id=parent.agent_id AND ad.is_active
      JOIN agent_team_access grant_row ON grant_row.workspace_id=parent.workspace_id
        AND grant_row.agent_id=parent.agent_id AND grant_row.team_id=parent.team_id AND grant_row.revoked_at IS NULL
      JOIN work_items wi ON wi.id=parent.work_item_id AND wi.workspace_id=parent.workspace_id AND wi.deleted_at IS NULL
      JOIN actors principal ON principal.id=pd.principal_human_actor_id AND principal.kind='human' AND principal.is_active
     WHERE parent.id=${s}.parent_session_id AND parent.workspace_id=${s}.workspace_id
       AND ${principalTeamAuthorityPredicate('pd.principal_human_actor_id','parent.workspace_id','parent.team_id')}
       AND parent.team_id=${s}.team_id AND parent.work_item_id=${s}.work_item_id
       AND parent.state IN ('acknowledged','planning','executing','awaiting_input','awaiting_approval','blocked')
       AND 'repo:read'=ANY(pd.permissions_snapshot) AND 'repo:read'=ANY(ad.approved_capabilities)
       AND 'repo:read'=ANY(grant_row.approved_capabilities)
       AND coalesce(pd.capability_scope->'teamIds','[]'::jsonb) ? parent.team_id::text
       AND coalesce(pd.capability_scope->'workItemIds','[]'::jsonb) ? parent.work_item_id::text
       AND coalesce(pd.capability_scope->'repositoryIds','[]'::jsonb) ? ${r}.id::text
       AND EXISTS(SELECT 1 FROM agent_plan_steps step WHERE step.plan_version_id=parent.current_plan_version_id AND step.id=${s}.plan_step_id)
       AND ${rc}.session_id IS NULL AND 'read'=ANY(${rc}.permissions) AND 'review'=ANY(${rc}.permissions)
       AND ${rc}.id=(SELECT candidate.id FROM repository_contexts candidate
          WHERE candidate.workspace_id=parent.workspace_id AND candidate.repository_id=${r}.id
            AND (candidate.session_id=parent.id OR candidate.work_item_id=parent.work_item_id
              OR candidate.project_id=COALESCE(parent.project_id,wi.project_id))
          ORDER BY CASE WHEN candidate.session_id IS NOT NULL THEN 0 WHEN candidate.work_item_id IS NOT NULL THEN 1 ELSE 2 END,
                   candidate.created_at DESC,candidate.id DESC LIMIT 1)
  ))`
}

export async function assertReviewRepositoryScope(
  tx: PoolClient, current: ApiActor, repositoryIds: readonly string[], giteaEnabled: boolean,
): Promise<void> {
  const sorted = [...repositoryIds].sort()
  const locators = (await tx.query<{ connection_id: string }>(
    'SELECT connection_id FROM repositories WHERE workspace_id=$1 AND id=ANY($2::uuid[]) ORDER BY id', [current.workspaceId, sorted],
  )).rows
  await tx.query('SELECT id FROM provider_connections WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE', [[...new Set(locators.map(r => r.connection_id))].sort()])
  await tx.query('SELECT id FROM repositories WHERE workspace_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE', [current.workspaceId, sorted])
  const source=(await tx.query<{team_id:string;principal_human_actor_id:string}>(`SELECT s.team_id,d.principal_human_actor_id
    FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id WHERE s.id=$1 AND s.workspace_id=$2`,[current.agentSessionId,current.workspaceId])).rows[0]
  if(!source) throw new DomainError('REPOSITORY_ACCESS_DENIED','Review parent authority is unavailable')
  await tx.query('SELECT id FROM teams WHERE id=$1 AND workspace_id=$2 FOR SHARE',[source.team_id,current.workspaceId])
  await tx.query('SELECT id FROM actors WHERE id=$1 AND workspace_id=$2 FOR SHARE',[source.principal_human_actor_id,current.workspaceId])
  await tx.query('SELECT actor_id FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3 FOR SHARE',[current.workspaceId,source.team_id,source.principal_human_actor_id])
  const authorized=await tx.query(`SELECT 1 FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id
    WHERE s.id=$1 AND s.workspace_id=$2 AND ${principalTeamAuthorityPredicate('d.principal_human_actor_id','s.workspace_id','s.team_id')}`,[current.agentSessionId,current.workspaceId])
  if(!authorized.rowCount) throw new DomainError('REPOSITORY_ACCESS_DENIED','Review principal no longer has Team authority')
  const contexts = (await applicableAgentRepositoryContexts(tx, current)).rows
  for (const repositoryId of sorted) {
    const context = contexts.find(context => context.id === repositoryId)
    if (!context || (context.provider==='gitea' && !giteaEnabled) || context.session_id !== null || !context.permissions.includes('read') || !context.permissions.includes('review'))
      throw new DomainError('REPOSITORY_ACCESS_DENIED', 'Review requires the latest shared WorkItem or Project repository context')
    // A newly created child has this exact WorkItem but no copied Session pin.
    const parent = (await tx.query<{ work_item_id: string | null; project_id: string | null }>(
      'SELECT s.work_item_id,coalesce(s.project_id,w.project_id) AS project_id FROM agent_sessions s LEFT JOIN work_items w ON w.id=s.work_item_id WHERE s.id=$1',
      [current.agentSessionId],
    )).rows[0]
    if (!parent || (context.work_item_id !== parent.work_item_id && context.project_id !== parent.project_id))
      throw new DomainError('RESOURCE_SCOPE_DENIED', 'Reviewer repository context does not match the parent resources')
  }
}

export type RepositoryRow = {
  id: string
  workspace_id: string
  connection_id: string
  team_id: string
  external_id: string
  full_name: string
  default_branch: string
  required_checks: string[]
  provider: 'fake' | 'github' | 'gitea'
}
export type RepositoryContextRow = RepositoryRow & {
  context_id: string
  project_id: string | null
  work_item_id: string | null
  session_id: string | null
  base_branch: string
  base_sha: string
  branch_pattern: string
  allowed_paths: string[]
  permissions: Array<'read' | 'write_branch' | 'open_pr' | 'review' | 'merge' | 'ci'>
  guidance_manifest_hash: string
  context_created_at: Date
}
export function applicableAgentRepositoryContexts(
  tx: PoolClient,
  current: ApiActor,
  repositoryId?: string,
  page?: PreparedPage,
) {
  if (current.kind !== 'agent' || !current.agentSessionId)
    throw new DomainError('AGENT_IDENTITY_REQUIRED', 'An agent session token is required')
  const values = page?.values
    ?? [current.agentSessionId, current.workspaceId, repositoryId ?? null]
  const liveAuthorization = liveSessionReadPredicate(
    current,
    's.id',
    's.workspace_id',
    values,
    'repo:read',
  )
  if (page) values.push(page.limit + 1)
  return tx.query<RepositoryContextRow>(
    `WITH applicable AS (
       SELECT r.id,r.workspace_id,r.connection_id,r.team_id,r.external_id,r.full_name,r.default_branch,
              r.required_checks,c.provider,rc.id AS context_id,rc.project_id,rc.work_item_id,rc.session_id,
              rc.base_branch,rc.base_sha,rc.branch_pattern,rc.allowed_paths,rc.permissions,
              rc.guidance_manifest_hash,rc.created_at AS context_created_at,
              ${reviewRepositoryParentPredicate('s','r','rc')} AS parent_allowed,
              row_number() OVER (
                PARTITION BY r.id
                ORDER BY CASE WHEN rc.session_id IS NOT NULL THEN 0 WHEN rc.work_item_id IS NOT NULL THEN 1 ELSE 2 END,
                         rc.created_at DESC,rc.id DESC
              ) AS context_rank
         FROM agent_sessions s
         JOIN delegations d ON d.id=s.delegation_id AND d.status='active'
         JOIN agent_definitions a ON a.id=s.agent_id AND a.is_active
         JOIN agent_team_access ata ON ata.workspace_id=s.workspace_id AND ata.agent_id=s.agent_id
           AND ata.team_id=s.team_id AND ata.revoked_at IS NULL
         JOIN repository_contexts rc ON rc.workspace_id=s.workspace_id
           AND ((rc.session_id IS NOT NULL AND rc.session_id=s.id)
             OR (rc.work_item_id IS NOT NULL AND rc.work_item_id=s.work_item_id)
             OR (rc.project_id IS NOT NULL AND rc.project_id=COALESCE(s.project_id,(SELECT w.project_id FROM work_items w WHERE w.id=s.work_item_id AND w.deleted_at IS NULL))))
         JOIN repositories r ON r.id=rc.repository_id AND r.workspace_id=s.workspace_id
           AND r.team_id=s.team_id AND r.active
         JOIN provider_connections c ON c.id=r.connection_id AND c.workspace_id=s.workspace_id AND c.active
        WHERE s.id=$1 AND s.workspace_id=$2
          AND s.state NOT IN ('completed','failed','canceled')
          AND ($3::uuid IS NULL OR r.id=$3)
          AND 'repo:read'=ANY(d.permissions_snapshot)
          AND 'repo:read'=ANY(a.approved_capabilities)
          AND 'repo:read'=ANY(ata.approved_capabilities)
          AND coalesce(d.capability_scope->'repositoryIds','[]'::jsonb) ? r.id::text
          AND ${liveAuthorization}
     )
     SELECT id,workspace_id,connection_id,team_id,external_id,full_name,default_branch,
            required_checks,provider,context_id,project_id,work_item_id,session_id,
            base_branch,base_sha,branch_pattern,allowed_paths,permissions,
            guidance_manifest_hash,context_created_at
       FROM applicable WHERE context_rank=1 AND parent_allowed${page?.predicate ? ` AND ${page.predicate}` : ''}
       ORDER BY ${page?.orderBy ?? 'full_name,id'}${page ? ` LIMIT $${page.values.length}` : ''}`,
    values,
  )
}
