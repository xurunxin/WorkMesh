import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '@workmesh/db'
import { FakeGitProvider, type GitProvider } from '@workmesh/git-provider'
import { createProviderActionWorker } from '../src/provider-actions.js'
import { createArtifactUploadWorker } from '../src/artifact-uploads.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Stage 3 worker integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Stage 3 worker integration requires a dedicated *test* database.')
const db = createDb(databaseUrl)
const fake = new FakeGitProvider()
type Fixture = { workspaceId: string; connectionId: string; repositoryId: string; teamId: string }
type OpenPullRequestFixture = Fixture & {
  humanId: string
  projectId: string
  workItemId: string
  sessionId: string
  agentActorId: string
  agentId: string
  delegationId: string
  planStepId: string
  actionId: string
}

async function fixture(): Promise<Fixture> {
  const workspaceId = (await db.query<{ id: string }>("INSERT INTO workspaces(name,slug) VALUES('Worker Stage 3',$1) RETURNING id", [`worker-${randomUUID()}`])).rows[0]!.id
  const serviceActorId = (await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'service','Provider service') RETURNING id", [workspaceId])).rows[0]!.id
  const teamId = (await db.query<{ id: string }>("INSERT INTO teams(workspace_id,name,key) VALUES($1,'Delivery','DEL') RETURNING id", [workspaceId])).rows[0]!.id
  const connectionId = (await db.query<{ id: string }>(
    "INSERT INTO provider_connections(workspace_id,provider,external_account_id,display_name,installation_id,service_actor_id,webhook_secret_ciphertext,credentials_ciphertext) VALUES($1,'github','42','GitHub','42',$2,$3,$4) RETURNING id",
    [workspaceId, serviceActorId, Buffer.from('encrypted'), Buffer.from('encrypted-credentials')],
  )).rows[0]!.id
  const repositoryId = (await db.query<{ id: string }>(
    "INSERT INTO repositories(workspace_id,connection_id,team_id,external_id,full_name,default_branch) VALUES($1,$2,$3,'9001','acme/workmesh','main') RETURNING id",
    [workspaceId, connectionId, teamId],
  )).rows[0]!.id
  return { workspaceId, connectionId, repositoryId, teamId }
}

async function openPullRequestFixture(f: Fixture): Promise<OpenPullRequestFixture> {
  const humanId = (await db.query<{ id: string }>(
    "INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,'human','admin',$2,'Human','hash') RETURNING id",
    [f.workspaceId, `${randomUUID()}@example.test`],
  )).rows[0]!.id
  const agentActorId = (await db.query<{ id: string }>(
    "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Agent') RETURNING id",
    [f.workspaceId],
  )).rows[0]!.id
  const projectId = (await db.query<{ id: string }>(
    "INSERT INTO projects(workspace_id,team_id,name) VALUES($1,$2,'Provider recovery') RETURNING id",
    [f.workspaceId, f.teamId],
  )).rows[0]!.id
  const stateId = (await db.query<{ id: string }>(
    "INSERT INTO workflow_states(workspace_id,team_id,name,category) VALUES($1,$2,'Ready','planned') RETURNING id",
    [f.workspaceId, f.teamId],
  )).rows[0]!.id
  const workItemId = (await db.query<{ id: string }>(
    `INSERT INTO work_items(workspace_id,team_id,project_id,number,title,status_id,responsible_human_actor_id)
     VALUES($1,$2,$3,1,'Webhook-first PR recovery',$4,$5) RETURNING id`,
    [f.workspaceId, f.teamId, projectId, stateId, humanId],
  )).rows[0]!.id
  const capabilities = ['artifact:write', 'repo:read', 'repo:write_branch', 'repo:open_pr', 'repo:merge']
  const agentId = (await db.query<{ id: string }>(
    `INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,requested_capabilities,approved_capabilities)
     VALUES($1,$2,$3,'Agent',$4,$4) RETURNING id`,
    [f.workspaceId, agentActorId, `recover-${randomUUID()}`, capabilities],
  )).rows[0]!.id
  const delegationId = (await db.query<{ id: string }>(
    `INSERT INTO delegations(
       workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,
       role,scope_type,scope_id,permissions_snapshot,capability_scope)
     VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6,$7,$8) RETURNING id`,
    [f.workspaceId, f.teamId, agentId, agentActorId, humanId, workItemId, capabilities,
      {
        workspaceId: f.workspaceId,
        teamIds: [f.teamId],
        projectIds: [projectId],
        workItemIds: [workItemId],
        repositoryIds: [f.repositoryId],
      }],
  )).rows[0]!.id
  await db.query(
    `INSERT INTO agent_team_access(
       workspace_id,agent_id,team_id,granted_by_actor_id,approved_capabilities
     ) VALUES($1,$2,$3,$4,$5)`,
    [f.workspaceId, agentId, f.teamId, humanId, capabilities],
  )
  const sessionId = (await db.query<{ id: string }>(
    `INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state)
     VALUES($1,$2,$3,$4,$5,$6,'executing') RETURNING id`,
    [f.workspaceId, f.teamId, agentId, agentActorId, delegationId, workItemId],
  )).rows[0]!.id
  const planStepId = randomUUID()
  const planVersionId = (await db.query<{ id: string }>(
    `INSERT INTO agent_plan_versions(session_id,revision,change_summary,author_actor_id)
     VALUES($1,1,'Provider recovery plan',$2) RETURNING id`,
    [sessionId, agentActorId],
  )).rows[0]!.id
  await db.query(
    `INSERT INTO agent_plan_steps(plan_version_id,id,title,ordinal)
     VALUES($1,$2,'Deliver provider change',0)`,
    [planVersionId, planStepId],
  )
  await db.query(
    'UPDATE agent_sessions SET current_plan_version_id=$2 WHERE id=$1',
    [sessionId, planVersionId],
  )
  await db.query(
    `INSERT INTO repository_contexts(
       workspace_id,repository_id,work_item_id,base_branch,base_sha,branch_pattern,
       allowed_paths,permissions,guidance_manifest_hash,created_by_actor_id
     ) VALUES($1,$2,$3,'main','base','workmesh/{workItemKey}-{slug}',
       $4,$5,$6,$7)`,
    [
      f.workspaceId,
      f.repositoryId,
      workItemId,
      ['apps/**'],
      ['read', 'write_branch', 'open_pr', 'merge'],
      `sha256:${'c'.repeat(64)}`,
      humanId,
    ],
  )
  const actionId = (await db.query<{ id: string }>(
    `INSERT INTO provider_actions(
       workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,
       project_id,plan_step_id,kind,intent_key,payload)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'open_pull_request',$9,$10) RETURNING id`,
    [f.workspaceId, f.connectionId, f.repositoryId, agentActorId, sessionId, workItemId,
      projectId, planStepId, randomUUID(), {
        baseBranch: 'main',
        headBranch: 'workmesh/DEL-1-recovery',
        title: 'Recover provider-only PR',
        body: 'Evidence',
        draft: false,
      }],
  )).rows[0]!.id
  return {
    ...f,
    humanId,
    projectId,
    workItemId,
    sessionId,
    agentActorId,
    agentId,
    delegationId,
    planStepId,
    actionId,
  }
}

function numericPullRequestProvider(provider: FakeGitProvider): GitProvider {
  const providerId = (pullRequestId: string): string =>
    pullRequestId.startsWith('fake-pr-') ? pullRequestId : `fake-pr-${pullRequestId}`
  return {
    createBranch: request => provider.createBranch(request),
    createCommit: request => provider.createCommit(request),
    openPullRequest: async request => {
      const result = await provider.openPullRequest(request)
      return { ...result, id: String(result.number) }
    },
    getPullRequest: async request => {
      const result = await provider.getPullRequest({ ...request, pullRequestId: providerId(request.pullRequestId) })
      return { ...result, id: String(result.number) }
    },
    mergePullRequest: async request => {
      return provider.mergePullRequest({ ...request, pullRequestId: providerId(request.pullRequestId) })
    },
    resolveRepositoryGuidance: request => provider.resolveRepositoryGuidance(request),
    retryCheck: request => provider.retryCheck(request),
  }
}

function observeProviderMerges(provider: FakeGitProvider): {
  provider: GitProvider
  mergeCalls: () => number
} {
  let calls = 0
  return {
    provider: {
      createBranch: request => provider.createBranch(request),
      createCommit: request => provider.createCommit(request),
      openPullRequest: request => provider.openPullRequest(request),
      getPullRequest: request => provider.getPullRequest(request),
      mergePullRequest: request => {
        calls += 1
        return provider.mergePullRequest(request)
      },
      resolveRepositoryGuidance: request => provider.resolveRepositoryGuidance(request),
      retryCheck: request => provider.retryCheck(request),
    },
    mergeCalls: () => calls,
  }
}

function observeProviderMutations(provider: FakeGitProvider): {
  provider: GitProvider
  calls: () => { branch: number; commit: number; open: number; merge: number }
} {
  const calls = { branch: 0, commit: 0, open: 0, merge: 0 }
  return {
    provider: {
      createBranch: request => {
        calls.branch += 1
        return provider.createBranch(request)
      },
      createCommit: request => {
        calls.commit += 1
        return provider.createCommit(request)
      },
      openPullRequest: request => {
        calls.open += 1
        return provider.openPullRequest(request)
      },
      getPullRequest: request => provider.getPullRequest(request),
      mergePullRequest: request => {
        calls.merge += 1
        return provider.mergePullRequest(request)
      },
      resolveRepositoryGuidance: request => provider.resolveRepositoryGuidance(request),
      retryCheck: request => provider.retryCheck(request),
    },
    calls: () => ({ ...calls }),
  }
}

