import type { PoolClient } from 'pg'
import type { FeatureConfig } from '@workmesh/config'
import { parseProviderActionCheckpoint, providerActionProjectionSchema, type ProviderActionProjection } from '@workmesh/contracts'
import { DomainError,allowedPath,matchesBranchPattern } from '@workmesh/domain'
import type { ApiActor } from '../agent/types.js'
import { liveHumanTeamReadPredicate, liveSessionReadPredicate } from '../live-read-authorization.js'
import { reviewRepositoryParentPredicate } from './repository-access.js'

type Action = {
  id:string; provider:'fake'|'github'|'gitea'; connection_id:string; repository_id:string; requested_by_actor_id:string;
  session_id:string|null; work_item_id:string|null; project_id:string|null; plan_step_id:string|null;
  expected_head_sha:string|null; approval_id:string|null; kind:ProviderActionProjection['kind'];
  status:ProviderActionProjection['status']; payload:Record<string,unknown>; result:Record<string,unknown>|null;
  attempt_count:number; last_error:string|null; created_at:Date; updated_at:Date; completed_at:Date|null; available_at:Date;
  projection_id:string|null; context_id:string|null; artifact_ids:string[]; claim_expired:boolean;
  context_permissions:string[]|null; context_allowed_paths:string[]|null; context_branch_pattern:string|null;
  context_base_sha:string|null;context_base_branch:string|null;default_branch:string;work_item_key:string|null;
  pull_request_branch:string|null;pull_request_base:string|null;
}

