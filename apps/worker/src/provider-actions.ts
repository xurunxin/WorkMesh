import { createHash, randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import { appendEvent, withTx } from '@workmesh/db'
import {
  assertMergeReady,
  authorizeAgentMutation,
  canonicalActionApprovalPayload,
  DomainError,
  normalizeProviderCheck,
} from '@workmesh/domain'
import {
  guidanceCandidatePaths,
  normalizeGitHubWebhook,
  type GitProvider,
  type ProviderKind,
  type RepositoryGuidanceEntry,
} from '@workmesh/git-provider'

type ProviderResolver = (provider: ProviderKind, connectionId: string) => GitProvider | Promise<GitProvider>
type WorkerCapability = Parameters<typeof authorizeAgentMutation>[0]['capability']
type ClaimedAction = {
  id: string
  workspace_id: string
  connection_id: string
  repository_id: string
  requested_by_actor_id: string
  session_id: string | null
  work_item_id: string | null
  project_id: string | null
  plan_step_id: string | null
  kind: 'create_branch' | 'create_commit' | 'open_pull_request' | 'merge_pull_request'
    | 'resolve_repository_context' | 'retry_ci_check'
  payload: Record<string, unknown>
  expected_head_sha: string | null
  approval_id: string | null
  attempt_count: number
  result: Record<string, unknown> | null
  provider: ProviderKind
  external_id: string
  full_name: string
  team_id: string
  default_branch: string
}
type ClaimedWebhook = {
  id: string
  connection_id: string
  repository_id: string | null
  event_name: string
  payload: Record<string, unknown>
  attempt_count: number
  workspace_id: string
  service_actor_id: string
  team_id: string | null
}

const checksum = (value: unknown): string =>
  `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
const errorText = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1_000)
const one = <T>(rows: T[]): T => {
  const row = rows[0]
  if (!row) throw new Error('PROVIDER_PROJECTION_NOT_FOUND')
  return row
}
const isNewerObservation = (
  observedAt: string,
  rank: number,
  current: { provider_observed_at: Date | null; provider_observation_rank: number } | undefined,
): boolean => {
  if (!current?.provider_observed_at) return true
  const incomingTime = Date.parse(observedAt)
  const currentTime = current.provider_observed_at.getTime()
  return incomingTime > currentTime || (incomingTime === currentTime && rank > current.provider_observation_rank)
}
const allowedPath = (path: string, scopes: string[]): boolean => {
  const normalized = path.replaceAll('\\', '/')
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) return false
  return scopes.some((scope) => {
    const prefix = scope.replaceAll('\\', '/').replace(/\/\*\*$/, '').replace(/\*$/, '')
    const directory = prefix.replace(/\/$/, '')
    return directory === '' || normalized === directory || normalized.startsWith(`${directory}/`)
  })
}
const matchesBranchPattern = (pattern: string, workItemKey: string, branch: string): boolean => {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const expression = escaped
    .replaceAll('\\{workItemKey\\}', workItemKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .replaceAll('\\{slug\\}', '[a-z0-9]+(?:-[a-z0-9]+)*')
  return new RegExp(`^${expression}$`).test(branch)
}

export function validateUploadedChecksum(expected: string, actual: string): void {
  if (expected !== actual) throw new Error('ARTIFACT_CHECKSUM_MISMATCH')
}

export function createProviderActionWorker(input: {
  db: Pool
  resolveProvider: ProviderResolver
  workerId?: string
  allowedProviders?: ReadonlyArray<'fake' | 'github' | 'gitea'>
}) {
  const workerId = input.workerId ?? `provider-${randomUUID()}`
  const allowedProviders = input.allowedProviders ?? ['fake', 'github', 'gitea']

  const claimAction = (): Promise<ClaimedAction | undefined> => withTx(input.db, async tx => {
    const result = await tx.query<ClaimedAction>(
      `WITH candidate AS (
         SELECT action.id FROM provider_actions action
         JOIN provider_connections connection ON connection.id=action.connection_id
          WHERE action.attempt_count < 8 AND action.available_at<=now()
            AND connection.provider::text=ANY($2::text[])
            AND (action.status IN ('pending','failed') OR (action.status='claimed' AND action.claimed_at<now()-interval '60 seconds'))
          ORDER BY action.available_at,action.created_at FOR UPDATE OF action SKIP LOCKED LIMIT 1
       )
       UPDATE provider_actions a SET status='claimed',claimed_at=now(),claimed_by=$1,attempt_count=a.attempt_count+1,updated_at=now()
       FROM candidate,repositories r,provider_connections c
       WHERE a.id=candidate.id AND r.id=a.repository_id AND c.id=a.connection_id
       RETURNING a.*,c.provider,r.external_id,r.full_name,r.team_id,r.default_branch`,
      [workerId, allowedProviders],
    )
    return result.rows[0]
  })

  const failAction = async (action: ClaimedAction, error: unknown): Promise<void> => {
    await withTx(input.db, async tx => {
      const current = (await tx.query<{ attempt_count: number }>(
        "SELECT attempt_count FROM provider_actions WHERE id=$1 AND claimed_by=$2 AND status='claimed' FOR UPDATE",
        [action.id, workerId],
      )).rows[0]
      if (!current) return
      const terminal = current.attempt_count >= 8
      const reason = errorText(error)
      await tx.query(
        `UPDATE provider_actions SET status=$2,claimed_at=NULL,claimed_by=NULL,last_error=$3,
         available_at=now()+(LEAST(300,5*POWER(2,GREATEST(0,$4-1)))::text||' seconds')::interval,updated_at=now()
         WHERE id=$1 AND claimed_by=$5 AND status='claimed'`,
        [action.id, terminal ? 'dead' : 'failed', reason, current.attempt_count, workerId],
      )
      if (!terminal) return
      if (process.env.PROVIDER_INJECT_FAILURE_AFTER_TERMINAL_UPDATE === 'true') throw new Error('PROVIDER_INJECTED_TERMINAL_ROLLBACK')
      await appendEvent(tx, {
        workspaceId: action.workspace_id, teamId: action.team_id, actorId: action.requested_by_actor_id,
        correlationId: `provider-action:${action.id}`, idempotencyKey: `${action.id}:dead`,
        type: 'provider.action.dead_lettered', aggregateType: 'provider_action', aggregateId: action.id,
        payload: { kind: action.kind, reason },
      })
    })
  }

  const revalidateClaimedProvider = async (action: ClaimedAction): Promise<boolean> =>
    withTx(input.db, async tx => {
      const current = (await tx.query<{ provider: ProviderKind }>(
        `SELECT connection.provider
           FROM provider_actions provider_action
           JOIN provider_connections connection ON connection.id=provider_action.connection_id
          WHERE provider_action.id=$1
            AND provider_action.claimed_by=$2
            AND provider_action.status='claimed'
          FOR UPDATE OF provider_action,connection`,
        [action.id, workerId],
      )).rows[0]
      if (!current) throw new Error('PROVIDER_ACTION_CLAIM_LOST')
      if (allowedProviders.includes(current.provider)) {
        action.provider = current.provider
        return true
      }
      // A deployment gate is reversible, so release the claim without charging
      // an execution attempt or emitting a terminal domain fact.
      const released = await tx.query(
        `UPDATE provider_actions
            SET status='pending',claimed_at=NULL,claimed_by=NULL,
                attempt_count=GREATEST(0,attempt_count-1),available_at=now(),
                last_error=$3,updated_at=now()
          WHERE id=$1 AND claimed_by=$2 AND status='claimed'`,
        [action.id, workerId, `PROVIDER_DISABLED:${current.provider}`],
      )
      if (released.rowCount !== 1) throw new Error('PROVIDER_ACTION_CLAIM_LOST')
      return false
    })

  const authorizeProviderSideEffect = async (action: ClaimedAction): Promise<boolean> => {
    if (!await revalidateClaimedProvider(action)) return false
    return withTx(input.db, async tx => {
    const current = await tx.query(
      "SELECT 1 FROM provider_actions WHERE id=$1 AND claimed_by=$2 AND status='claimed' FOR UPDATE",
      [action.id, workerId],
    )
    if (!current.rowCount) throw new Error('PROVIDER_ACTION_CLAIM_LOST')
    try {
      const facts = (await tx.query<{
        actor_kind: string
        session_id: string
        session_actor_id: string
        session_delegation_id: string
        session_state: Parameters<typeof authorizeAgentMutation>[0]['session']['state']
        session_revision: number
        stop_acknowledged_at: Date | null
        session_team_id: string
        session_work_item_id: string | null
        session_project_id: string | null
        current_plan_version_id: string | null
        delegation_status: string
        permissions_snapshot: WorkerCapability[]
        capability_scope: { teamIds?: string[]; workItemIds?: string[]; projectIds?: string[]; repositoryIds?: string[] }
        agent_active: boolean
        definition_capabilities: WorkerCapability[]
        team_capabilities: WorkerCapability[] | null
        team_access_revoked_at: Date | null
        work_item_team_id: string
        work_item_project_id: string | null
        work_item_number: number
        work_item_deleted_at: Date | null
        team_key: string
        repository_workspace_id: string
        repository_connection_id: string
        repository_team_id: string
        repository_active: boolean
        connection_workspace_id: string
        connection_active: boolean
        context_id: string | null
        context_base_branch: string | null
        context_base_sha: string | null
        context_branch_pattern: string | null
        context_allowed_paths: string[] | null
        context_permissions: string[] | null
        plan_step_valid: boolean
      }>(
        `SELECT aa.kind AS actor_kind,s.id AS session_id,s.agent_actor_id AS session_actor_id,
                s.delegation_id AS session_delegation_id,s.state AS session_state,
                s.revision AS session_revision,s.stop_acknowledged_at,
                s.team_id AS session_team_id,s.work_item_id AS session_work_item_id,
                s.project_id AS session_project_id,s.current_plan_version_id,
                d.status AS delegation_status,d.permissions_snapshot,d.capability_scope,
                ad.is_active AS agent_active,ad.approved_capabilities AS definition_capabilities,
                ata.approved_capabilities AS team_capabilities,ata.revoked_at AS team_access_revoked_at,
                w.team_id AS work_item_team_id,w.project_id AS work_item_project_id,
                w.number AS work_item_number,w.deleted_at AS work_item_deleted_at,t.key AS team_key,
                r.workspace_id AS repository_workspace_id,r.connection_id AS repository_connection_id,
                r.team_id AS repository_team_id,r.active AS repository_active,
                c.workspace_id AS connection_workspace_id,c.active AS connection_active,
                rc.id AS context_id,rc.base_branch AS context_base_branch,rc.base_sha AS context_base_sha,
                rc.branch_pattern AS context_branch_pattern,rc.allowed_paths AS context_allowed_paths,
                rc.permissions AS context_permissions,
                (pa.plan_step_id IS NULL OR EXISTS(
                  SELECT 1 FROM agent_plan_steps ps
                   WHERE ps.plan_version_id=s.current_plan_version_id AND ps.id=pa.plan_step_id
                )) AS plan_step_valid
           FROM provider_actions pa
           JOIN agent_sessions s ON s.id=pa.session_id AND s.workspace_id=pa.workspace_id
           JOIN actors aa ON aa.id=pa.requested_by_actor_id AND aa.workspace_id=pa.workspace_id
           JOIN delegations d ON d.id=s.delegation_id AND d.workspace_id=s.workspace_id
           JOIN agent_definitions ad ON ad.id=s.agent_id AND ad.workspace_id=s.workspace_id
           LEFT JOIN agent_team_access ata ON ata.workspace_id=s.workspace_id AND ata.agent_id=s.agent_id
             AND ata.team_id=s.team_id AND ata.revoked_at IS NULL
           JOIN work_items w ON w.id=pa.work_item_id AND w.workspace_id=pa.workspace_id
           JOIN teams t ON t.id=w.team_id AND t.workspace_id=w.workspace_id
           JOIN repositories r ON r.id=pa.repository_id AND r.workspace_id=pa.workspace_id
           JOIN provider_connections c ON c.id=pa.connection_id AND c.workspace_id=pa.workspace_id
           LEFT JOIN LATERAL (
             SELECT candidate.*
               FROM repository_contexts candidate
              WHERE candidate.workspace_id=s.workspace_id AND candidate.repository_id=r.id
                AND ((candidate.session_id IS NOT NULL AND candidate.session_id=s.id)
                  OR (candidate.work_item_id IS NOT NULL AND candidate.work_item_id=s.work_item_id)
                  OR (candidate.project_id IS NOT NULL AND candidate.project_id=s.project_id))
              ORDER BY CASE WHEN candidate.session_id IS NOT NULL THEN 0
                            WHEN candidate.work_item_id IS NOT NULL THEN 1 ELSE 2 END,
                       candidate.created_at DESC,candidate.id DESC
              LIMIT 1
           ) rc ON true
          WHERE pa.id=$1 AND pa.claimed_by=$2 AND pa.status='claimed'`,
        [action.id, workerId],
      )).rows[0]
      if (!facts) throw new DomainError('PROVIDER_ACTION_AUTHORITY_REVOKED', 'Provider action authority facts are unavailable')
      const exactTarget =
        facts.actor_kind === 'agent' &&
        facts.session_id === action.session_id &&
        facts.session_actor_id === action.requested_by_actor_id &&
        facts.session_work_item_id === action.work_item_id &&
        facts.session_team_id === action.team_id &&
        facts.work_item_team_id === action.team_id &&
        facts.repository_team_id === action.team_id &&
        facts.repository_workspace_id === action.workspace_id &&
        facts.connection_workspace_id === action.workspace_id &&
        facts.repository_connection_id === action.connection_id &&
        facts.work_item_deleted_at === null &&
        (action.project_id === null || facts.work_item_project_id === action.project_id) &&
        facts.plan_step_valid
      if (!exactTarget)
        throw new DomainError('RESOURCE_SCOPE_DENIED', 'Provider action target no longer matches the session and repository')
      if (!facts.repository_active || !facts.connection_active)
        throw new DomainError('REPOSITORY_ACCESS_DENIED', 'Repository or provider connection is no longer active')
      if (!action.session_id || !action.work_item_id)
        throw new DomainError('RESOURCE_SCOPE_DENIED', 'Agent provider actions require a session and work item')
      const capability: WorkerCapability = action.kind === 'open_pull_request'
        ? 'repo:open_pr'
        : action.kind === 'merge_pull_request'
          ? 'repo:merge'
          : action.kind === 'retry_ci_check'
            ? 'ci:run'
            : 'repo:write_branch'
      const contextPermission = action.kind === 'open_pull_request'
        ? 'open_pr'
        : action.kind === 'merge_pull_request'
          ? 'merge'
          : action.kind === 'retry_ci_check'
            ? 'ci'
            : 'write_branch'
      if (!facts.agent_active || !facts.team_capabilities || facts.team_access_revoked_at)
        throw new DomainError('DELEGATION_NOT_ACTIVE', 'Agent definition or team access is no longer active')
      const liveCapabilities = (facts.permissions_snapshot ?? []).filter(value =>
        facts.definition_capabilities.includes(value) && facts.team_capabilities?.includes(value))
      if (!liveCapabilities.includes('repo:read'))
        throw new DomainError('CAPABILITY_DENIED', 'Live grants no longer allow repository context access')
      const scope = facts.capability_scope ?? {}
      const resourceInScope = Boolean(scope.teamIds?.includes(action.team_id)) &&
        Boolean(scope.workItemIds?.includes(action.work_item_id)) &&
        (action.project_id === null || Boolean(scope.projectIds?.includes(action.project_id)))
      authorizeAgentMutation({
        actorId: action.requested_by_actor_id,
        actorKind: 'agent',
        session: {
          id: facts.session_id,
          actorId: facts.session_actor_id,
          delegationId: facts.session_delegation_id,
          state: facts.session_state,
          revision: facts.session_revision,
          stopCleanupAcknowledged: Boolean(facts.stop_acknowledged_at),
        },
        targetSessionId: action.session_id,
        delegation: {
          id: facts.session_delegation_id,
          active: facts.delegation_status === 'active',
        },
        capability,
        grantedCapabilities: liveCapabilities,
        resourceInScope,
        idempotencyKey: action.id,
        operation: 'artifact',
      })
      if (!scope.repositoryIds?.includes(action.repository_id))
        throw new DomainError('RESOURCE_SCOPE_DENIED', 'Repository is outside the live delegation scope')
      if (!facts.context_id || !facts.context_permissions?.includes(contextPermission))
        throw new DomainError('CAPABILITY_DENIED', `Latest repository context does not allow ${contextPermission}`)
      const workItemKey = `${facts.team_key}-${facts.work_item_number}`
      if (action.kind === 'create_branch') {
        const payload = action.payload as { name: string; baseSha: string }
        if (payload.baseSha !== facts.context_base_sha ||
          !facts.context_branch_pattern ||
          !matchesBranchPattern(facts.context_branch_pattern, workItemKey, payload.name))
          throw new DomainError('REPOSITORY_GUIDANCE_INVALID', 'Branch intent no longer matches the latest repository context')
      } else if (action.kind === 'create_commit') {
        const payload = action.payload as { branch: string; files: Array<{ path: string }> }
        if (!facts.context_branch_pattern ||
          !matchesBranchPattern(facts.context_branch_pattern, workItemKey, payload.branch) ||
          payload.files.some(file => !allowedPath(file.path, facts.context_allowed_paths ?? [])))
          throw new DomainError('REPOSITORY_PATH_DENIED', 'Commit intent no longer matches the latest repository context')
      } else if (action.kind === 'open_pull_request') {
        const payload = action.payload as { baseBranch: string; headBranch: string }
        if (payload.baseBranch !== facts.context_base_branch ||
          !facts.context_branch_pattern ||
          !matchesBranchPattern(facts.context_branch_pattern, workItemKey, payload.headBranch))
          throw new DomainError('REPOSITORY_GUIDANCE_INVALID', 'Pull-request intent no longer matches the latest repository context')
      }
      return true
    } catch (error) {
      const code = error instanceof DomainError ? error.code : 'PROVIDER_ACTION_AUTHORITY_REVOKED'
      const reason = `PROVIDER_ACTION_AUTHORITY_REVOKED:${code}`
      await tx.query(
        `UPDATE provider_actions
            SET status='dead',claimed_at=NULL,claimed_by=NULL,last_error=$3,updated_at=now()
          WHERE id=$1 AND claimed_by=$2 AND status='claimed'`,
        [action.id, workerId, reason],
      )
      await appendEvent(tx, {
        workspaceId: action.workspace_id, teamId: action.team_id, actorId: action.requested_by_actor_id,
        correlationId: `provider-action:${action.id}`,
        idempotencyKey: `${action.id}:authorization-revoked`,
        type: 'provider.action.authorization_revoked',
        aggregateType: 'provider_action',
        aggregateId: action.id,
        payload: { kind: action.kind, reason: code },
      })
      return false
    }
  })
  }

  const authorizeRepositoryContextResolution = async (action: ClaimedAction): Promise<boolean> => {
    if (!await revalidateClaimedProvider(action)) return false
    return withTx(input.db, async tx => {
      const current = await tx.query(
        "SELECT 1 FROM provider_actions WHERE id=$1 AND claimed_by=$2 AND status='claimed' FOR UPDATE",
        [action.id, workerId],
      )
      if (!current.rowCount) throw new Error('PROVIDER_ACTION_CLAIM_LOST')
      const payload = action.payload as {
        projectId?: string
        workItemId?: string
        sessionId?: string
      }
      const authorization = (await tx.query<{
        actor_active: boolean
        actor_kind: string
        workspace_role: string | null
        repository_active: boolean
        connection_active: boolean
        maintainer: boolean
        target_valid: boolean
      }>(
        `SELECT a.is_active AS actor_active,a.kind AS actor_kind,a.workspace_role,
                r.active AS repository_active,c.active AS connection_active,
                EXISTS(
                  SELECT 1 FROM memberships m
                   WHERE m.workspace_id=a.workspace_id AND m.team_id=r.team_id
                     AND m.actor_id=a.id AND m.role IN ('admin','maintainer')
                ) AS maintainer,
                CASE
                  WHEN $4::uuid IS NOT NULL THEN EXISTS(
                    SELECT 1 FROM projects p WHERE p.id=$4 AND p.workspace_id=a.workspace_id
                      AND p.team_id=r.team_id AND p.deleted_at IS NULL)
                  WHEN $5::uuid IS NOT NULL THEN EXISTS(
                    SELECT 1 FROM work_items w WHERE w.id=$5 AND w.workspace_id=a.workspace_id
                      AND w.team_id=r.team_id AND w.deleted_at IS NULL)
                  WHEN $6::uuid IS NOT NULL THEN EXISTS(
                    SELECT 1 FROM agent_sessions s WHERE s.id=$6 AND s.workspace_id=a.workspace_id
                      AND s.team_id=r.team_id)
                  ELSE false
                END AS target_valid
           FROM actors a
           JOIN repositories r ON r.id=$3 AND r.workspace_id=a.workspace_id
           JOIN provider_connections c ON c.id=r.connection_id AND c.workspace_id=r.workspace_id
          WHERE a.id=$1 AND a.workspace_id=$2`,
        [action.requested_by_actor_id, action.workspace_id, action.repository_id,
          payload.projectId ?? null, payload.workItemId ?? null, payload.sessionId ?? null],
      )).rows[0]
      if (authorization?.actor_active && authorization.actor_kind === 'human' &&
          authorization.repository_active && authorization.connection_active &&
          authorization.target_valid &&
          (authorization.workspace_role === 'admin' || authorization.maintainer))
        return true
      const reason = 'PROVIDER_ACTION_AUTHORITY_REVOKED:REPOSITORY_CONTEXT_RESOLUTION_DENIED'
      await tx.query(
        `UPDATE provider_actions
            SET status='dead',claimed_at=NULL,claimed_by=NULL,last_error=$3,updated_at=now()
          WHERE id=$1 AND claimed_by=$2 AND status='claimed'`,
        [action.id, workerId, reason],
      )
      await appendEvent(tx, {
        workspaceId: action.workspace_id, teamId: action.team_id,
        actorId: action.requested_by_actor_id,
        correlationId: `provider-action:${action.id}`,
        idempotencyKey: `${action.id}:authorization-revoked`,
        type: 'provider.action.authorization_revoked',
        aggregateType: 'provider_action',
        aggregateId: action.id,
        payload: { kind: action.kind, reason: 'REPOSITORY_CONTEXT_RESOLUTION_DENIED' },
      })
      return false
    })
  }

  const checkpointProviderResult = async (
    action: ClaimedAction,
    result: Record<string, unknown>,
  ): Promise<void> => {
    const checkpointed = await input.db.query(
      `UPDATE provider_actions SET result=$3,updated_at=now()
        WHERE id=$1 AND claimed_by=$2 AND status='claimed'`,
      [action.id, workerId, result],
    )
    if (checkpointed.rowCount !== 1) throw new Error('PROVIDER_ACTION_CLAIM_LOST')
  }

  const invalidateMergeForLiveHeadMismatch = async (action: ClaimedAction, liveHeadSha: string): Promise<void> => {
    await withTx(input.db, async tx => {
      const current = await tx.query(
        "SELECT 1 FROM provider_actions WHERE id=$1 AND claimed_by=$2 AND status='claimed' FOR UPDATE",
        [action.id, workerId],
      )
      if (!current.rowCount) throw new Error('PROVIDER_ACTION_CLAIM_LOST')
      const invalidated = await tx.query<{ approval_id: string }>(
        `UPDATE merge_approval_bindings
            SET invalidated_at=now(),invalidation_reason='live provider head changed'
          WHERE approval_id=$1 AND repository_id=$2 AND invalidated_at IS NULL
          RETURNING approval_id`,
        [action.approval_id, action.repository_id],
      )
      if (invalidated.rowCount)
        await tx.query(
          "UPDATE approvals SET status='canceled',revision=revision+1,updated_at=now() WHERE id=$1 AND status IN ('pending','approved')",
          [action.approval_id],
        )
      await tx.query(
        `UPDATE provider_actions
            SET status='dead',claimed_at=NULL,claimed_by=NULL,last_error='PROVIDER_HEAD_SHA_MISMATCH',updated_at=now()
          WHERE id=$1 AND claimed_by=$2 AND status='claimed'`,
        [action.id, workerId],
      )
      await appendEvent(tx, {
        workspaceId: action.workspace_id, teamId: action.team_id, actorId: action.requested_by_actor_id,
        correlationId: `provider-action:${action.id}`, idempotencyKey: action.id,
        type: 'pull_request.merge_approval.invalidated',
        aggregateType: 'provider_action', aggregateId: action.id,
        payload: {
          approvalId: action.approval_id,
          expectedHeadSha: action.expected_head_sha,
          liveHeadSha,
          reason: 'PROVIDER_HEAD_SHA_MISMATCH',
        },
      })
    })
  }

  const expireMergeApproval = async (action: ClaimedAction): Promise<void> => {
    await withTx(input.db, async tx => {
      const current = await tx.query(
        "SELECT 1 FROM provider_actions WHERE id=$1 AND claimed_by=$2 AND status='claimed' FOR UPDATE",
        [action.id, workerId],
      )
      if (!current.rowCount) throw new Error('PROVIDER_ACTION_CLAIM_LOST')
      await tx.query(
        `UPDATE approvals
            SET status='expired',revision=revision+1,updated_at=now()
          WHERE id=$1 AND status='approved' AND expires_at<=now()`,
        [action.approval_id],
      )
      await tx.query(
        `UPDATE merge_approval_bindings
            SET invalidated_at=COALESCE(invalidated_at,now()),
                invalidation_reason=COALESCE(invalidation_reason,'approval expired before provider merge')
          WHERE approval_id=$1 AND repository_id=$2`,
        [action.approval_id, action.repository_id],
      )
      await tx.query(
        `UPDATE provider_actions
            SET status='dead',claimed_at=NULL,claimed_by=NULL,last_error='MERGE_APPROVAL_EXPIRED',updated_at=now()
          WHERE id=$1 AND claimed_by=$2 AND status='claimed'`,
        [action.id, workerId],
      )
      await appendEvent(tx, {
        workspaceId: action.workspace_id, teamId: action.team_id, actorId: action.requested_by_actor_id,
        correlationId: `provider-action:${action.id}`, idempotencyKey: action.id,
        type: 'pull_request.merge_approval.invalidated',
        aggregateType: 'provider_action', aggregateId: action.id,
        payload: {
          approvalId: action.approval_id,
          expectedHeadSha: action.expected_head_sha,
          reason: 'MERGE_APPROVAL_EXPIRED',
        },
      })
    })
  }

  const revalidateMergeExecution = async (
    action: ClaimedAction,
    payload: { pullRequestId: string; headSha: string; method: 'merge' | 'squash' | 'rebase' },
    providerAlreadyMerged = false,
  ): Promise<Date | undefined> => withTx(input.db, async tx => {
    const current = await tx.query(
      "SELECT 1 FROM provider_actions WHERE id=$1 AND claimed_by=$2 AND status='claimed' FOR UPDATE",
      [action.id, workerId],
    )
    if (!current.rowCount) throw new Error('PROVIDER_ACTION_CLAIM_LOST')
    const gate = (await tx.query<{
      status: string
      expires_at: Date
      consumed_at: Date | null
      approval_workspace_id: string
      approval_session_id: string
      approval_requested_by_actor_id: string
      approval_action_name: string
      approval_action_payload_hash: string
      connection_id: string
      repository_id: string
      pull_request_id: string
      provider_pull_request_id: string
      head_sha: string
      method: string
      canonical_payload_hash: string
      invalidated_at: Date | null
      projection_head_sha: string
      projection_state: string
      producer_actor_id: string
      required_checks: string[]
    }>(
      `SELECT a.status,a.expires_at,a.consumed_at,a.workspace_id AS approval_workspace_id,
              a.session_id AS approval_session_id,a.requested_by_actor_id AS approval_requested_by_actor_id,
              a.action_name AS approval_action_name,a.action_payload_hash AS approval_action_payload_hash,
              b.connection_id,b.repository_id,b.pull_request_id,b.provider_pull_request_id,
              b.head_sha,b.method,b.canonical_payload_hash,b.invalidated_at,
              pr.head_sha AS projection_head_sha,pr.state AS projection_state,
              pr.producer_actor_id,r.required_checks
         FROM merge_approval_bindings b
         JOIN approvals a ON a.id=b.approval_id
         JOIN pull_request_projections pr ON pr.id=b.pull_request_id AND pr.repository_id=b.repository_id
         JOIN repositories r ON r.id=b.repository_id AND r.connection_id=b.connection_id
        WHERE b.approval_id=$1
        FOR SHARE OF a,b,pr,r`,
      [action.approval_id],
    )).rows[0]
    if (!gate) throw new Error('MERGE_APPROVAL_INVALIDATED')
    if (!providerAlreadyMerged && gate.expires_at.getTime() <= Date.now()) {
      await tx.query(
        `UPDATE approvals
            SET status='expired',revision=revision+1,updated_at=now()
          WHERE id=$1 AND status='approved' AND expires_at<=now()`,
        [action.approval_id],
      )
      await tx.query(
        `UPDATE merge_approval_bindings
            SET invalidated_at=COALESCE(invalidated_at,now()),
                invalidation_reason=COALESCE(invalidation_reason,'approval expired before provider merge')
          WHERE approval_id=$1`,
        [action.approval_id],
      )
      await tx.query(
        `UPDATE provider_actions
            SET status='dead',claimed_at=NULL,claimed_by=NULL,last_error='MERGE_APPROVAL_EXPIRED',updated_at=now()
          WHERE id=$1 AND claimed_by=$2 AND status='claimed'`,
        [action.id, workerId],
      )
      await appendEvent(tx, {
        workspaceId: action.workspace_id, teamId: action.team_id, actorId: action.requested_by_actor_id,
        correlationId: `provider-action:${action.id}`, idempotencyKey: action.id,
        type: 'pull_request.merge_approval.invalidated',
        aggregateType: 'provider_action', aggregateId: action.id,
        payload: {
          approvalId: action.approval_id,
          expectedHeadSha: action.expected_head_sha,
          reason: 'MERGE_APPROVAL_EXPIRED',
        },
      })
      return undefined
    }
    const exactBinding =
      gate.status === 'approved' &&
      !gate.consumed_at &&
      !gate.invalidated_at &&
      gate.approval_workspace_id === action.workspace_id &&
      gate.approval_session_id === action.session_id &&
      gate.approval_requested_by_actor_id === action.requested_by_actor_id &&
      gate.approval_action_name === 'provider.pull_request.merge' &&
      gate.approval_action_payload_hash === gate.canonical_payload_hash &&
      gate.connection_id === action.connection_id &&
      gate.repository_id === action.repository_id &&
      gate.provider_pull_request_id === payload.pullRequestId &&
      gate.head_sha === payload.headSha &&
      gate.projection_head_sha === payload.headSha &&
      gate.projection_state === (providerAlreadyMerged ? 'merged' : 'open') &&
      gate.method === payload.method &&
      action.expected_head_sha === payload.headSha
    if (!exactBinding) throw new Error('MERGE_APPROVAL_INVALIDATED')
    if (providerAlreadyMerged) return gate.expires_at
    const checks = (await tx.query<{ name: string; status: string; head_sha: string }>(
      `SELECT configured.name,latest.status,latest.head_sha
         FROM unnest($2::text[]) AS configured(name)
         JOIN LATERAL (
           SELECT c.status,c.head_sha
             FROM ci_check_projections c
            WHERE c.pull_request_id=$1 AND c.name=configured.name AND c.head_sha=$3
            ORDER BY c.provider_observed_at DESC NULLS LAST,
                     c.provider_observation_rank DESC,c.updated_at DESC,c.external_id DESC
            LIMIT 1
         ) latest ON true`,
      [gate.pull_request_id, gate.required_checks, payload.headSha],
    )).rows
    if (checks.length !== gate.required_checks.length || checks.some(check => check.status !== 'passed'))
      throw new Error('MERGE_REQUIRED_CHECKS_NOT_PASSED')
    const reviews = (await tx.query<{
      id: string
      reviewer_actor_id: string
      head_sha: string
      verdict: 'approved' | 'changes_requested' | 'commented'
    }>(
      `SELECT id,reviewer_actor_id,head_sha,verdict
         FROM structured_reviews
        WHERE pull_request_id=$1 AND head_sha=$2
        ORDER BY created_at,id`,
      [gate.pull_request_id, payload.headSha],
    )).rows
    const findings = (await tx.query<{
      severity: 'blocking' | 'high' | 'medium' | 'low'
      file: string
      line: number
      summary: string
      evidence: string
      recommendation: string
    }>(
      `SELECT severity,file,line,summary,evidence,recommendation
         FROM structured_review_findings
        WHERE review_id=ANY($1::uuid[])`,
      [reviews.map(review => review.id)],
    )).rows
    assertMergeReady({
      approvalHeadSha: gate.head_sha,
      currentHeadSha: gate.projection_head_sha,
      producerActorId: gate.producer_actor_id,
      reviews: reviews.map(review => ({
        reviewerActorId: review.reviewer_actor_id,
        headSha: review.head_sha,
        verdict: review.verdict,
      })),
      findings,
      checks: checks.map(check => ({
        name: check.name,
        status: check.status as 'queued' | 'running' | 'passed' | 'failed' | 'skipped',
        required: true,
        headSha: check.head_sha,
      })),
    })
    return gate.expires_at
  })

  const revalidateCiRetryExecution = async (
    action: ClaimedAction,
    payload: {
      provider: ProviderKind
      connectionId: string
      repositoryId: string
      pullRequestId: string
      checkRunId: string
      headSha: string
    },
  ): Promise<void> => withTx(input.db, async tx => {
    const gate = (await tx.query<{
      status: string
      expires_at: Date
      consumed_at: Date | null
      session_id: string
      requested_by_actor_id: string
      action_name: string
      action_payload_hash: string
      action_payload_sanitized: Record<string, unknown>
      projection_head_sha: string
      projection_state: string
      check_status: string
    }>(
      `SELECT a.status,a.expires_at,a.consumed_at,a.session_id,a.requested_by_actor_id,
              a.action_name,a.action_payload_hash,a.action_payload_sanitized,
              pr.head_sha AS projection_head_sha,pr.state AS projection_state,
              ci.status AS check_status
         FROM provider_actions pa
         JOIN approvals a ON a.id=pa.approval_id
         JOIN pull_request_projections pr ON pr.id=$3 AND pr.repository_id=pa.repository_id
         JOIN ci_check_projections ci ON ci.pull_request_id=pr.id
           AND ci.external_id=$4 AND ci.head_sha=pr.head_sha
        WHERE pa.id=$1 AND pa.claimed_by=$2 AND pa.status='claimed'
        FOR SHARE OF a,pr,ci`,
      [action.id, workerId, payload.pullRequestId, payload.checkRunId],
    )).rows[0]
    const expectedHash = `sha256:${createHash('sha256')
      .update(canonicalActionApprovalPayload(payload)).digest('hex')}`
    const exact = gate &&
      gate.status === 'approved' &&
      gate.expires_at.getTime() > Date.now() &&
      !gate.consumed_at &&
      gate.session_id === action.session_id &&
      gate.requested_by_actor_id === action.requested_by_actor_id &&
      gate.action_name === 'provider.ci.retry' &&
      gate.action_payload_hash === expectedHash &&
      canonicalActionApprovalPayload(gate.action_payload_sanitized) ===
        canonicalActionApprovalPayload(payload) &&
      payload.provider === action.provider &&
      payload.connectionId === action.connection_id &&
      payload.repositoryId === action.repository_id &&
      payload.headSha === action.expected_head_sha &&
      gate.projection_head_sha === payload.headSha &&
      gate.projection_state === 'open' &&
      ['failed', 'skipped'].includes(gate.check_status)
    if (!exact) throw new Error('CI_RETRY_APPROVAL_INVALIDATED')
  })

  const finishAction = async (action: ClaimedAction, result: Record<string, unknown>): Promise<void> => {
    await withTx(input.db, async tx => {
      const current = await tx.query(
        "SELECT 1 FROM provider_actions WHERE id=$1 AND claimed_by=$2 AND status='claimed' FOR UPDATE",
        [action.id, workerId],
      )
      if (!current.rowCount) throw new Error('PROVIDER_ACTION_CLAIM_LOST')
      if (action.kind === 'resolve_repository_context') {
        const payload = action.payload as {
          projectId?: string
          workItemId?: string
          sessionId?: string
          baseBranch: string
          baseSha: string
          branchPattern: string
          allowedPaths: string[]
          permissions: string[]
        }
        const guidance = (result.guidance ?? []) as RepositoryGuidanceEntry[]
        const candidates = new Set(guidanceCandidatePaths(payload.allowedPaths))
        const seen = new Set<string>()
        for (const entry of guidance) {
          const contentHash = `sha256:${createHash('sha256').update(entry.content).digest('hex')}`
          if (!candidates.has(entry.path) || seen.has(entry.path) ||
              entry.contentHash !== contentHash || !entry.blobSha)
            throw new Error('PROVIDER_GUIDANCE_RESULT_INVALID')
          seen.add(entry.path)
        }
        const manifestHash = checksum(guidance.map(entry => ({
          path: entry.path,
          blobSha: entry.blobSha,
          contentHash: entry.contentHash,
        })))
        const context = one((await tx.query<{ id: string }>(
          `INSERT INTO repository_contexts(
             workspace_id,repository_id,project_id,work_item_id,session_id,base_branch,base_sha,
             branch_pattern,allowed_paths,permissions,guidance_manifest_hash,created_by_actor_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING id`,
          [action.workspace_id, action.repository_id, payload.projectId ?? null,
            payload.workItemId ?? null, payload.sessionId ?? null, payload.baseBranch,
            payload.baseSha, payload.branchPattern, payload.allowedPaths, payload.permissions,
            manifestHash, action.requested_by_actor_id],
        )).rows)
        for (const [ordinal, entry] of guidance.entries())
          await tx.query(
            `INSERT INTO repository_guidance_entries(
               context_id,ordinal,path,blob_sha,content_hash,content)
             VALUES($1,$2,$3,$4,$5,$6)`,
            [context.id, ordinal, entry.path, entry.blobSha, entry.contentHash, entry.content],
          )
        await tx.query(
          `UPDATE provider_actions
              SET status='completed',result=$3,completed_at=now(),claimed_at=NULL,
                  claimed_by=NULL,updated_at=now()
            WHERE id=$1 AND claimed_by=$2 AND status='claimed'`,
          [action.id, workerId, { contextId: context.id, guidance }],
        )
        await appendEvent(tx, {
          workspaceId: action.workspace_id,
          teamId: action.team_id,
          actorId: action.requested_by_actor_id,
          correlationId: `provider-action:${action.id}`,
          idempotencyKey: action.id,
          type: 'repository.context.pinned',
          aggregateType: 'repository_context',
          aggregateId: context.id,
          payload: {
            repositoryId: action.repository_id,
            baseSha: payload.baseSha,
            guidanceManifestHash: manifestHash,
            providerActionId: action.id,
          },
        })
        return
      }
      let artifactId: string | null = null
      let existingPullRequestId: string | null = null
      if (action.kind === 'open_pull_request') {
        const existing = (await tx.query<{
          id: string
          workspace_id: string
          repository_id: string
          work_item_id: string | null
          session_id: string | null
          artifact_id: string | null
          producer_actor_id: string | null
          artifact_exists: boolean
          link_exists: boolean
          artifact_workspace_id: string | null
          artifact_work_item_id: string | null
          artifact_session_id: string | null
          artifact_producer_actor_id: string | null
          artifact_provider_action_id: string | null
          link_project_id: string | null
          link_work_item_id: string | null
          link_session_id: string | null
          link_plan_step_id: string | null
          link_repository_id: string | null
          link_pull_request_id: string | null
        }>(
          `SELECT pr.id,pr.workspace_id,pr.repository_id,pr.work_item_id,pr.session_id,pr.artifact_id,pr.producer_actor_id,
                  a.id IS NOT NULL AS artifact_exists,al.artifact_id IS NOT NULL AS link_exists,
                  a.workspace_id AS artifact_workspace_id,a.work_item_id AS artifact_work_item_id,
                  a.session_id AS artifact_session_id,a.producer_actor_id AS artifact_producer_actor_id,
                  a.metadata->>'providerActionId' AS artifact_provider_action_id,
                  al.project_id AS link_project_id,al.work_item_id AS link_work_item_id,
                  al.session_id AS link_session_id,al.plan_step_id AS link_plan_step_id,
                  al.repository_id AS link_repository_id,al.pull_request_id AS link_pull_request_id
             FROM pull_request_projections pr
             LEFT JOIN artifacts a ON a.id=pr.artifact_id
             LEFT JOIN artifact_links al ON al.artifact_id=pr.artifact_id
            WHERE pr.repository_id=$1 AND pr.external_id=$2
            FOR UPDATE OF pr`,
          [action.repository_id, String(result.id)],
        )).rows[0]
        if (existing) {
          existingPullRequestId = existing.id
          const conflicts = [
            existing.workspace_id !== action.workspace_id,
            existing.repository_id !== action.repository_id,
            existing.work_item_id !== null && existing.work_item_id !== action.work_item_id,
            existing.session_id !== null && existing.session_id !== action.session_id,
            existing.producer_actor_id !== null && existing.producer_actor_id !== action.requested_by_actor_id,
            existing.artifact_id !== null && (!existing.artifact_exists || !existing.link_exists),
            existing.artifact_workspace_id !== null && existing.artifact_workspace_id !== action.workspace_id,
            existing.artifact_work_item_id !== null && existing.artifact_work_item_id !== action.work_item_id,
            existing.artifact_session_id !== null && existing.artifact_session_id !== action.session_id,
            existing.artifact_producer_actor_id !== null && existing.artifact_producer_actor_id !== action.requested_by_actor_id,
            existing.artifact_id !== null && existing.artifact_provider_action_id !== action.id,
            existing.link_project_id !== null && existing.link_project_id !== action.project_id,
            existing.link_work_item_id !== null && existing.link_work_item_id !== action.work_item_id,
            existing.link_session_id !== null && existing.link_session_id !== action.session_id,
            existing.link_plan_step_id !== null && existing.link_plan_step_id !== action.plan_step_id,
            existing.link_repository_id !== null && existing.link_repository_id !== action.repository_id,
            existing.link_pull_request_id !== null && existing.link_pull_request_id !== existing.id,
          ]
          if (conflicts.some(Boolean)) {
            const reason = 'PROVIDER_PULL_REQUEST_BINDING_CONFLICT'
            const rejected = await tx.query(
              `UPDATE provider_actions
                  SET status='dead',claimed_at=NULL,claimed_by=NULL,last_error=$3,result=$4,updated_at=now()
                WHERE id=$1 AND claimed_by=$2 AND status='claimed'
                RETURNING id`,
              [action.id, workerId, reason, result],
            )
            if (rejected.rowCount !== 1) throw new Error('PROVIDER_ACTION_CLAIM_LOST')
            await appendEvent(tx, {
              workspaceId: action.workspace_id, teamId: action.team_id, actorId: action.requested_by_actor_id,
              correlationId: `provider-action:${action.id}`, idempotencyKey: `${action.id}:dead`,
              type: 'provider.action.dead_lettered', aggregateType: 'provider_action', aggregateId: action.id,
              payload: { kind: action.kind, reason, providerPullRequestId: String(result.id) },
            })
            return
          }
          artifactId = existing.artifact_id
        }
      }
      const artifactType = action.kind === 'create_branch' ? 'branch' : action.kind === 'create_commit' ? 'commit' : action.kind === 'open_pull_request' ? 'pull_request' : null
      if (artifactType && !artifactId) {
        artifactId = (await tx.query<{ id: string }>(
          `INSERT INTO artifacts(workspace_id,session_id,work_item_id,producer_actor_id,type,title,uri,checksum,source_tool,repository,metadata)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,'provider-worker',$9,$10) RETURNING id`,
          [action.workspace_id, action.session_id, action.work_item_id, action.requested_by_actor_id, artifactType,
            `${artifactType} delivery`, typeof result.uri === 'string' ? result.uri : null, checksum(result),
            { provider: action.provider, repositoryId: action.repository_id, externalId: action.external_id },
            { ...result, providerActionId: action.id }],
        )).rows[0]!.id
        await tx.query(
          `INSERT INTO artifact_links(artifact_id,workspace_id,project_id,work_item_id,session_id,plan_step_id,repository_id,provenance)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [artifactId, action.workspace_id, action.project_id, action.work_item_id, action.session_id, action.plan_step_id, action.repository_id,
            { producerActorId: action.requested_by_actor_id, providerActionId: action.id, checksum: checksum(result) }],
        )
      }
      if (action.kind === 'create_commit') {
        await tx.query(
          'INSERT INTO commit_projections(repository_id,sha,branch) VALUES($1,$2,$3) ON CONFLICT(repository_id,sha) DO NOTHING',
          [action.repository_id, result.sha, result.branch],
        )
      }
      if (action.kind === 'open_pull_request') {
        const pullRequest = await tx.query<{ id: string }>(
          `INSERT INTO pull_request_projections(workspace_id,repository_id,external_id,number,uri,work_item_id,session_id,artifact_id,producer_actor_id,base_branch,head_branch,base_sha,head_sha,state,draft)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT(repository_id,external_id) DO UPDATE SET
             uri=COALESCE(pull_request_projections.uri,EXCLUDED.uri),
             work_item_id=COALESCE(pull_request_projections.work_item_id,EXCLUDED.work_item_id),
             session_id=COALESCE(pull_request_projections.session_id,EXCLUDED.session_id),
             artifact_id=COALESCE(pull_request_projections.artifact_id,EXCLUDED.artifact_id),
             producer_actor_id=COALESCE(pull_request_projections.producer_actor_id,EXCLUDED.producer_actor_id),
             number=CASE WHEN pull_request_projections.provider_observed_at IS NULL THEN EXCLUDED.number ELSE pull_request_projections.number END,
             base_branch=CASE WHEN pull_request_projections.provider_observed_at IS NULL THEN EXCLUDED.base_branch ELSE pull_request_projections.base_branch END,
             head_branch=CASE WHEN pull_request_projections.provider_observed_at IS NULL THEN EXCLUDED.head_branch ELSE pull_request_projections.head_branch END,
             base_sha=CASE WHEN pull_request_projections.provider_observed_at IS NULL THEN EXCLUDED.base_sha ELSE pull_request_projections.base_sha END,
             head_sha=CASE WHEN pull_request_projections.provider_observed_at IS NULL THEN EXCLUDED.head_sha ELSE pull_request_projections.head_sha END,
             state=CASE WHEN pull_request_projections.provider_observed_at IS NULL THEN EXCLUDED.state ELSE pull_request_projections.state END,
             draft=CASE WHEN pull_request_projections.provider_observed_at IS NULL THEN EXCLUDED.draft ELSE pull_request_projections.draft END,
             revision=pull_request_projections.revision+1,updated_at=now()
           RETURNING id`,
          [action.workspace_id, action.repository_id, result.id, result.number, result.uri, action.work_item_id, action.session_id,
            artifactId, action.requested_by_actor_id, result.baseBranch, result.headBranch, result.baseSha, result.headSha, result.state, result.draft],
        )
        if (existingPullRequestId && pullRequest.rows[0]!.id !== existingPullRequestId)
          throw new Error('PROVIDER_PULL_REQUEST_RECONCILIATION_ID_CHANGED')
        if (artifactId)
          await tx.query(
            `UPDATE artifact_links SET
               project_id=COALESCE(project_id,$3),work_item_id=$4,session_id=$5,
               plan_step_id=COALESCE(plan_step_id,$6),repository_id=COALESCE(repository_id,$7),
               pull_request_id=$2
             WHERE artifact_id=$1`,
            [artifactId, pullRequest.rows[0]!.id, action.project_id, action.work_item_id,
              action.session_id, action.plan_step_id, action.repository_id],
          )
      }
      if (action.kind === 'merge_pull_request') {
        const consumed = await tx.query(
          `UPDATE approvals SET status='consumed',consumed_at=now(),revision=revision+1,updated_at=now()
           WHERE id=$1 AND status='approved' RETURNING id`,
          [action.approval_id],
        )
        if (!consumed.rowCount) throw new Error('MERGE_APPROVAL_NOT_CONSUMABLE')
        await tx.query(
          "UPDATE pull_request_projections SET state='merged',revision=revision+1,updated_at=now() WHERE repository_id=$1 AND external_id=$2 AND head_sha=$3",
          [action.repository_id, action.payload.pullRequestId, action.expected_head_sha],
        )
      }
      if (action.kind === 'retry_ci_check') {
        const consumed = await tx.query(
          `UPDATE approvals SET status='consumed',consumed_at=now(),revision=revision+1,updated_at=now()
            WHERE id=$1 AND status='approved' RETURNING id`,
          [action.approval_id],
        )
        if (!consumed.rowCount) throw new Error('CI_RETRY_APPROVAL_NOT_CONSUMABLE')
      }
      await tx.query(
        "UPDATE provider_actions SET status='completed',result=$3,completed_at=now(),claimed_at=NULL,claimed_by=NULL,updated_at=now() WHERE id=$1 AND claimed_by=$2",
        [action.id, workerId, result],
      )
      await appendEvent(tx, {
        workspaceId: action.workspace_id, teamId: action.team_id, actorId: action.requested_by_actor_id,
        correlationId: `provider-action:${action.id}`, idempotencyKey: action.id,
        type: action.kind === 'merge_pull_request'
          ? 'pull_request.merged'
          : action.kind === 'retry_ci_check'
            ? 'ci.check.retry_requested_at_provider'
            : 'provider.action.completed',
        aggregateType: 'provider_action', aggregateId: action.id,
        payload: { kind: action.kind, result, artifactId },
      })
      if (action.kind === 'merge_pull_request') {
        await tx.query(
          `INSERT INTO completion_suggestions(workspace_id,project_id,work_item_id,pull_request_id,suggested_by_actor_id,rationale,evidence_artifact_ids)
           SELECT $1,w.project_id,$2,pr.id,$3,'Pull request merged; a human may transition the work item.',CASE WHEN $4::uuid IS NULL THEN '{}'::uuid[] ELSE ARRAY[$4::uuid] END
             FROM work_items w JOIN pull_request_projections pr ON pr.repository_id=$5 AND pr.external_id=$6
            WHERE w.id=$2 AND w.project_id IS NOT NULL
           ON CONFLICT DO NOTHING`,
          [action.workspace_id, action.work_item_id, action.requested_by_actor_id, artifactId, action.repository_id, action.payload.pullRequestId],
        )
      }
    })
  }

  const executeAction = async (action: ClaimedAction): Promise<void> => {
    if (process.env.PROVIDER_INJECT_FAILURE_AFTER_CLAIM === 'true') throw new Error('PROVIDER_INJECTED_FAILURE_AFTER_CLAIM')
    if (action.result) {
      if (!await revalidateClaimedProvider(action)) return
      await finishAction(action, action.result)
      return
    }
    const common = {
      provider: action.provider,
      connectionId: action.connection_id,
      repositoryId: action.external_id,
      repositoryFullName: action.full_name,
    }
    let result: Record<string, unknown>
    if (action.kind === 'resolve_repository_context') {
      if (!await authorizeRepositoryContextResolution(action)) return
      const payload = action.payload as { baseSha: string; allowedPaths: string[] }
      const provider = await input.resolveProvider(action.provider, action.connection_id)
      const guidance = await provider.resolveRepositoryGuidance({
        ...common,
        commitSha: payload.baseSha,
        scopedPaths: payload.allowedPaths,
      })
      result = { guidance }
    } else if (action.kind === 'retry_ci_check') {
      if (!await authorizeProviderSideEffect(action)) return
      const payload = action.payload as {
        provider: ProviderKind
        connectionId: string
        repositoryId: string
        pullRequestId: string
        checkRunId: string
        headSha: string
      }
      await revalidateCiRetryExecution(action, payload)
      const provider = await input.resolveProvider(action.provider, action.connection_id)
      result = await provider.retryCheck({ ...common, checkRunId: payload.checkRunId })
    } else if (action.kind === 'merge_pull_request') {
      if (!await authorizeProviderSideEffect(action)) return
      const payload = action.payload as { pullRequestId: string; headSha: string; method: 'merge' | 'squash' | 'rebase' }
      const provider = await input.resolveProvider(action.provider, action.connection_id)
      const live = await provider.getPullRequest({ ...common, pullRequestId: payload.pullRequestId })
      if (live.headSha !== payload.headSha) {
        await invalidateMergeForLiveHeadMismatch(action, live.headSha)
        return
      }
      if (live.state === 'merged') {
        if (!live.mergeSha) throw new Error('PROVIDER_MERGE_SHA_MISSING')
        await revalidateMergeExecution(action, payload, true)
        result = { merged: true, mergeSha: live.mergeSha }
      } else {
        if (live.state !== 'open') throw new Error('PROVIDER_PULL_REQUEST_NOT_OPEN')
        const expiresAt = await revalidateMergeExecution(action, payload)
        if (!expiresAt) return
        if (expiresAt.getTime() <= Date.now()) {
          await expireMergeApproval(action)
          return
        }
        result = await provider.mergePullRequest({
          ...common,
          pullRequestId: payload.pullRequestId,
          expectedHeadSha: payload.headSha,
          method: payload.method,
        })
      }
    } else {
      if (!await authorizeProviderSideEffect(action)) return
      const provider = await input.resolveProvider(action.provider, action.connection_id)
      if (action.kind === 'create_branch') {
        const payload = action.payload as { name: string; baseSha: string }
        const seedable = provider as GitProvider & {
          seedRepository?: (connectionId: string, repositoryId: string, defaultBranch: string, headSha: string) => void
        }
        seedable.seedRepository?.(action.connection_id, action.external_id, action.default_branch, payload.baseSha)
        result = await provider.createBranch({ ...common, name: payload.name, baseSha: payload.baseSha })
      } else if (action.kind === 'create_commit') {
        const payload = action.payload as { branch: string; expectedHeadSha: string; message: string; files: Array<{ path: string; content: string }> }
        result = await provider.createCommit({
          ...common,
          idempotencyKey: action.id,
          branch: payload.branch,
          expectedHeadSha: payload.expectedHeadSha,
          message: payload.message,
          files: payload.files,
        })
      } else {
        const payload = action.payload as { baseBranch: string; headBranch: string; title: string; body: string; draft: boolean }
        result = await provider.openPullRequest({
          ...common,
          idempotencyKey: action.id,
          baseBranch: payload.baseBranch,
          headBranch: payload.headBranch,
          title: payload.title,
          body: payload.body,
          draft: payload.draft,
        })
      }
    }
    if (process.env.PROVIDER_INJECT_FAILURE_AFTER_PROVIDER_SUCCESS === 'true')
      throw new Error('PROVIDER_INJECTED_FAILURE_AFTER_PROVIDER_SUCCESS')
    await checkpointProviderResult(action, result)
    if (process.env.PROVIDER_INJECT_FAILURE_AFTER_RESULT_CHECKPOINT === 'true')
      throw new Error('PROVIDER_INJECTED_FAILURE_AFTER_RESULT_CHECKPOINT')
    await finishAction(action, result)
  }

  const claimWebhook = (): Promise<ClaimedWebhook | undefined> => withTx(input.db, async tx => {
    const result = await tx.query<ClaimedWebhook>(
      `WITH candidate AS (
         SELECT d.id,c.workspace_id,c.service_actor_id,r.team_id
           FROM provider_webhook_deliveries d
           JOIN provider_connections c ON c.id=d.connection_id
           LEFT JOIN repositories r ON r.id=d.repository_id
          WHERE d.attempt_count < 12 AND d.available_at<=now()
            AND c.provider::text=ANY($2::text[])
            AND (d.status='received' OR (d.status='claimed' AND d.claimed_at<now()-interval '60 seconds'))
          ORDER BY d.available_at,d.created_at FOR UPDATE OF d SKIP LOCKED LIMIT 1
       )
       UPDATE provider_webhook_deliveries d SET status='claimed',claimed_at=now(),claimed_by=$1,
         attempt_count=d.attempt_count+1,updated_at=now()
       FROM candidate
       WHERE d.id=candidate.id
       RETURNING d.*,candidate.workspace_id,candidate.service_actor_id,candidate.team_id`,
      [workerId, allowedProviders],
    )
    return result.rows[0]
  })

  const finishWebhook = async (delivery: ClaimedWebhook): Promise<void> => {
    await withTx(input.db, async tx => {
      const claim = await tx.query(
        `SELECT 1 FROM provider_webhook_deliveries delivery
          JOIN provider_connections connection ON connection.id=delivery.connection_id
         WHERE delivery.id=$1 AND delivery.status='claimed' AND delivery.claimed_by=$2
           AND connection.provider::text=ANY($3::text[])
         FOR UPDATE OF delivery`,
        [delivery.id, workerId, allowedProviders],
      )
      // A reclaimed delivery belongs exclusively to the new worker. The stale
      // worker must not touch provider projections, approvals, events or outbox.
      if (!claim.rowCount) return
      const event = normalizeGitHubWebhook(delivery.event_name, delivery.payload)
      if (event && !delivery.repository_id) throw new Error('WEBHOOK_REPOSITORY_NOT_MAPPED')
      if (event?.kind === 'pull_request') {
        const existing = (await tx.query<{
          id: string
          head_sha: string
          provider_observed_at: Date | null
          provider_observation_rank: number
        }>(
          `SELECT id,head_sha,provider_observed_at,provider_observation_rank
             FROM pull_request_projections
            WHERE repository_id=$1 AND external_id=$2 FOR UPDATE`,
          [delivery.repository_id, event.externalId],
        )).rows[0]
        if (isNewerObservation(event.observedAt, event.observationRank, existing)) {
          const projected = one((await tx.query<{ id: string }>(
            `INSERT INTO pull_request_projections(
               workspace_id,repository_id,external_id,number,uri,base_branch,head_branch,base_sha,head_sha,
               state,draft,source_delivery_id,provider_observed_at,provider_observation_rank)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT(repository_id,external_id) DO UPDATE SET number=EXCLUDED.number,uri=EXCLUDED.uri,
              base_branch=EXCLUDED.base_branch,head_branch=EXCLUDED.head_branch,base_sha=EXCLUDED.base_sha,
              head_sha=EXCLUDED.head_sha,state=EXCLUDED.state,draft=EXCLUDED.draft,
              source_delivery_id=EXCLUDED.source_delivery_id,
              provider_observed_at=EXCLUDED.provider_observed_at,
              provider_observation_rank=EXCLUDED.provider_observation_rank,
              revision=pull_request_projections.revision+1,updated_at=now() RETURNING id`,
            [delivery.workspace_id, delivery.repository_id, event.externalId, event.number, event.uri,
              event.baseBranch, event.headBranch, event.baseSha, event.headSha, event.state, event.draft,
              delivery.id, event.observedAt, event.observationRank],
          )).rows)
          if (existing && existing.head_sha !== event.headSha) {
            const invalidated = await tx.query<{ approval_id: string }>(
              `UPDATE merge_approval_bindings SET invalidated_at=now(),invalidation_reason='pull request head changed'
               WHERE pull_request_id=$1 AND head_sha<>$2 AND invalidated_at IS NULL RETURNING approval_id`,
              [projected.id, event.headSha],
            )
            if (invalidated.rowCount)
              await tx.query("UPDATE approvals SET status='canceled',revision=revision+1,updated_at=now() WHERE id=ANY($1::uuid[]) AND status IN ('pending','approved')", [invalidated.rows.map(row => row.approval_id)])
          }
        }
      } else if (event?.kind === 'push') {
        await tx.query(
          `INSERT INTO commit_projections(repository_id,sha,branch,before_sha,source_delivery_id)
           VALUES($1,$2,$3,$4,$5) ON CONFLICT(repository_id,sha) DO NOTHING`,
          [delivery.repository_id, event.afterSha, event.branch, event.beforeSha, delivery.id],
        )
      } else if (event?.kind === 'check') {
        const pr = (await tx.query<{ id: string; head_sha: string; required_checks: string[] }>(
          `SELECT pr.id,pr.head_sha,r.required_checks FROM pull_request_projections pr JOIN repositories r ON r.id=pr.repository_id
            WHERE pr.repository_id=$1
              AND (($2::int IS NOT NULL AND pr.number=$2) OR ($2::int IS NULL AND pr.head_sha=$3))
            ORDER BY pr.updated_at DESC LIMIT 1`,
          [delivery.repository_id, event.pullRequestNumber ?? null, event.headSha],
        )).rows[0]
        if (!pr) throw new Error('PROVIDER_PREREQUISITE_PULL_REQUEST_MISSING')
        if (pr.head_sha === event.headSha) {
          const existing = (await tx.query<{
            provider_observed_at: Date | null
            provider_observation_rank: number
          }>(
            `SELECT provider_observed_at,provider_observation_rank FROM ci_check_projections
              WHERE pull_request_id=$1 AND external_id=$2 FOR UPDATE`,
            [pr.id, event.externalId],
          )).rows[0]
          if (isNewerObservation(event.observedAt, event.observationRank, existing))
            await tx.query(
              `INSERT INTO ci_check_projections(
                 pull_request_id,external_id,name,status,required,head_sha,details_url,completed_at,
                 source_delivery_id,provider_observed_at,provider_observation_rank)
               VALUES($1,$2,$3,$4::normalized_check_status,$5,$6,$7,
                 CASE WHEN $4::text IN ('passed','failed','skipped') THEN $9::timestamptz END,$8,$9,$10)
               ON CONFLICT(pull_request_id,external_id) DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status,
                 required=EXCLUDED.required,head_sha=EXCLUDED.head_sha,details_url=EXCLUDED.details_url,
                 completed_at=EXCLUDED.completed_at,source_delivery_id=EXCLUDED.source_delivery_id,
                 provider_observed_at=EXCLUDED.provider_observed_at,
                 provider_observation_rank=EXCLUDED.provider_observation_rank,updated_at=now()`,
              [pr.id, event.externalId, event.name, normalizeProviderCheck(event.status, event.conclusion),
                pr.required_checks.includes(event.name), event.headSha, event.uri ?? null, delivery.id,
                event.observedAt, event.observationRank],
            )
        }
      } else if (event?.kind === 'review') {
        if (!event.authorExternalId) throw new Error('PROVIDER_REVIEW_AUTHOR_MISSING')
        const pr = (await tx.query<{ id: string; head_sha: string }>(
          `SELECT id,head_sha FROM pull_request_projections
            WHERE repository_id=$1 AND number=$2 ORDER BY updated_at DESC LIMIT 1`,
          [delivery.repository_id, event.pullRequestNumber],
        )).rows[0]
        if (!pr) throw new Error('PROVIDER_PREREQUISITE_PULL_REQUEST_MISSING')
        if (pr.head_sha === event.headSha) {
          const existing = (await tx.query<{
            provider_observed_at: Date | null
            provider_observation_rank: number
          }>(
            `SELECT provider_observed_at,provider_observation_rank FROM provider_review_projections
              WHERE repository_id=$1 AND external_id=$2 FOR UPDATE`,
            [delivery.repository_id, event.externalId],
          )).rows[0]
          if (isNewerObservation(event.observedAt, event.observationRank, existing))
            await tx.query(
              `INSERT INTO provider_review_projections(
                 workspace_id,repository_id,pull_request_id,external_id,state,head_sha,
                 author_external_id,author_login,uri,source_delivery_id,
                 provider_observed_at,provider_observation_rank)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
               ON CONFLICT(repository_id,external_id) DO UPDATE SET
                 pull_request_id=EXCLUDED.pull_request_id,state=EXCLUDED.state,head_sha=EXCLUDED.head_sha,
                 author_external_id=EXCLUDED.author_external_id,author_login=EXCLUDED.author_login,
                 uri=EXCLUDED.uri,source_delivery_id=EXCLUDED.source_delivery_id,
                 provider_observed_at=EXCLUDED.provider_observed_at,
                 provider_observation_rank=EXCLUDED.provider_observation_rank,updated_at=now()`,
              [delivery.workspace_id, delivery.repository_id, pr.id, event.externalId, event.state,
                event.headSha, event.authorExternalId, event.authorLogin ?? null, event.uri ?? null,
                delivery.id, event.observedAt, event.observationRank],
            )
        }
      }
      const terminal = await tx.query(
        `UPDATE provider_webhook_deliveries
            SET status='processed',processed_at=now(),claimed_at=NULL,claimed_by=NULL,updated_at=now()
          WHERE id=$1 AND claimed_by=$2 AND status='claimed'
          RETURNING id`,
        [delivery.id, workerId],
      )
      if (terminal.rowCount !== 1) throw new Error('PROVIDER_WEBHOOK_CLAIM_LOST')
      await appendEvent(tx, {
        workspaceId: delivery.workspace_id, teamId: delivery.team_id ?? undefined,
        actorId: delivery.service_actor_id, correlationId: `provider-webhook:${delivery.id}`,
        idempotencyKey: delivery.id, type: 'provider.webhook.processed',
        aggregateType: 'provider_webhook_delivery', aggregateId: delivery.id,
        payload: { eventName: delivery.event_name, normalizedKind: event?.kind ?? null },
      })
    })
  }

  const failWebhook = async (delivery: ClaimedWebhook, error: unknown): Promise<void> => {
    await withTx(input.db, async tx => {
      const current = (await tx.query<{ attempt_count: number }>(
        "SELECT attempt_count FROM provider_webhook_deliveries WHERE id=$1 AND claimed_by=$2 AND status='claimed' FOR UPDATE",
        [delivery.id, workerId],
      )).rows[0]
      if (!current) return
      const terminal = current.attempt_count >= 12
      const reason = errorText(error)
      await tx.query(
        `UPDATE provider_webhook_deliveries SET status=$2,claimed_at=NULL,claimed_by=NULL,last_error=$3,
         available_at=now()+(LEAST(300,5*POWER(2,GREATEST(0,$4-1)))::text||' seconds')::interval,updated_at=now()
         WHERE id=$1 AND claimed_by=$5 AND status='claimed'`,
        [delivery.id, terminal ? 'dead' : 'received', reason, current.attempt_count, workerId],
      )
      if (!terminal) return
      if (process.env.PROVIDER_INJECT_FAILURE_AFTER_TERMINAL_UPDATE === 'true') throw new Error('PROVIDER_INJECTED_TERMINAL_ROLLBACK')
      await appendEvent(tx, {
        workspaceId: delivery.workspace_id, teamId: delivery.team_id ?? undefined,
        actorId: delivery.service_actor_id, correlationId: `provider-webhook:${delivery.id}`,
        idempotencyKey: `${delivery.id}:dead`, type: 'provider.webhook.dead_lettered',
        aggregateType: 'provider_webhook_delivery', aggregateId: delivery.id,
        payload: { eventName: delivery.event_name, reason },
      })
    })
  }

  const tick = async (): Promise<void> => {
    const action = await claimAction()
    if (action) {
      try { await executeAction(action) } catch (error) { await failAction(action, error) }
    }
    const webhook = await claimWebhook()
    if (webhook) {
      try { await finishWebhook(webhook) } catch (error) { await failWebhook(webhook, error) }
    }
  }

  return { claimAction, executeAction, failAction, claimWebhook, finishWebhook, failWebhook, tick }
}