describe('Stage 3 provider webhook worker', () => {
  beforeAll(async () => { await applyMigrations(db) })
  beforeEach(async () => { await db.query('TRUNCATE workspaces CASCADE') })
  afterAll(async () => { await db.end() })

  it('makes duplicate commit webhooks a single projection effect', async () => {
    const f = await fixture()
    const payload = { ref: 'refs/heads/main', before: 'old', after: 'new', repository: { id: 9001 } }
    await db.query(
      `INSERT INTO provider_webhook_deliveries(connection_id,repository_id,delivery_id,event_name,body_hash,payload)
       VALUES($1,$2,'one','push',$3,$4),($1,$2,'two','push',$3,$4)`,
      [f.connectionId, f.repositoryId, `sha256:${'a'.repeat(64)}`, payload],
    )
    const worker = createProviderActionWorker({ db, resolveProvider: () => fake, workerId: 'stage3-worker' })
    await worker.tick()
    await worker.tick()
    expect((await db.query('SELECT 1 FROM commit_projections WHERE repository_id=$1 AND sha=$2', [f.repositoryId, 'new'])).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM provider_webhook_deliveries WHERE connection_id=$1 AND status='processed'", [f.connectionId])).rowCount).toBe(2)
  })

  it('recovers a stale webhook claim after a worker dies', async () => {
    const f = await fixture()
    await db.query(
      `INSERT INTO provider_webhook_deliveries(connection_id,repository_id,delivery_id,event_name,body_hash,payload)
       VALUES($1,$2,'recover','push',$3,$4)`,
      [f.connectionId, f.repositoryId, `sha256:${'b'.repeat(64)}`, { ref: 'refs/heads/main', before: 'a', after: 'b' }],
    )
    const first = createProviderActionWorker({ db, resolveProvider: () => fake, workerId: 'dead-worker' })
    const staleClaim = await first.claimWebhook()
    expect(staleClaim?.id).toBeTruthy()
    await db.query("UPDATE provider_webhook_deliveries SET claimed_at=now()-interval '2 minutes' WHERE delivery_id='recover'")
    const recovered = createProviderActionWorker({ db, resolveProvider: () => fake, workerId: 'recovery-worker' })
    const claim = await recovered.claimWebhook()
    expect(claim?.attempt_count).toBe(2)
    await first.finishWebhook(staleClaim!)
    expect((await db.query("SELECT status,claimed_by FROM provider_webhook_deliveries WHERE delivery_id='recover'")).rows[0])
      .toEqual({ status: 'claimed', claimed_by: 'recovery-worker' })
    expect((await db.query("SELECT 1 FROM commit_projections WHERE repository_id=$1 AND sha='b'", [f.repositoryId])).rowCount).toBe(0)
    expect((await db.query(
      "SELECT 1 FROM domain_events WHERE aggregate_id=$1 AND event_type='provider.webhook.processed'",
      [claim!.id],
    )).rowCount).toBe(0)
    await recovered.finishWebhook(claim!)
    expect((await db.query("SELECT status FROM provider_webhook_deliveries WHERE delivery_id='recover'")).rows[0]).toEqual({ status: 'processed' })
    expect((await db.query("SELECT 1 FROM commit_projections WHERE repository_id=$1 AND sha='b'", [f.repositoryId])).rowCount).toBe(1)
    expect((await db.query(
      "SELECT 1 FROM domain_events WHERE aggregate_id=$1 AND event_type='provider.webhook.processed'",
      [claim!.id],
    )).rowCount).toBe(1)
  })

  it('does not claim or effect webhook deliveries from a disabled provider', async () => {
    const f = await fixture()
    const deliveryId = (await db.query<{ id: string }>(
      `INSERT INTO provider_webhook_deliveries(
         connection_id,repository_id,delivery_id,event_name,body_hash,payload
       ) VALUES($1,$2,$3,'push',$4,$5) RETURNING id`,
      [
        f.connectionId,
        f.repositoryId,
        `disabled-${randomUUID()}`,
        `sha256:${'d'.repeat(64)}`,
        { ref: 'refs/heads/main', before: 'before', after: 'after-disabled' },
      ],
    )).rows[0]!.id
    await db.query("UPDATE provider_connections SET provider='gitea' WHERE id=$1", [f.connectionId])
    const disabled = createProviderActionWorker({
      db,
      resolveProvider: () => fake,
      workerId: 'disabled-gitea-webhook',
      allowedProviders: ['fake', 'github'],
    })
    await expect(disabled.claimWebhook()).resolves.toBeUndefined()
    expect((await db.query<{ status: string; attempt_count: number }>(
      'SELECT status,attempt_count FROM provider_webhook_deliveries WHERE id=$1',
      [deliveryId],
    )).rows[0]).toEqual({ status: 'received', attempt_count: 0 })

    await db.query("UPDATE provider_connections SET provider='github' WHERE id=$1", [f.connectionId])
    const claimed = await disabled.claimWebhook()
    expect(claimed?.id).toBe(deliveryId)
    await db.query("UPDATE provider_connections SET provider='gitea' WHERE id=$1", [f.connectionId])
    await disabled.finishWebhook(claimed!)
    expect((await db.query<{ status: string }>(
      'SELECT status FROM provider_webhook_deliveries WHERE id=$1',
      [deliveryId],
    )).rows[0]).toEqual({ status: 'claimed' })
    expect((await db.query(
      "SELECT 1 FROM commit_projections WHERE repository_id=$1 AND sha='after-disabled'",
      [f.repositoryId],
    )).rowCount).toBe(0)
    expect((await db.query(
      "SELECT 1 FROM domain_events WHERE aggregate_id=$1 AND event_type='provider.webhook.processed'",
      [deliveryId],
    )).rowCount).toBe(0)
  })

  it('revalidates the provider allowlist before every provider access and recovers released actions', async () => {
    const f = await openPullRequestFixture(await fixture())
    await db.query("UPDATE provider_actions SET status='completed' WHERE id=$1", [f.actionId])
    const providerState = new FakeGitProvider()
    providerState.seedRepositoryFiles(f.connectionId, '9001', 'base', {})
    let resolverCalls = 0
    const worker = createProviderActionWorker({
      db,
      resolveProvider: () => {
        resolverCalls += 1
        return providerState
      },
      workerId: 'effect-time-provider-gate',
      allowedProviders: ['fake', 'github'],
    })
    const expectReleased = async (actionId: string): Promise<void> => {
      expect((await db.query<{
        status: string
        attempt_count: number
        claimed_by: string | null
        last_error: string | null
      }>(
        'SELECT status,attempt_count,claimed_by,last_error FROM provider_actions WHERE id=$1',
        [actionId],
      )).rows[0]).toEqual({
        status: 'pending',
        attempt_count: 0,
        claimed_by: null,
        last_error: 'PROVIDER_DISABLED:gitea',
      })
    }
    const branchName = 'workmesh/DEL-1-provider-toggle'
    const branchActionId = (await db.query<{ id: string }>(
      `INSERT INTO provider_actions(
         workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,
         project_id,plan_step_id,kind,intent_key,payload)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'create_branch',$9,$10) RETURNING id`,
      [
        f.workspaceId,
        f.connectionId,
        f.repositoryId,
        f.agentActorId,
        f.sessionId,
        f.workItemId,
        f.projectId,
        f.planStepId,
        randomUUID(),
        { name: branchName, baseSha: 'base' },
      ],
    )).rows[0]!.id

    const claimedBranch = (await worker.claimAction())!
    expect(claimedBranch.id).toBe(branchActionId)
    await db.query("UPDATE provider_connections SET provider='gitea' WHERE id=$1", [f.connectionId])
    await worker.executeAction(claimedBranch)

    expect(resolverCalls).toBe(0)
    expect(providerState.branches.has(`${f.connectionId}:9001:${branchName}`)).toBe(false)
    await expectReleased(branchActionId)
    expect((await db.query(
      "SELECT 1 FROM artifacts WHERE metadata->>'providerActionId'=$1",
      [branchActionId],
    )).rowCount).toBe(0)
    expect((await db.query(
      'SELECT 1 FROM domain_events WHERE aggregate_id=$1',
      [branchActionId],
    )).rowCount).toBe(0)

    await db.query("UPDATE provider_connections SET provider='github' WHERE id=$1", [f.connectionId])
    const recoveredBranch = (await worker.claimAction())!
    expect(recoveredBranch.id).toBe(branchActionId)
    await worker.executeAction(recoveredBranch)
    expect(resolverCalls).toBe(1)
    expect(providerState.branches.has(`${f.connectionId}:9001:${branchName}`)).toBe(true)
    expect((await db.query(
      'SELECT status,attempt_count,claimed_by FROM provider_actions WHERE id=$1',
      [branchActionId],
    )).rows[0]).toEqual({ status: 'completed', attempt_count: 1, claimed_by: null })
    expect((await db.query(
      "SELECT 1 FROM artifacts WHERE metadata->>'providerActionId'=$1",
      [branchActionId],
    )).rowCount).toBe(1)
    expect((await db.query(
      "SELECT 1 FROM domain_events WHERE aggregate_id=$1 AND event_type='provider.action.completed'",
      [branchActionId],
    )).rowCount).toBe(1)

    const contextsBefore = (await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM repository_contexts WHERE repository_id=$1',
      [f.repositoryId],
    )).rows[0]!.count
    const contextActionId = (await db.query<{ id: string }>(
      `INSERT INTO provider_actions(
         workspace_id,connection_id,repository_id,requested_by_actor_id,project_id,
         kind,intent_key,payload,expected_head_sha)
       VALUES($1,$2,$3,$4,$5,'resolve_repository_context',$6,$7,'base') RETURNING id`,
      [
        f.workspaceId,
        f.connectionId,
        f.repositoryId,
        f.humanId,
        f.projectId,
        randomUUID(),
        {
          projectId: f.projectId,
          baseBranch: 'main',
          baseSha: 'base',
          branchPattern: 'workmesh/{workItemKey}-{slug}',
          allowedPaths: ['apps/**'],
          permissions: ['read'],
        },
      ],
    )).rows[0]!.id
    const claimedContext = (await worker.claimAction())!
    expect(claimedContext.id).toBe(contextActionId)
    await db.query("UPDATE provider_connections SET provider='gitea' WHERE id=$1", [f.connectionId])
    await worker.executeAction(claimedContext)

    expect(resolverCalls).toBe(1)
    expect((await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM repository_contexts WHERE repository_id=$1',
      [f.repositoryId],
    )).rows[0]!.count).toBe(contextsBefore)
    await expectReleased(contextActionId)
    await db.query(
      "UPDATE provider_actions SET available_at=now()+interval '1 hour' WHERE id=$1",
      [contextActionId],
    )

    await db.query("UPDATE provider_connections SET provider='github' WHERE id=$1", [f.connectionId])
    const projectionsBefore = (await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM pull_request_projections WHERE repository_id=$1',
      [f.repositoryId],
    )).rows[0]!.count
    const mergeActionId = (await db.query<{ id: string }>(
      `INSERT INTO provider_actions(
         workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,
         project_id,plan_step_id,kind,intent_key,payload,expected_head_sha)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'merge_pull_request',$9,$10,'approved-head')
       RETURNING id`,
      [
        f.workspaceId,
        f.connectionId,
        f.repositoryId,
        f.agentActorId,
        f.sessionId,
        f.workItemId,
        f.projectId,
        f.planStepId,
        randomUUID(),
        { pullRequestId: 'fake-pr-disabled', headSha: 'approved-head', method: 'squash' },
      ],
    )).rows[0]!.id
    const claimedMerge = (await worker.claimAction())!
    expect(claimedMerge.id).toBe(mergeActionId)
    await db.query("UPDATE provider_connections SET provider='gitea' WHERE id=$1", [f.connectionId])
    await worker.executeAction(claimedMerge)

    expect(resolverCalls).toBe(1)
    expect((await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM pull_request_projections WHERE repository_id=$1',
      [f.repositoryId],
    )).rows[0]!.count).toBe(projectionsBefore)
    await expectReleased(mergeActionId)
    expect((await db.query(
      'SELECT 1 FROM domain_events WHERE aggregate_id=ANY($1::uuid[])',
      [[contextActionId, mergeActionId]],
    )).rowCount).toBe(0)
    await db.query("UPDATE provider_connections SET provider='github' WHERE id=$1", [f.connectionId])
  })

  it('reconciles a webhook-first provider PR, retries prerequisite deliveries, and preserves exact provenance through merge', async () => {
    const f = await openPullRequestFixture(await fixture())
    const providerState = new FakeGitProvider()
    providerState.seedRepository(f.connectionId, '9001', 'main', 'base')
    providerState.branches.set(`${f.connectionId}:9001:workmesh/DEL-1-recovery`, {
      name: 'workmesh/DEL-1-recovery',
      headSha: 'recovered-head',
    })
    const provider = numericPullRequestProvider(providerState)
    const crashedWorker = createProviderActionWorker({
      db,
      resolveProvider: () => provider,
      workerId: 'crashed-action-worker',
    })
    const crashedAction = (await crashedWorker.claimAction())!
    expect(crashedAction.id).toBe(f.actionId)
    const opened = await provider.openPullRequest({
      provider: 'fake',
      connectionId: f.connectionId,
      repositoryId: '9001',
      repositoryFullName: 'acme/workmesh',
      idempotencyKey: f.actionId,
      baseBranch: 'main',
      headBranch: 'workmesh/DEL-1-recovery',
      title: 'Recover provider-only PR',
      body: 'Evidence',
      draft: false,
    })
    await db.query(
      "UPDATE provider_actions SET claimed_at=now()-interval '2 minutes' WHERE id=$1",
      [f.actionId],
    )
    const worker = createProviderActionWorker({ db, resolveProvider: () => provider, workerId: 'webhook-first-worker' })
    const enqueue = async (deliveryId: string, eventName: string, payload: object, attemptCount = 0) =>
      (await db.query<{ id: string }>(
        `INSERT INTO provider_webhook_deliveries(
           connection_id,repository_id,delivery_id,event_name,body_hash,payload,attempt_count)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [f.connectionId, f.repositoryId, deliveryId, eventName,
          `sha256:${createHash('sha256').update(deliveryId).digest('hex')}`, payload, attemptCount],
      )).rows[0]!.id
    const checkPayload = {
      check_run: {
        id: 501,
        name: 'test',
        status: 'completed',
        conclusion: 'success',
        head_sha: 'recovered-head',
        updated_at: '2026-07-25T12:02:00Z',
        pull_requests: [{ number: opened.number }],
      },
    }
    const reviewPayload = {
      action: 'submitted',
      pull_request: { number: opened.number, head: { sha: 'recovered-head' } },
      review: {
        id: 88,
        state: 'approved',
        commit_id: 'recovered-head',
        submitted_at: '2026-07-25T12:03:00Z',
        user: { id: 42, login: 'octocat' },
      },
    }
    const checkDeliveryId = await enqueue('check-before-pr', 'check_run', checkPayload)
    const reviewDeliveryId = await enqueue('review-before-pr', 'pull_request_review', reviewPayload)
    for (const deliveryId of [checkDeliveryId, reviewDeliveryId]) {
      const delivery = (await worker.claimWebhook())!
      expect(delivery.id).toBe(deliveryId)
      await expect(worker.finishWebhook(delivery)).rejects.toThrow('PROVIDER_PREREQUISITE_PULL_REQUEST_MISSING')
      await worker.failWebhook(delivery, new Error('PROVIDER_PREREQUISITE_PULL_REQUEST_MISSING'))
    }
    expect((await db.query(
      "SELECT status,last_error FROM provider_webhook_deliveries WHERE id=ANY($1::uuid[]) ORDER BY created_at",
      [[checkDeliveryId, reviewDeliveryId]],
    )).rows).toEqual([
      { status: 'received', last_error: 'PROVIDER_PREREQUISITE_PULL_REQUEST_MISSING' },
      { status: 'received', last_error: 'PROVIDER_PREREQUISITE_PULL_REQUEST_MISSING' },
    ])

    const pullRequestDeliveryId = await enqueue('provider-pr-first', 'pull_request', {
      action: 'opened',
      number: opened.number,
      pull_request: {
        state: 'open',
        draft: false,
        html_url: opened.uri,
        updated_at: '2026-07-25T12:01:00Z',
        base: { ref: opened.baseBranch, sha: opened.baseSha },
        head: { ref: opened.headBranch, sha: opened.headSha },
      },
    })
    const pullRequestDelivery = (await worker.claimWebhook())!
    expect(pullRequestDelivery.id).toBe(pullRequestDeliveryId)
    await worker.finishWebhook(pullRequestDelivery)
    expect((await db.query(
      `SELECT work_item_id,session_id,artifact_id,producer_actor_id
         FROM pull_request_projections WHERE repository_id=$1 AND external_id=$2`,
      [f.repositoryId, opened.id],
    )).rows[0]).toEqual({
      work_item_id: null,
      session_id: null,
      artifact_id: null,
      producer_actor_id: null,
    })

    const action = (await worker.claimAction())!
    expect(action.id).toBe(f.actionId)
    expect(action.attempt_count).toBe(2)
    await worker.executeAction(action)
    const reconciled = (await db.query<{
      id: string
      work_item_id: string
      session_id: string
      artifact_id: string
      producer_actor_id: string
      head_sha: string
    }>(
      `SELECT id,work_item_id,session_id,artifact_id,producer_actor_id,head_sha
         FROM pull_request_projections WHERE repository_id=$1 AND external_id=$2`,
      [f.repositoryId, opened.id],
    )).rows[0]!
    expect(reconciled).toMatchObject({
      work_item_id: f.workItemId,
      session_id: f.sessionId,
      producer_actor_id: f.agentActorId,
      head_sha: 'recovered-head',
    })
    expect(reconciled.artifact_id).toBeTruthy()
    expect((await db.query(
      `SELECT project_id,work_item_id,session_id,plan_step_id,repository_id,pull_request_id,
              provenance->>'providerActionId' AS provider_action_id
         FROM artifact_links WHERE artifact_id=$1`,
      [reconciled.artifact_id],
    )).rows[0]).toEqual({
      project_id: f.projectId,
      work_item_id: f.workItemId,
      session_id: f.sessionId,
      plan_step_id: f.planStepId,
      repository_id: f.repositoryId,
      pull_request_id: reconciled.id,
      provider_action_id: f.actionId,
    })
    expect((await db.query(
      `SELECT 1 FROM pull_request_projections pr
        JOIN work_items w ON w.id=pr.work_item_id
       WHERE pr.id=$1 AND w.project_id=$2`,
      [reconciled.id, f.projectId],
    )).rowCount).toBe(1)

    await db.query(
      'UPDATE provider_webhook_deliveries SET available_at=now() WHERE id=ANY($1::uuid[])',
      [[checkDeliveryId, reviewDeliveryId]],
    )
    await worker.finishWebhook((await worker.claimWebhook())!)
    await worker.finishWebhook((await worker.claimWebhook())!)
    await enqueue('check-replay-after-pr', 'check_run', checkPayload)
    await enqueue('review-replay-after-pr', 'pull_request_review', reviewPayload)
    await worker.finishWebhook((await worker.claimWebhook())!)
    await worker.finishWebhook((await worker.claimWebhook())!)
    expect((await db.query(
      "SELECT 1 FROM ci_check_projections WHERE pull_request_id=$1 AND external_id='501'",
      [reconciled.id],
    )).rowCount).toBe(1)
    expect((await db.query(
      "SELECT 1 FROM provider_review_projections WHERE pull_request_id=$1 AND external_id='88'",
      [reconciled.id],
    )).rowCount).toBe(1)
    expect((await db.query(
      `SELECT count(*)::int AS count FROM domain_events
        WHERE aggregate_id=ANY($1::uuid[]) AND event_type='provider.webhook.processed'`,
      [[checkDeliveryId, reviewDeliveryId]],
    )).rows[0]).toEqual({ count: 2 })

    const reviewArtifactId = (await db.query<{ id: string }>(
      `INSERT INTO artifacts(
         workspace_id,session_id,work_item_id,producer_actor_id,type,title,checksum,source_tool,metadata)
       VALUES($1,$2,$3,$4,'code_review','Independent recovered-head review',$5,
         'integration-reviewer','{"source":"worker-integration"}'::jsonb)
       RETURNING id`,
      [f.workspaceId, f.sessionId, f.workItemId, f.humanId, `sha256:${'d'.repeat(64)}`],
    )).rows[0]!.id
    await db.query(
      `INSERT INTO structured_reviews(
         pull_request_id,reviewer_session_id,reviewer_actor_id,artifact_id,head_sha,
         verdict,summary,evidence,metadata)
       VALUES($1,$2,$3,$4,$5,'approved','Independent recovered-head approval','[]'::jsonb,'{}'::jsonb)`,
      [reconciled.id, f.sessionId, f.humanId, reviewArtifactId, opened.headSha],
    )

    const approvalId = (await db.query<{ id: string }>(
      `INSERT INTO approvals(
         workspace_id,session_id,requested_by_actor_id,approval_type,action_name,
         action_payload_sanitized,action_payload_hash,risk_level,rationale_summary,status,expires_at)
       VALUES($1,$2,$3,'merge','provider.pull_request.merge',$4,$5,'high','Recovered PR approval','approved',now()+interval '1 hour')
       RETURNING id`,
      [f.workspaceId, f.sessionId, f.agentActorId, { headSha: opened.headSha }, `sha256:${'b'.repeat(64)}`],
    )).rows[0]!.id
    await db.query(
      `INSERT INTO merge_approval_bindings(
         approval_id,connection_id,repository_id,pull_request_id,provider_pull_request_id,
         head_sha,method,canonical_payload_hash)
       VALUES($1,$2,$3,$4,$5,$6,'squash',$7)`,
      [approvalId, f.connectionId, f.repositoryId, reconciled.id, opened.id, opened.headSha, `sha256:${'b'.repeat(64)}`],
    )
    const mergeActionId = (await db.query<{ id: string }>(
      `INSERT INTO provider_actions(
         workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,
         project_id,plan_step_id,kind,intent_key,payload,expected_head_sha,approval_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'merge_pull_request',$9,$10,$11,$12) RETURNING id`,
      [f.workspaceId, f.connectionId, f.repositoryId, f.agentActorId, f.sessionId, f.workItemId,
        f.projectId, f.planStepId, randomUUID(),
        { pullRequestId: opened.id, headSha: opened.headSha, method: 'squash' },
        opened.headSha, approvalId],
    )).rows[0]!.id
    const mergeAction = (await worker.claimAction())!
    expect(mergeAction.id).toBe(mergeActionId)
    await worker.executeAction(mergeAction)
    expect((await db.query('SELECT state FROM pull_request_projections WHERE id=$1', [reconciled.id])).rows[0])
      .toEqual({ state: 'merged' })
    expect((await db.query('SELECT status FROM approvals WHERE id=$1', [approvalId])).rows[0])
      .toEqual({ status: 'consumed' })
  })

  it('dead-letters contradictory PR reconciliation and exhausted missing-PR delivery with audit outbox', async () => {
    const f = await openPullRequestFixture(await fixture())
    const providerState = new FakeGitProvider()
    providerState.seedRepository(f.connectionId, '9001', 'main', 'base')
    providerState.branches.set(`${f.connectionId}:9001:workmesh/DEL-1-recovery`, {
      name: 'workmesh/DEL-1-recovery',
      headSha: 'recovered-head',
    })
    const provider = numericPullRequestProvider(providerState)
    const opened = await provider.openPullRequest({
      provider: 'fake',
      connectionId: f.connectionId,
      repositoryId: '9001',
      idempotencyKey: f.actionId,
      baseBranch: 'main',
      headBranch: 'workmesh/DEL-1-recovery',
      title: 'Recover provider-only PR',
      body: 'Evidence',
      draft: false,
    })
    const contradictoryWorkItemId = (await db.query<{ id: string }>(
      `INSERT INTO work_items(
         workspace_id,team_id,project_id,number,title,status_id,responsible_human_actor_id)
       SELECT workspace_id,team_id,project_id,2,'Conflicting owner',status_id,responsible_human_actor_id
         FROM work_items WHERE id=$1 RETURNING id`,
      [f.workItemId],
    )).rows[0]!.id
    await db.query(
      `INSERT INTO pull_request_projections(
         workspace_id,repository_id,external_id,number,uri,work_item_id,
         base_branch,head_branch,base_sha,head_sha,state,draft)
       VALUES($1,$2,$3,$4,$5,$6,'main','workmesh/DEL-1-recovery','base','recovered-head','open',false)`,
      [f.workspaceId, f.repositoryId, opened.id, opened.number, opened.uri, contradictoryWorkItemId],
    )
    const worker = createProviderActionWorker({ db, resolveProvider: () => provider, workerId: 'contradiction-worker' })
    const action = (await worker.claimAction())!
    await worker.executeAction(action)
    expect((await db.query('SELECT status,last_error FROM provider_actions WHERE id=$1', [f.actionId])).rows[0])
      .toEqual({ status: 'dead', last_error: 'PROVIDER_PULL_REQUEST_BINDING_CONFLICT' })
    expect((await db.query(
      'SELECT work_item_id FROM pull_request_projections WHERE repository_id=$1 AND external_id=$2',
      [f.repositoryId, opened.id],
    )).rows[0]).toEqual({ work_item_id: contradictoryWorkItemId })
    expect((await db.query("SELECT 1 FROM artifacts WHERE metadata->>'providerActionId'=$1", [f.actionId])).rowCount).toBe(0)

    const missingDeliveryId = (await db.query<{ id: string }>(
      `INSERT INTO provider_webhook_deliveries(
         connection_id,repository_id,delivery_id,event_name,body_hash,payload,attempt_count)
       VALUES($1,$2,'exhausted-check-before-pr','check_run',$3,$4,11) RETURNING id`,
      [f.connectionId, f.repositoryId, `sha256:${'c'.repeat(64)}`, {
        check_run: {
          id: 999,
          name: 'test',
          status: 'completed',
          conclusion: 'success',
          head_sha: 'missing-head',
          pull_requests: [{ number: 999 }],
        },
      }],
    )).rows[0]!.id
    const missingDelivery = (await worker.claimWebhook())!
    await expect(worker.finishWebhook(missingDelivery)).rejects.toThrow('PROVIDER_PREREQUISITE_PULL_REQUEST_MISSING')
    await worker.failWebhook(missingDelivery, new Error('PROVIDER_PREREQUISITE_PULL_REQUEST_MISSING'))
    expect((await db.query('SELECT status,last_error FROM provider_webhook_deliveries WHERE id=$1', [missingDeliveryId])).rows[0])
      .toEqual({ status: 'dead', last_error: 'PROVIDER_PREREQUISITE_PULL_REQUEST_MISSING' })
    expect((await db.query(
      `SELECT event_type,count(*)::int AS count
         FROM domain_events e JOIN outbox_events o ON o.domain_event_id=e.id
        WHERE (e.aggregate_id=$1 AND e.event_type='provider.action.dead_lettered')
           OR (e.aggregate_id=$2 AND e.event_type='provider.webhook.dead_lettered')
        GROUP BY event_type ORDER BY event_type`,
      [f.actionId, missingDeliveryId],
    )).rows).toEqual([
      { event_type: 'provider.action.dead_lettered', count: 1 },
      { event_type: 'provider.webhook.dead_lettered', count: 1 },
    ])
  })

  it('recovers and idempotently projects provider reviews with exact head and author provenance', async () => {
    const f = await fixture()
    const pullRequestId = (await db.query<{ id: string }>(
      `INSERT INTO pull_request_projections(
         workspace_id,repository_id,external_id,number,uri,base_branch,head_branch,base_sha,head_sha,state,draft)
       VALUES($1,$2,'provider-pr',7,'https://example.test/pr/7','main','workmesh/DEL-7','base','reviewed-head','open',false)
       RETURNING id`,
      [f.workspaceId, f.repositoryId],
    )).rows[0]!.id
    const payload = {
      pull_request: { number: 7, head: { sha: 'current-head' } },
      review: { id: 88, state: 'approved', commit_id: 'reviewed-head', html_url: 'https://example.test/reviews/88', user: { id: 42, login: 'octocat' } },
    }
    const deliveryId = (await db.query<{ id: string }>(
      `INSERT INTO provider_webhook_deliveries(connection_id,repository_id,delivery_id,event_name,body_hash,payload)
       VALUES($1,$2,'review-recover','pull_request_review',$3,$4) RETURNING id`,
      [f.connectionId, f.repositoryId, `sha256:${'d'.repeat(64)}`, payload],
    )).rows[0]!.id
    const dead = createProviderActionWorker({ db, resolveProvider: () => fake, workerId: 'review-dead' })
    expect((await dead.claimWebhook())?.id).toBe(deliveryId)
    await db.query("UPDATE provider_webhook_deliveries SET claimed_at=now()-interval '2 minutes' WHERE id=$1", [deliveryId])
    const recovered = createProviderActionWorker({ db, resolveProvider: () => fake, workerId: 'review-recovered' })
    await recovered.finishWebhook((await recovered.claimWebhook())!)
    await db.query(
      `INSERT INTO provider_webhook_deliveries(connection_id,repository_id,delivery_id,event_name,body_hash,payload)
       VALUES($1,$2,'review-replay','pull_request_review',$3,$4)`,
      [f.connectionId, f.repositoryId, `sha256:${'d'.repeat(64)}`, payload],
    )
    await recovered.tick()
    expect((await db.query(
      `SELECT pull_request_id,state,head_sha,author_external_id,author_login
         FROM provider_review_projections WHERE repository_id=$1 AND external_id='88'`,
      [f.repositoryId],
    )).rows).toEqual([{
      pull_request_id: pullRequestId, state: 'approved', head_sha: 'reviewed-head',
      author_external_id: '42', author_login: 'octocat',
    }])
    expect((await db.query("SELECT 1 FROM provider_review_projections WHERE repository_id=$1 AND external_id='88'", [f.repositoryId])).rowCount).toBe(1)
  })

  it('keeps pull request, check, review, and exact-head approval projections monotonic when old deliveries arrive late', async () => {
    const f = await fixture()
    const worker = createProviderActionWorker({ db, resolveProvider: () => fake, workerId: 'ordered-worker' })
    const deliver = async (deliveryId: string, eventName: string, payload: object) => {
      await db.query(
        `INSERT INTO provider_webhook_deliveries(connection_id,repository_id,delivery_id,event_name,body_hash,payload)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [f.connectionId, f.repositoryId, deliveryId, eventName,
          `sha256:${createHash('sha256').update(deliveryId).digest('hex')}`, payload],
      )
      await worker.tick()
    }
    await deliver('new-pr', 'pull_request', {
      action: 'synchronize', number: 7,
      pull_request: {
        state: 'open', draft: false, html_url: 'https://example.test/pr/7',
        updated_at: '2026-07-25T12:00:00Z',
        base: { ref: 'main', sha: 'base' }, head: { ref: 'workmesh/DEL-7', sha: 'new-head' },
      },
    })
    const pullRequestId = (await db.query<{ id: string }>(
      "SELECT id FROM pull_request_projections WHERE repository_id=$1 AND external_id='7'",
      [f.repositoryId],
    )).rows[0]!.id

    const humanId = (await db.query<{ id: string }>(
      "INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,'human','admin',$2,'Human','hash') RETURNING id",
      [f.workspaceId, `${randomUUID()}@example.test`],
    )).rows[0]!.id
    const agentActorId = (await db.query<{ id: string }>(
      "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Agent') RETURNING id", [f.workspaceId],
    )).rows[0]!.id
    const stateId = (await db.query<{ id: string }>(
      "INSERT INTO workflow_states(workspace_id,team_id,name,category) VALUES($1,$2,'Ready','planned') RETURNING id",
      [f.workspaceId, f.teamId],
    )).rows[0]!.id
    const workItemId = (await db.query<{ id: string }>(
      `INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id)
       VALUES($1,$2,7,'Ordered',$3,$4) RETURNING id`,
      [f.workspaceId, f.teamId, stateId, humanId],
    )).rows[0]!.id
    const agentId = (await db.query<{ id: string }>(
      `INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,requested_capabilities,approved_capabilities)
       VALUES($1,$2,$3,'Agent',$4,$4) RETURNING id`,
      [f.workspaceId, agentActorId, `ordered-${randomUUID()}`, ['repo:merge']],
    )).rows[0]!.id
    const delegationId = (await db.query<{ id: string }>(
      `INSERT INTO delegations(
         workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,
         role,scope_type,scope_id,permissions_snapshot,capability_scope)
       VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6,$7,$8) RETURNING id`,
      [f.workspaceId, f.teamId, agentId, agentActorId, humanId, workItemId,
        ['repo:merge'], { workspaceId: f.workspaceId, repositoryIds: [f.repositoryId] }],
    )).rows[0]!.id
    const sessionId = (await db.query<{ id: string }>(
      `INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state)
       VALUES($1,$2,$3,$4,$5,$6,'executing') RETURNING id`,
      [f.workspaceId, f.teamId, agentId, agentActorId, delegationId, workItemId],
    )).rows[0]!.id
    const approvalId = (await db.query<{ id: string }>(
      `INSERT INTO approvals(
         workspace_id,session_id,requested_by_actor_id,approval_type,action_name,
         action_payload_sanitized,action_payload_hash,risk_level,rationale_summary,status,expires_at)
       VALUES($1,$2,$3,'merge','provider.pull_request.merge',$4,$5,'high','ordered approval','approved',now()+interval '1 hour')
       RETURNING id`,
      [f.workspaceId, sessionId, agentActorId, { headSha: 'new-head' }, `sha256:${'a'.repeat(64)}`],
    )).rows[0]!.id
    await db.query(
      `INSERT INTO merge_approval_bindings(
         approval_id,connection_id,repository_id,pull_request_id,provider_pull_request_id,
         head_sha,method,canonical_payload_hash)
       VALUES($1,$2,$3,$4,'7','new-head','squash',$5)`,
      [approvalId, f.connectionId, f.repositoryId, pullRequestId, `sha256:${'b'.repeat(64)}`],
    )

    await deliver('new-check', 'check_run', {
      check_run: {
        id: 501, name: 'test', status: 'completed', conclusion: 'success',
        head_sha: 'new-head', updated_at: '2026-07-25T12:02:00Z',
      },
    })
    await deliver('new-review', 'pull_request_review', {
      action: 'dismissed',
      pull_request: { number: 7, head: { sha: 'new-head' } },
      review: {
        id: 88, state: 'dismissed', commit_id: 'new-head',
        submitted_at: '2026-07-25T12:03:00Z', user: { id: 42, login: 'octocat' },
      },
    })
    await deliver('old-check', 'check_run', {
      check_run: {
        id: 501, name: 'test', status: 'queued', conclusion: null,
        head_sha: 'new-head', updated_at: '2026-07-25T10:02:00Z',
      },
    })
    await deliver('old-review', 'pull_request_review', {
      action: 'submitted',
      pull_request: { number: 7, head: { sha: 'new-head' } },
      review: {
        id: 88, state: 'approved', commit_id: 'new-head',
        submitted_at: '2026-07-25T10:03:00Z', user: { id: 42, login: 'octocat' },
      },
    })
    await deliver('old-pr', 'pull_request', {
      action: 'opened', number: 7,
      pull_request: {
        state: 'open', draft: false, html_url: 'https://example.test/pr/7',
        updated_at: '2026-07-25T10:00:00Z',
        base: { ref: 'main', sha: 'base' }, head: { ref: 'workmesh/DEL-7', sha: 'old-head' },
      },
    })

    expect((await db.query("SELECT head_sha FROM pull_request_projections WHERE id=$1", [pullRequestId])).rows[0])
      .toEqual({ head_sha: 'new-head' })
    expect((await db.query("SELECT status,head_sha FROM ci_check_projections WHERE pull_request_id=$1 AND external_id='501'", [pullRequestId])).rows[0])
      .toEqual({ status: 'passed', head_sha: 'new-head' })
    expect((await db.query("SELECT state,head_sha FROM provider_review_projections WHERE pull_request_id=$1 AND external_id='88'", [pullRequestId])).rows[0])
      .toEqual({ state: 'dismissed', head_sha: 'new-head' })
    expect((await db.query('SELECT status FROM approvals WHERE id=$1', [approvalId])).rows[0])
      .toEqual({ status: 'approved' })
    expect((await db.query('SELECT invalidated_at FROM merge_approval_bindings WHERE approval_id=$1', [approvalId])).rows[0])
      .toEqual({ invalidated_at: null })
  })

  it('rolls back and then emits exactly one claim-owned terminal event for action, webhook, and upload rejection', async () => {
    const f = await fixture()
    const humanId = (await db.query<{ id: string }>(
      "INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,'human','admin',$2,'Human','hash') RETURNING id",
      [f.workspaceId, `${randomUUID()}@example.test`],
    )).rows[0]!.id
    const agentActorId = (await db.query<{ id: string }>(
      "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Agent') RETURNING id", [f.workspaceId],
    )).rows[0]!.id
    const stateId = (await db.query<{ id: string }>(
      "INSERT INTO workflow_states(workspace_id,team_id,name,category) VALUES($1,$2,'Ready','planned') RETURNING id", [f.workspaceId, f.teamId],
    )).rows[0]!.id
    const workItemId = (await db.query<{ id: string }>(
      `INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id)
       VALUES($1,$2,1,'Terminal',$3,$4) RETURNING id`, [f.workspaceId, f.teamId, stateId, humanId],
    )).rows[0]!.id
    const agentId = (await db.query<{ id: string }>(
      `INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,requested_capabilities,approved_capabilities)
       VALUES($1,$2,$3,'Agent',$4,$4) RETURNING id`,
      [f.workspaceId, agentActorId, `terminal-${randomUUID()}`, ['artifact:write']],
    )).rows[0]!.id
    const delegationId = (await db.query<{ id: string }>(
      `INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,
         role,scope_type,scope_id,permissions_snapshot,capability_scope)
       VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6,$7,$8) RETURNING id`,
      [f.workspaceId, f.teamId, agentId, agentActorId, humanId, workItemId, ['artifact:write'], { workspaceId: f.workspaceId }],
    )).rows[0]!.id
    const sessionId = (await db.query<{ id: string }>(
      `INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state)
       VALUES($1,$2,$3,$4,$5,$6,'executing') RETURNING id`,
      [f.workspaceId, f.teamId, agentId, agentActorId, delegationId, workItemId],
    )).rows[0]!.id
    const actionId = (await db.query<{ id: string }>(
      `INSERT INTO provider_actions(workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,
         kind,intent_key,payload,attempt_count)
       VALUES($1,$2,$3,$4,$5,$6,'create_branch',$7,$8,7) RETURNING id`,
      [f.workspaceId, f.connectionId, f.repositoryId, agentActorId, sessionId, workItemId, randomUUID(), { name: 'x', baseSha: 'base' }],
    )).rows[0]!.id
    const providerWorker = createProviderActionWorker({ db, resolveProvider: () => fake, workerId: 'terminal-provider' })
    const action = (await providerWorker.claimAction())!
    process.env.PROVIDER_INJECT_FAILURE_AFTER_TERMINAL_UPDATE = 'true'
    await expect(providerWorker.failAction(action, new Error('terminal'))).rejects.toThrow('PROVIDER_INJECTED_TERMINAL_ROLLBACK')
    delete process.env.PROVIDER_INJECT_FAILURE_AFTER_TERMINAL_UPDATE
    expect((await db.query('SELECT status FROM provider_actions WHERE id=$1', [actionId])).rows[0]).toEqual({ status: 'claimed' })
    await providerWorker.failAction(action, new Error('terminal'))
    await providerWorker.failAction(action, new Error('duplicate'))

    const webhookId = (await db.query<{ id: string }>(
      `INSERT INTO provider_webhook_deliveries(connection_id,repository_id,delivery_id,event_name,body_hash,payload,attempt_count)
       VALUES($1,$2,'terminal-webhook','unknown',$3,'{}',11) RETURNING id`,
      [f.connectionId, f.repositoryId, `sha256:${'e'.repeat(64)}`],
    )).rows[0]!.id
    const webhook = (await providerWorker.claimWebhook())!
    await providerWorker.failWebhook(webhook, new Error('terminal webhook'))
    await providerWorker.failWebhook(webhook, new Error('duplicate'))

    const uploadId = (await db.query<{ id: string }>(
      `INSERT INTO artifact_upload_intents(
         workspace_id,work_item_id,session_id,repository_id,source_tool,requested_by_actor_id,storage_key,filename,mime_type,size_bytes,
         expected_checksum,status,attempt_count,expires_at)
       VALUES($1,$2,$3,$4,'worker-test',$5,'terminal/key','terminal.txt','text/plain',1,$6,'uploaded',7,now()+interval '1 hour') RETURNING id`,
      [f.workspaceId, workItemId, sessionId, f.repositoryId, agentActorId, `sha256:${'f'.repeat(64)}`],
    )).rows[0]!.id
    const uploadWorker = createArtifactUploadWorker({
      db, workerId: 'terminal-upload',
      storage: { verify: async () => { throw new Error('unused') } },
    })
    const upload = (await uploadWorker.claim())!
    process.env.ARTIFACT_INJECT_FAILURE_AFTER_TERMINAL_UPDATE = 'true'
    await expect(uploadWorker.fail(upload, new Error('terminal upload'))).rejects.toThrow('ARTIFACT_INJECTED_TERMINAL_ROLLBACK')
    delete process.env.ARTIFACT_INJECT_FAILURE_AFTER_TERMINAL_UPDATE
    expect((await db.query('SELECT status FROM artifact_upload_intents WHERE id=$1', [uploadId])).rows[0]).toEqual({ status: 'uploaded' })
    await uploadWorker.fail(upload, new Error('terminal upload'))
    await uploadWorker.fail(upload, new Error('duplicate'))

    expect((await db.query(
      `SELECT event_type,count(*)::int AS count FROM domain_events
        WHERE (aggregate_id=$1 AND event_type='provider.action.dead_lettered')
           OR (aggregate_id=$2 AND event_type='provider.webhook.dead_lettered')
           OR (aggregate_id=$3 AND event_type='artifact.upload.rejected')
        GROUP BY event_type ORDER BY event_type`,
      [actionId, webhookId, uploadId],
    )).rows).toEqual([
      { event_type: 'artifact.upload.rejected', count: 1 },
      { event_type: 'provider.action.dead_lettered', count: 1 },
      { event_type: 'provider.webhook.dead_lettered', count: 1 },
    ])
    expect((await db.query(
      `SELECT 1 FROM outbox_events o JOIN domain_events e ON e.id=o.domain_event_id
        WHERE e.aggregate_id=ANY($1::uuid[])`,
      [[actionId, webhookId, uploadId]],
    )).rowCount).toBe(3)
  })

  it('revalidates every queued provider mutation and audits revoked authority without a provider write', async () => {
    const f = await openPullRequestFixture(await fixture())
    const providerState = new FakeGitProvider()
    providerState.seedRepository(f.connectionId, '9001', 'main', 'base')
    providerState.branches.set(`${f.connectionId}:9001:workmesh/DEL-1-recovery`, {
      name: 'workmesh/DEL-1-recovery',
      headSha: 'approved-head',
    })
    providerState.pullRequests.set(`${f.connectionId}:9001:fake-pr-revoked`, {
      id: 'fake-pr-revoked',
      number: 41,
      uri: 'https://example.test/pull/41',
      baseBranch: 'main',
      headBranch: 'workmesh/DEL-1-recovery',
      baseSha: 'base',
      headSha: 'approved-head',
      state: 'open',
      draft: false,
    })
    const observed = observeProviderMutations(providerState)
    const worker = createProviderActionWorker({
      db,
      resolveProvider: () => observed.provider,
      workerId: 'revoked-authority-worker',
    })

    await db.query("UPDATE agent_sessions SET state='stopping',stop_requested_at=now() WHERE id=$1", [f.sessionId])
    await worker.tick()
    await db.query("UPDATE agent_sessions SET state='executing',stop_requested_at=NULL WHERE id=$1", [f.sessionId])

    const branchActionId = (await db.query<{ id: string }>(
      `INSERT INTO provider_actions(
         workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,
         project_id,plan_step_id,kind,intent_key,payload)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'create_branch',$9,$10) RETURNING id`,
      [
        f.workspaceId,
        f.connectionId,
        f.repositoryId,
        f.agentActorId,
        f.sessionId,
        f.workItemId,
        f.projectId,
        f.planStepId,
        randomUUID(),
        { name: 'workmesh/DEL-1-delegation-revoked', baseSha: 'base' },
      ],
    )).rows[0]!.id
    await db.query(
      "UPDATE delegations SET status='revoked',revoked_at=now() WHERE id=$1",
      [f.delegationId],
    )
    await worker.tick()
    await db.query(
      "UPDATE delegations SET status='active',revoked_at=NULL WHERE id=$1",
      [f.delegationId],
    )

    const commitActionId = (await db.query<{ id: string }>(
      `INSERT INTO provider_actions(
         workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,
         project_id,plan_step_id,kind,intent_key,payload)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'create_commit',$9,$10) RETURNING id`,
      [
        f.workspaceId,
        f.connectionId,
        f.repositoryId,
        f.agentActorId,
        f.sessionId,
        f.workItemId,
        f.projectId,
        f.planStepId,
        randomUUID(),
        {
          branch: 'workmesh/DEL-1-recovery',
          expectedHeadSha: 'approved-head',
          message: 'Should not be committed',
          files: [{ path: 'apps/api/revoked.ts', content: 'never' }],
        },
      ],
    )).rows[0]!.id
    await db.query(
      'UPDATE agent_team_access SET revoked_at=now() WHERE agent_id=$1 AND team_id=$2',
      [f.agentId, f.teamId],
    )
    await worker.tick()
    await db.query(
      'UPDATE agent_team_access SET revoked_at=NULL WHERE agent_id=$1 AND team_id=$2',
      [f.agentId, f.teamId],
    )

    const pullRequestId = (await db.query<{ id: string }>(
      `INSERT INTO pull_request_projections(
         workspace_id,repository_id,external_id,number,uri,work_item_id,session_id,producer_actor_id,
         base_branch,head_branch,base_sha,head_sha,state,draft)
       VALUES($1,$2,'fake-pr-revoked',41,'https://example.test/pull/41',$3,$4,$5,
         'main','workmesh/DEL-1-recovery','base','approved-head','open',false)
       RETURNING id`,
      [f.workspaceId, f.repositoryId, f.workItemId, f.sessionId, f.agentActorId],
    )).rows[0]!.id
    const canonicalHash = `sha256:${'d'.repeat(64)}`
    const approvalId = (await db.query<{ id: string }>(
      `INSERT INTO approvals(
         workspace_id,session_id,requested_by_actor_id,approval_type,action_name,
         action_payload_sanitized,action_payload_hash,risk_level,rationale_summary,status,expires_at)
       VALUES($1,$2,$3,'merge','provider.pull_request.merge',$4,$5,'high',
         'Revoked repository merge','approved',now()+interval '1 hour') RETURNING id`,
      [f.workspaceId, f.sessionId, f.agentActorId, { headSha: 'approved-head' }, canonicalHash],
    )).rows[0]!.id
    await db.query(
      `INSERT INTO merge_approval_bindings(
         approval_id,connection_id,repository_id,pull_request_id,provider_pull_request_id,
         head_sha,method,canonical_payload_hash)
       VALUES($1,$2,$3,$4,'fake-pr-revoked','approved-head','squash',$5)`,
      [approvalId, f.connectionId, f.repositoryId, pullRequestId, canonicalHash],
    )
    const mergeActionId = (await db.query<{ id: string }>(
      `INSERT INTO provider_actions(
         workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,
         project_id,plan_step_id,kind,intent_key,payload,expected_head_sha,approval_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'merge_pull_request',$9,$10,'approved-head',$11)
       RETURNING id`,
      [
        f.workspaceId,
        f.connectionId,
        f.repositoryId,
        f.agentActorId,
        f.sessionId,
        f.workItemId,
        f.projectId,
        f.planStepId,
        randomUUID(),
        { pullRequestId: 'fake-pr-revoked', headSha: 'approved-head', method: 'squash' },
        approvalId,
      ],
    )).rows[0]!.id
    await db.query('UPDATE repositories SET active=false WHERE id=$1', [f.repositoryId])
    await worker.tick()

    await db.query('UPDATE repositories SET active=true WHERE id=$1', [f.repositoryId])
    const inactiveAgentActionId = (await db.query<{ id: string }>(
      `INSERT INTO provider_actions(
         workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,
         project_id,plan_step_id,kind,intent_key,payload)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'create_branch',$9,$10) RETURNING id`,
      [
        f.workspaceId,
        f.connectionId,
        f.repositoryId,
        f.agentActorId,
        f.sessionId,
        f.workItemId,
        f.projectId,
        f.planStepId,
        randomUUID(),
        { name: 'workmesh/DEL-1-definition-disabled', baseSha: 'base' },
      ],
    )).rows[0]!.id
    await db.query('UPDATE agent_definitions SET is_active=false WHERE id=$1', [f.agentId])
    await worker.tick()

    expect(observed.calls()).toEqual({ branch: 0, commit: 0, open: 0, merge: 0 })
    const actionIds = [f.actionId, branchActionId, commitActionId, mergeActionId, inactiveAgentActionId]
    const rejected = (await db.query<{ id: string; status: string; last_error: string }>(
      `SELECT id,status,last_error FROM provider_actions
        WHERE id=ANY($1::uuid[]) ORDER BY array_position($1::uuid[],id)`,
      [actionIds],
    )).rows
    expect(rejected).toHaveLength(5)
    expect(rejected.every(action =>
      action.status === 'dead' &&
      action.last_error.startsWith('PROVIDER_ACTION_AUTHORITY_REVOKED:'),
    )).toBe(true)
    expect((await db.query(
      `SELECT e.aggregate_id,count(*)::int AS count
         FROM domain_events e JOIN outbox_events o ON o.domain_event_id=e.id
        WHERE e.aggregate_id=ANY($1::uuid[])
          AND e.event_type='provider.action.authorization_revoked'
        GROUP BY e.aggregate_id`,
      [actionIds],
    )).rows).toHaveLength(5)
  })

  it('reconciles a checkpointed provider result after revocation without repeating the provider mutation', async () => {
    const f = await openPullRequestFixture(await fixture())
    await db.query("UPDATE provider_actions SET status='completed' WHERE id=$1", [f.actionId])
    const actionId = (await db.query<{ id: string }>(
      `INSERT INTO provider_actions(
         workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,
         project_id,plan_step_id,kind,intent_key,payload)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'create_branch',$9,$10) RETURNING id`,
      [
        f.workspaceId,
        f.connectionId,
        f.repositoryId,
        f.agentActorId,
        f.sessionId,
        f.workItemId,
        f.projectId,
        f.planStepId,
        randomUUID(),
        { name: 'workmesh/DEL-1-checkpoint', baseSha: 'base' },
      ],
    )).rows[0]!.id
    const providerState = new FakeGitProvider()
    providerState.seedRepository(f.connectionId, '9001', 'main', 'base')
    const observed = observeProviderMutations(providerState)
    const crashedWorker = createProviderActionWorker({
      db,
      resolveProvider: () => observed.provider,
      workerId: 'checkpoint-crashed-worker',
    })
    const action = (await crashedWorker.claimAction())!
    expect(action.id).toBe(actionId)
    process.env.PROVIDER_INJECT_FAILURE_AFTER_RESULT_CHECKPOINT = 'true'
    await expect(crashedWorker.executeAction(action)).rejects.toThrow('PROVIDER_INJECTED_FAILURE_AFTER_RESULT_CHECKPOINT')
    delete process.env.PROVIDER_INJECT_FAILURE_AFTER_RESULT_CHECKPOINT
    expect(observed.calls()).toEqual({ branch: 1, commit: 0, open: 0, merge: 0 })
    expect((await db.query('SELECT status,result FROM provider_actions WHERE id=$1', [actionId])).rows[0])
      .toMatchObject({ status: 'claimed', result: { name: 'workmesh/DEL-1-checkpoint', headSha: 'base' } })

    await db.query(
      "UPDATE provider_actions SET claimed_at=now()-interval '2 minutes' WHERE id=$1",
      [actionId],
    )
    await db.query(
      "UPDATE agent_sessions SET state='stopping',stop_requested_at=now() WHERE id=$1",
      [f.sessionId],
    )
    await db.query(
      "UPDATE delegations SET status='revoked',revoked_at=now() WHERE id=$1",
      [f.delegationId],
    )
    const recoveredWorker = createProviderActionWorker({
      db,
      resolveProvider: () => observed.provider,
      workerId: 'checkpoint-recovery-worker',
    })
    const recovered = (await recoveredWorker.claimAction())!
    expect(recovered.id).toBe(actionId)
    await recoveredWorker.executeAction(recovered)
    await recoveredWorker.tick()

    expect(observed.calls()).toEqual({ branch: 1, commit: 0, open: 0, merge: 0 })
    expect((await db.query('SELECT status,completed_at FROM provider_actions WHERE id=$1', [actionId])).rows[0])
      .toMatchObject({ status: 'completed' })
    expect((await db.query(
      `SELECT count(*)::int AS count FROM artifacts
        WHERE metadata->>'providerActionId'=$1`,
      [actionId],
    )).rows[0]).toEqual({ count: 1 })
    expect((await db.query(
      `SELECT count(*)::int AS count FROM domain_events e
        JOIN outbox_events o ON o.domain_event_id=e.id
       WHERE e.aggregate_id=$1 AND e.event_type='provider.action.completed'`,
      [actionId],
    )).rows[0]).toEqual({ count: 1 })
  })

  it('reconciles a provider-merged webhook race after a crash exactly once without a second merge', async () => {
    const f = await openPullRequestFixture(await fixture())
    await db.query("UPDATE provider_actions SET status='completed' WHERE id=$1", [f.actionId])
    const providerState = new FakeGitProvider()
    providerState.seedRepository(f.connectionId, '9001', 'main', 'base')
    providerState.branches.set(`${f.connectionId}:9001:workmesh/DEL-1-merge-race`, {
      name: 'workmesh/DEL-1-merge-race',
      headSha: 'race-head',
    })
    providerState.pullRequests.set(`${f.connectionId}:9001:91`, {
      id: '91',
      number: 91,
      uri: 'https://example.test/pull/91',
      baseBranch: 'main',
      headBranch: 'workmesh/DEL-1-merge-race',
      baseSha: 'base',
      headSha: 'race-head',
      state: 'open',
      draft: false,
    })
    const pullRequestId = (await db.query<{ id: string }>(
      `INSERT INTO pull_request_projections(
         workspace_id,repository_id,external_id,number,uri,work_item_id,session_id,producer_actor_id,
         base_branch,head_branch,base_sha,head_sha,state,draft)
       VALUES($1,$2,'91',91,'https://example.test/pull/91',$3,$4,$5,
         'main','workmesh/DEL-1-merge-race','base','race-head','open',false)
       RETURNING id`,
      [f.workspaceId, f.repositoryId, f.workItemId, f.sessionId, f.agentActorId],
    )).rows[0]!.id
    const reviewArtifactId = (await db.query<{ id: string }>(
      `INSERT INTO artifacts(
         workspace_id,session_id,work_item_id,producer_actor_id,type,title,checksum,source_tool,metadata)
       VALUES($1,$2,$3,$4,'code_review','Independent current-head review',$5,
         'integration-reviewer','{"source":"worker-integration"}'::jsonb)
       RETURNING id`,
      [f.workspaceId, f.sessionId, f.workItemId, f.humanId, `sha256:${'f'.repeat(64)}`],
    )).rows[0]!.id
    await db.query(
      `INSERT INTO structured_reviews(
         pull_request_id,reviewer_session_id,reviewer_actor_id,artifact_id,head_sha,
         verdict,summary,evidence,metadata)
       VALUES($1,$2,$3,$4,'race-head','approved','Independent approval','[]'::jsonb,'{}'::jsonb)`,
      [pullRequestId, f.sessionId, f.humanId, reviewArtifactId],
    )
    const canonicalHash = `sha256:${'e'.repeat(64)}`
    const approvalId = (await db.query<{ id: string }>(
      `INSERT INTO approvals(
         workspace_id,session_id,requested_by_actor_id,approval_type,action_name,
         action_payload_sanitized,action_payload_hash,risk_level,rationale_summary,status,expires_at)
       VALUES($1,$2,$3,'merge','provider.pull_request.merge',$4,$5,'high',
         'Merge crash recovery','approved',now()+interval '1 hour') RETURNING id`,
      [f.workspaceId, f.sessionId, f.agentActorId, { headSha: 'race-head' }, canonicalHash],
    )).rows[0]!.id
    await db.query(
      `INSERT INTO merge_approval_bindings(
         approval_id,connection_id,repository_id,pull_request_id,provider_pull_request_id,
         head_sha,method,canonical_payload_hash)
       VALUES($1,$2,$3,$4,'91','race-head','squash',$5)`,
      [approvalId, f.connectionId, f.repositoryId, pullRequestId, canonicalHash],
    )
    const actionId = (await db.query<{ id: string }>(
      `INSERT INTO provider_actions(
         workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,
         project_id,plan_step_id,kind,intent_key,payload,expected_head_sha,approval_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'merge_pull_request',$9,$10,'race-head',$11)
       RETURNING id`,
      [
        f.workspaceId,
        f.connectionId,
        f.repositoryId,
        f.agentActorId,
        f.sessionId,
        f.workItemId,
        f.projectId,
        f.planStepId,
        randomUUID(),
        { pullRequestId: '91', headSha: 'race-head', method: 'squash' },
        approvalId,
      ],
    )).rows[0]!.id
    const observed = observeProviderMutations(providerState)
    const crashedWorker = createProviderActionWorker({
      db,
      resolveProvider: () => observed.provider,
      workerId: 'post-merge-crashed-worker',
    })
    const action = (await crashedWorker.claimAction())!
    expect(action.id).toBe(actionId)
    process.env.PROVIDER_INJECT_FAILURE_AFTER_PROVIDER_SUCCESS = 'true'
    await expect(crashedWorker.executeAction(action)).rejects.toThrow('PROVIDER_INJECTED_FAILURE_AFTER_PROVIDER_SUCCESS')
    delete process.env.PROVIDER_INJECT_FAILURE_AFTER_PROVIDER_SUCCESS
    const providerResult = await providerState.getPullRequest({
      provider: 'fake',
      connectionId: f.connectionId,
      repositoryId: '9001',
      pullRequestId: '91',
    })
    expect(providerResult.state).toBe('merged')
    expect(observed.calls()).toEqual({ branch: 0, commit: 0, open: 0, merge: 1 })
    expect((await db.query('SELECT status,result FROM provider_actions WHERE id=$1', [actionId])).rows[0])
      .toEqual({ status: 'claimed', result: null })

    const deliveryId = (await db.query<{ id: string }>(
      `INSERT INTO provider_webhook_deliveries(
         connection_id,repository_id,delivery_id,event_name,body_hash,payload)
       VALUES($1,$2,'merge-race-webhook','pull_request',$3,$4) RETURNING id`,
      [
        f.connectionId,
        f.repositoryId,
        `sha256:${'f'.repeat(64)}`,
        {
          action: 'closed',
          number: 91,
          pull_request: {
            state: 'closed',
            merged: true,
            draft: false,
            html_url: 'https://example.test/pull/91',
            updated_at: '2026-07-25T13:00:00Z',
            base: { ref: 'main', sha: 'base' },
            head: { ref: 'workmesh/DEL-1-merge-race', sha: 'race-head' },
          },
        },
      ],
    )).rows[0]!.id
    const webhookWorker = createProviderActionWorker({
      db,
      resolveProvider: () => observed.provider,
      workerId: 'merge-webhook-worker',
    })
    const delivery = (await webhookWorker.claimWebhook())!
    expect(delivery.id).toBe(deliveryId)
    await webhookWorker.finishWebhook(delivery)
    expect((await db.query('SELECT state,head_sha FROM pull_request_projections WHERE id=$1', [pullRequestId])).rows[0])
      .toEqual({ state: 'merged', head_sha: 'race-head' })

    await db.query(
      "UPDATE provider_actions SET claimed_at=now()-interval '2 minutes' WHERE id=$1",
      [actionId],
    )
    await db.query(
      "UPDATE agent_sessions SET state='stopping',stop_requested_at=now() WHERE id=$1",
      [f.sessionId],
    )
    await db.query(
      "UPDATE delegations SET status='revoked',revoked_at=now() WHERE id=$1",
      [f.delegationId],
    )
    const recoveryWorker = createProviderActionWorker({
      db,
      resolveProvider: () => observed.provider,
      workerId: 'post-merge-recovery-worker',
    })
    const recovered = (await recoveryWorker.claimAction())!
    expect(recovered.id).toBe(actionId)
    await recoveryWorker.executeAction(recovered)
    await recoveryWorker.tick()

    expect(observed.calls()).toEqual({ branch: 0, commit: 0, open: 0, merge: 1 })
    expect((await db.query('SELECT status,result FROM provider_actions WHERE id=$1', [actionId])).rows[0])
      .toMatchObject({
        status: 'completed',
        result: { merged: true, mergeSha: providerResult.mergeSha },
      })
    const approval = (await db.query<{ status: string; consumed_at: Date | null }>(
      'SELECT status,consumed_at FROM approvals WHERE id=$1',
      [approvalId],
    )).rows[0]!
    expect(approval.status).toBe('consumed')
    expect(approval.consumed_at).toBeTruthy()
    expect((await db.query(
      'SELECT count(*)::int AS count FROM completion_suggestions WHERE pull_request_id=$1',
      [pullRequestId],
    )).rows[0]).toEqual({ count: 1 })
    expect((await db.query(
      `SELECT count(*)::int AS count FROM domain_events e
        JOIN outbox_events o ON o.domain_event_id=e.id
       WHERE e.aggregate_id=$1 AND e.event_type='pull_request.merged'`,
      [actionId],
    )).rows[0]).toEqual({ count: 1 })
  })

  it('expires a delayed merge approval without calling the provider', async () => {
    const f = await openPullRequestFixture(await fixture())
    await db.query("UPDATE provider_actions SET status='completed' WHERE id=$1", [f.actionId])
    const pullRequestId = (await db.query<{ id: string }>(
      `INSERT INTO pull_request_projections(
         workspace_id,repository_id,external_id,number,uri,work_item_id,session_id,producer_actor_id,
         base_branch,head_branch,base_sha,head_sha,state,draft
       ) VALUES($1,$2,'fake-pr-expired',9,'https://example.test/pull/9',$3,$4,$5,
         'main','workmesh/DEL-1-expired','base','approved-head','open',false)
       RETURNING id`,
      [f.workspaceId, f.repositoryId, f.workItemId, f.sessionId, f.agentActorId],
    )).rows[0]!.id
    const canonicalHash = `sha256:${'b'.repeat(64)}`
    const approvalId = (await db.query<{ id: string }>(
      `INSERT INTO approvals(
         workspace_id,session_id,requested_by_actor_id,approval_type,action_name,action_payload_sanitized,
         action_payload_hash,risk_level,rationale_summary,status,expires_at
       ) VALUES($1,$2,$3,'merge','provider.pull_request.merge',$4,$5,'high',
         'Exact head approved','approved',now()+interval '1 hour')
       RETURNING id`,
      [f.workspaceId, f.sessionId, f.agentActorId, { headSha: 'approved-head' }, canonicalHash],
    )).rows[0]!.id
    await db.query(
      `INSERT INTO merge_approval_bindings(
         approval_id,connection_id,repository_id,pull_request_id,provider_pull_request_id,
         head_sha,method,canonical_payload_hash
       ) VALUES($1,$2,$3,$4,'fake-pr-expired','approved-head','squash',$5)`,
      [approvalId, f.connectionId, f.repositoryId, pullRequestId, canonicalHash],
    )
    const actionId = (await db.query<{ id: string }>(
      `INSERT INTO provider_actions(
         workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,
         project_id,plan_step_id,kind,intent_key,payload,expected_head_sha,approval_id
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'merge_pull_request',$9,$10,'approved-head',$11)
       RETURNING id`,
      [f.workspaceId, f.connectionId, f.repositoryId, f.agentActorId, f.sessionId, f.workItemId,
        f.projectId, f.planStepId, randomUUID(),
        { pullRequestId: 'fake-pr-expired', headSha: 'approved-head', method: 'squash' }, approvalId],
    )).rows[0]!.id
    await db.query(
      "UPDATE approvals SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1",
      [approvalId],
    )
    const providerState = new FakeGitProvider()
    providerState.seedRepository(f.connectionId, '9001', 'main', 'base')
    providerState.branches.set(`${f.connectionId}:9001:workmesh/DEL-1-expired`, {
      name: 'workmesh/DEL-1-expired',
      headSha: 'approved-head',
    })
    providerState.pullRequests.set(`${f.connectionId}:9001:fake-pr-expired`, {
      id: 'fake-pr-expired', number: 9, uri: 'https://example.test/pull/9',
      baseBranch: 'main', headBranch: 'workmesh/DEL-1-expired', baseSha: 'base',
      headSha: 'approved-head', state: 'open', draft: false,
    })
    const observed = observeProviderMerges(providerState)
    const worker = createProviderActionWorker({
      db,
      resolveProvider: () => observed.provider,
      workerId: 'expired-approval-worker',
    })
    await worker.tick()
    expect(observed.mergeCalls()).toBe(0)
    expect((await db.query('SELECT status,last_error FROM provider_actions WHERE id=$1', [actionId])).rows[0])
      .toEqual({ status: 'dead', last_error: 'MERGE_APPROVAL_EXPIRED' })
    expect((await db.query('SELECT status,consumed_at FROM approvals WHERE id=$1', [approvalId])).rows[0])
      .toEqual({ status: 'expired', consumed_at: null })
    expect((await db.query('SELECT invalidation_reason FROM merge_approval_bindings WHERE approval_id=$1', [approvalId])).rows[0])
      .toEqual({ invalidation_reason: 'approval expired before provider merge' })
    expect((await db.query(
      `SELECT 1 FROM domain_events e JOIN outbox_events o ON o.domain_event_id=e.id
        WHERE e.aggregate_id=$1 AND e.event_type='pull_request.merge_approval.invalidated'`,
      [actionId],
    )).rowCount).toBe(1)
  })

  it('invalidates exact-head authority and terminally fails when the live provider head drifts', async () => {
    const f = await fixture()
    const humanActorId = (await db.query<{ id: string }>(
      "INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,'human','admin',$2,'Human','hash') RETURNING id",
      [f.workspaceId, `${randomUUID()}@example.test`],
    )).rows[0]!.id
    const agentActorId = (await db.query<{ id: string }>(
      "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Agent') RETURNING id",
      [f.workspaceId],
    )).rows[0]!.id
    const statusId = (await db.query<{ id: string }>(
      "INSERT INTO workflow_states(workspace_id,team_id,name,category) VALUES($1,$2,'Ready','planned') RETURNING id",
      [f.workspaceId, f.teamId],
    )).rows[0]!.id
    const workItemId = (await db.query<{ id: string }>(
      `INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id)
       VALUES($1,$2,1,'Merge drift',$3,$4) RETURNING id`,
      [f.workspaceId, f.teamId, statusId, humanActorId],
    )).rows[0]!.id
    const agentId = (await db.query<{ id: string }>(
      `INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,requested_capabilities,approved_capabilities)
       VALUES($1,$2,$3,'Agent',$4,$4) RETURNING id`,
      [f.workspaceId, agentActorId, `agent-${randomUUID()}`, ['repo:merge']],
    )).rows[0]!.id
    const delegationId = (await db.query<{ id: string }>(
      `INSERT INTO delegations(
         workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,
         role,scope_type,scope_id,permissions_snapshot,capability_scope
       ) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6,$7,$8) RETURNING id`,
      [f.workspaceId, f.teamId, agentId, agentActorId, humanActorId, workItemId, ['repo:merge'], { workspaceId: f.workspaceId }],
    )).rows[0]!.id
    const sessionId = (await db.query<{ id: string }>(
      `INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state)
       VALUES($1,$2,$3,$4,$5,$6,'executing') RETURNING id`,
      [f.workspaceId, f.teamId, agentId, agentActorId, delegationId, workItemId],
    )).rows[0]!.id
    const pullRequestId = (await db.query<{ id: string }>(
      `INSERT INTO pull_request_projections(
         workspace_id,repository_id,external_id,number,uri,work_item_id,session_id,producer_actor_id,
         base_branch,head_branch,base_sha,head_sha,state,draft
       ) VALUES($1,$2,'fake-pr-1',1,'https://example.test/pull/1',$3,$4,$5,'main','workmesh/DEL-1-drift','base','approved-head','open',false)
       RETURNING id`,
      [f.workspaceId, f.repositoryId, workItemId, sessionId, agentActorId],
    )).rows[0]!.id
    const approvalId = (await db.query<{ id: string }>(
      `INSERT INTO approvals(
         workspace_id,session_id,requested_by_actor_id,approval_type,action_name,action_payload_sanitized,
         action_payload_hash,risk_level,rationale_summary,status,expires_at
       ) VALUES($1,$2,$3,'merge','provider.pull_request.merge',$4,$5,'high','Exact head approved','approved',now()+interval '1 hour')
       RETURNING id`,
      [f.workspaceId, sessionId, agentActorId, { headSha: 'approved-head' }, `sha256:${'a'.repeat(64)}`],
    )).rows[0]!.id
    await db.query(
      `INSERT INTO merge_approval_bindings(
         approval_id,connection_id,repository_id,pull_request_id,provider_pull_request_id,head_sha,method,canonical_payload_hash
       ) VALUES($1,$2,$3,$4,'fake-pr-1','approved-head','squash',$5)`,
      [approvalId, f.connectionId, f.repositoryId, pullRequestId, `sha256:${'b'.repeat(64)}`],
    )
    const actionId = (await db.query<{ id: string }>(
      `INSERT INTO provider_actions(
         workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,
         kind,intent_key,payload,expected_head_sha,approval_id
       ) VALUES($1,$2,$3,$4,$5,$6,'merge_pull_request',$7,$8,'approved-head',$9) RETURNING id`,
      [f.workspaceId, f.connectionId, f.repositoryId, agentActorId, sessionId, workItemId, randomUUID(),
        { pullRequestId: 'fake-pr-1', headSha: 'approved-head', method: 'squash' }, approvalId],
    )).rows[0]!.id
    const drifted = new FakeGitProvider()
    drifted.seedRepository(f.connectionId, '9001', 'main', 'base')
    drifted.branches.set(`${f.connectionId}:9001:workmesh/DEL-1-drift`, { name: 'workmesh/DEL-1-drift', headSha: 'live-head' })
    drifted.pullRequests.set(`${f.connectionId}:9001:fake-pr-1`, {
      id: 'fake-pr-1', number: 1, uri: 'https://example.test/pull/1',
      baseBranch: 'main', headBranch: 'workmesh/DEL-1-drift', baseSha: 'base',
      headSha: 'approved-head', state: 'open', draft: false,
    })
    const worker = createProviderActionWorker({ db, resolveProvider: () => drifted, workerId: 'head-drift-worker' })
    const action = await worker.claimAction()
    expect(action?.id).toBe(actionId)
    await worker.executeAction(action!)
    expect((await db.query('SELECT status,last_error FROM provider_actions WHERE id=$1', [actionId])).rows[0])
      .toEqual({ status: 'dead', last_error: 'PROVIDER_HEAD_SHA_MISMATCH' })
    expect((await db.query('SELECT status FROM approvals WHERE id=$1', [approvalId])).rows[0]).toEqual({ status: 'canceled' })
    expect((await db.query('SELECT invalidation_reason FROM merge_approval_bindings WHERE approval_id=$1', [approvalId])).rows[0])
      .toEqual({ invalidation_reason: 'live provider head changed' })
    expect((await db.query(
      "SELECT 1 FROM domain_events e JOIN outbox_events o ON o.domain_event_id=e.id WHERE e.aggregate_id=$1 AND e.event_type='pull_request.merge_approval.invalidated'",
      [actionId],
    )).rowCount).toBe(1)
  })
})