export async function getProviderAction(tx: PoolClient, current: ApiActor, actionId: string, features: FeatureConfig): Promise<ProviderActionProjection> {
  const values:unknown[]=[actionId,current.workspaceId,current.id,features.WORKMESH_BETA_GITEA]
  const live = current.kind==='agent'
    ? `(${liveSessionReadPredicate(current,'s.id','s.workspace_id',values,'repo:read')} AND ${liveSessionReadPredicate(current,'s.id','s.workspace_id',values)})`
    : liveHumanTeamReadPredicate(current,'pa.workspace_id','r.team_id',values)
  const row=(await tx.query<Action>(`SELECT pa.*,c.provider,r.default_branch,team.key||'-'||w.number AS work_item_key,
      rc.permissions AS context_permissions,rc.allowed_paths AS context_allowed_paths,rc.branch_pattern AS context_branch_pattern,
      rc.base_sha AS context_base_sha,rc.base_branch AS context_base_branch,
      (SELECT pr.head_branch FROM pull_request_projections pr WHERE pr.repository_id=pa.repository_id AND pr.work_item_id=pa.work_item_id
        AND (pa.kind='merge_pull_request' AND pr.external_id=pa.payload->>'pullRequestId'
          OR pa.kind='retry_ci_check' AND pr.id::text=pa.payload->>'pullRequestId')) AS pull_request_branch,
      (SELECT pr.base_branch FROM pull_request_projections pr WHERE pr.repository_id=pa.repository_id AND pr.work_item_id=pa.work_item_id
        AND (pa.kind='merge_pull_request' AND pr.external_id=pa.payload->>'pullRequestId'
          OR pa.kind='retry_ci_check' AND pr.id::text=pa.payload->>'pullRequestId')) AS pull_request_base,
      pa.status='claimed' AND pa.claimed_at+interval '60 seconds'<=clock_timestamp() AS claim_expired,
      (SELECT pr.id FROM pull_request_projections pr WHERE pr.repository_id=pa.repository_id AND pr.external_id=pa.result->>'id'
        AND pr.session_id=pa.session_id AND pr.producer_actor_id=pa.requested_by_actor_id AND pr.work_item_id=pa.work_item_id) AS projection_id,
      (SELECT context.id FROM repository_contexts context WHERE context.id::text=pa.result->>'contextId'
        AND context.repository_id=pa.repository_id AND context.created_by_actor_id=pa.requested_by_actor_id
        AND context.project_id IS NOT DISTINCT FROM pa.project_id AND context.work_item_id IS NOT DISTINCT FROM pa.work_item_id
        AND context.session_id IS NOT DISTINCT FROM pa.session_id) AS context_id,
      ARRAY(SELECT al.artifact_id FROM artifact_links al JOIN artifacts art ON art.id=al.artifact_id
        WHERE al.workspace_id=pa.workspace_id AND al.repository_id=pa.repository_id AND al.session_id=pa.session_id
          AND al.work_item_id=pa.work_item_id AND art.producer_actor_id=pa.requested_by_actor_id
          AND al.provenance->>'providerActionId'=pa.id::text ORDER BY al.artifact_id) AS artifact_ids
    FROM provider_actions pa
    JOIN repositories r ON r.id=pa.repository_id AND r.workspace_id=pa.workspace_id AND r.connection_id=pa.connection_id AND r.active
    JOIN provider_connections c ON c.id=pa.connection_id AND c.workspace_id=pa.workspace_id AND c.active
    JOIN teams team ON team.id=r.team_id AND team.workspace_id=pa.workspace_id AND team.deleted_at IS NULL
    LEFT JOIN agent_sessions s ON s.id=pa.session_id AND s.workspace_id=pa.workspace_id
    LEFT JOIN delegations d ON d.id=s.delegation_id
    LEFT JOIN work_items w ON w.id=pa.work_item_id AND w.workspace_id=pa.workspace_id AND w.deleted_at IS NULL
    LEFT JOIN LATERAL (SELECT candidate.* FROM repository_contexts candidate WHERE candidate.repository_id=r.id
      AND candidate.workspace_id=s.workspace_id AND (candidate.session_id=s.id OR candidate.work_item_id=s.work_item_id
        OR candidate.project_id=COALESCE(s.project_id,w.project_id))
      ORDER BY CASE WHEN candidate.session_id IS NOT NULL THEN 0 WHEN candidate.work_item_id IS NOT NULL THEN 1 ELSE 2 END,
               candidate.created_at DESC,candidate.id DESC LIMIT 1) rc ON true
    WHERE pa.id=$1 AND pa.workspace_id=$2 AND (c.provider<>'gitea' OR $4) AND ${live}
      AND ((pa.kind='resolve_repository_context' AND ${current.kind==='human' ? `pa.requested_by_actor_id=$3
        AND EXISTS(SELECT 1 FROM actors human WHERE human.id=$3 AND (human.workspace_role='admin'
          OR EXISTS(SELECT 1 FROM memberships m WHERE m.actor_id=human.id AND m.team_id=r.team_id AND m.role IN ('admin','maintainer'))))
        AND ((pa.project_id IS NOT NULL AND EXISTS(SELECT 1 FROM projects p WHERE p.id=pa.project_id AND p.team_id=r.team_id AND p.deleted_at IS NULL))
          OR (pa.work_item_id IS NOT NULL AND w.team_id=r.team_id)
          OR (pa.session_id IS NOT NULL AND s.team_id=r.team_id))` : 'false'})
      OR (pa.kind<>'resolve_repository_context' AND ${current.kind==='agent' ? 'pa.requested_by_actor_id=$3' : 'd.principal_human_actor_id=$3'}
        AND s.agent_actor_id=pa.requested_by_actor_id AND s.work_item_id=pa.work_item_id AND s.team_id=r.team_id AND w.team_id=r.team_id
        AND (pa.project_id IS NULL OR pa.project_id=w.project_id)
        AND (w.project_id IS NULL OR EXISTS(SELECT 1 FROM projects p WHERE p.id=w.project_id AND p.team_id=r.team_id AND p.deleted_at IS NULL))
        ${current.kind==='agent' ? "AND s.state IN ('acknowledged','planning','executing','awaiting_input','awaiting_approval','blocked')" : ''} AND d.status='active'
        AND EXISTS(SELECT 1 FROM actors aa WHERE aa.id=s.agent_actor_id AND aa.kind='agent' AND aa.is_active)
        AND EXISTS(SELECT 1 FROM actors principal WHERE principal.id=d.principal_human_actor_id AND principal.kind='human' AND principal.is_active)
        AND 'repo:read'=ANY(d.permissions_snapshot) AND coalesce(d.capability_scope->'repositoryIds','[]'::jsonb) ? r.id::text
        AND coalesce(d.capability_scope->'teamIds','[]'::jsonb) ? r.team_id::text
        AND coalesce(d.capability_scope->'workItemIds','[]'::jsonb) ? w.id::text
        AND EXISTS(SELECT 1 FROM agent_definitions ad JOIN agent_team_access grant_row ON grant_row.agent_id=ad.id
          WHERE ad.id=s.agent_id AND ad.is_active AND 'repo:read'=ANY(ad.approved_capabilities)
            AND grant_row.workspace_id=s.workspace_id AND grant_row.team_id=s.team_id AND grant_row.revoked_at IS NULL
            AND 'repo:read'=ANY(grant_row.approved_capabilities))
        AND rc.id IS NOT NULL AND 'read'=ANY(rc.permissions)
        AND (pa.plan_step_id IS NULL OR EXISTS(SELECT 1 FROM agent_plan_steps step WHERE step.plan_version_id=s.current_plan_version_id AND step.id=pa.plan_step_id))
        AND ${reviewRepositoryParentPredicate('s','r','rc')}))`,values)).rows[0]
  if(!row) throw new DomainError('NOT_FOUND','Resource not found')
  if(row.kind!=='resolve_repository_context'){
    const p=row.payload
    const selected=row.kind==='create_branch'?p.name:row.kind==='create_commit'?p.branch:row.kind==='open_pull_request'?p.headBranch:row.pull_request_branch
    let allowed=typeof selected==='string'&&selected!==row.default_branch&&!!row.context_branch_pattern&&!!row.work_item_key
      &&matchesBranchPattern(row.context_branch_pattern,row.work_item_key,selected)
    if(row.kind==='create_branch')allowed=allowed&&p.baseSha===row.context_base_sha
    if(row.kind==='create_commit')allowed=allowed&&Array.isArray(p.files)&&p.files.every(file=>file&&typeof file==='object'
      &&'path' in file&&typeof file.path==='string'&&allowedPath(file.path,row.context_allowed_paths??[]))
    if(row.kind==='open_pull_request')allowed=allowed&&p.baseBranch===row.context_base_branch
    if(row.kind==='merge_pull_request'||row.kind==='retry_ci_check')allowed=allowed&&row.pull_request_base===row.context_base_branch
    if(!allowed)throw new DomainError('NOT_FOUND','Resource not found')
  }
  const raw=parseProviderActionCheckpoint({...row,provider:row.provider})
  const p=row.payload
  let target:unknown, result:unknown=null
  switch(row.kind) {
    case 'create_branch': target={branchName:p.name,baseSha:p.baseSha}; if(raw) result={branchName:raw.name,headSha:raw.headSha}; break
    case 'create_commit': target={branchName:p.branch,expectedHeadSha:p.expectedHeadSha}; if(raw) result={providerCommitId:raw.id,sha:raw.sha,branchName:raw.branch}; break
    case 'open_pull_request': target={baseBranch:p.baseBranch,headBranch:p.headBranch}; if(raw && (row.status!=='completed'||row.projection_id)) result={providerPullRequestId:raw.id,number:raw.number,projectionId:row.projection_id,baseSha:raw.baseSha,headSha:raw.headSha,state:raw.state}; break
    case 'merge_pull_request': target={providerPullRequestId:p.pullRequestId,headSha:p.headSha,method:p.method}; if(raw) result={merged:true,mergeSha:raw.mergeSha}; break
    case 'retry_ci_check': target={providerPullRequestId:p.pullRequestId,headSha:p.headSha,checkRunId:p.checkRunId}; if(raw) result={requested:true,checkRunId:raw.checkRunId}; break
    case 'resolve_repository_context': target={resourceKind:row.project_id?'project':row.work_item_id?'work_item':'session',resourceId:row.project_id??row.work_item_id??row.session_id}; if(raw&&row.context_id) result={contextId:row.context_id}; break
  }
  const effect=result?(row.status==='completed'?'committed':'checkpointed'):'unknown'
  const unprovenHistory=row.kind!=='resolve_repository_context'&&!result&&row.attempt_count>0
    && (row.status==='pending'||row.status==='failed'||row.claim_expired)
  const human= row.status==='dead'||row.status==='completed'&& !result || unprovenHistory
  const poll=effect!=='committed'&&!human
  const codes = ['PROVIDER_ACTION_OUTCOME_UNKNOWN','PROVIDER_ACTION_AUTHORITY_REVOKED','PROVIDER_HEAD_SHA_MISMATCH','MERGE_APPROVAL_EXPIRED','MERGE_APPROVAL_MISMATCH','MERGE_CHECKS_BLOCKED','PROVIDER_CAPABILITY_UNSUPPORTED','PROVIDER_ACTION_CLAIM_LOST'] as const
  const code=codes.find(code=>row.last_error===code||row.last_error?.startsWith(code+':'))
  const projected=providerActionProjectionSchema.safeParse({
    id:row.id,provider:row.provider,connectionId:row.connection_id,repositoryId:row.repository_id,requesterActorId:row.requested_by_actor_id,
    sessionId:row.session_id,workItemId:row.work_item_id,projectId:row.project_id,planStepId:row.plan_step_id,expectedHeadSha:row.expected_head_sha,
    approvalId:row.approval_id,status:row.status,effect,kind:row.kind,target,result,artifactIds:row.artifact_ids,
    createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString(),completedAt:row.completed_at?.toISOString()??null,
    error: row.last_error?{code:code??'PROVIDER_ACTION_FAILED'}:row.result&&!result?{code:'RESULT_UNAVAILABLE'}:null,
    recovery: {kind:effect==='committed'?'none':human?'human_reconcile':'poll_same_action',scheduled:poll,
      nextQueryAt:poll?new Date(Math.max(Date.now()+2000,row.available_at.getTime())).toISOString():null},
  })
  if(!projected.success) throw new DomainError('NOT_FOUND','Resource not found')
  return projected.data
}
