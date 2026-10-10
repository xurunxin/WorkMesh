import { createHash, randomUUID, generateKeyPairSync } from 'node:crypto'
import {createServer} from 'node:http'
import {once} from 'node:events'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, lockAgentAuthorityPlan } from '@workmesh/db'
import { FakeGitProvider, GitHubAppProvider, type GitProvider } from '@workmesh/git-provider'
import {canonicalActionApprovalPayload,canonicalMergeApprovalPayload} from '@workmesh/domain'
import { createProviderActionWorker } from '../src/provider-actions.js'
import { createArtifactUploadWorker } from '../src/artifact-uploads.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Stage 3 worker integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Stage 3 worker integration requires a dedicated *test* database.')
const db = createDb(databaseUrl)
const fake = new FakeGitProvider()

async function recordAuthorityWait(blockerPid:number,label:string) {
  const waiting=(await db.query('SELECT pid,pg_blocking_pids(pid) AS blockers,wait_event_type,wait_event,clock_timestamp() AS observed_at FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[blockerPid])).rows
  const pids=[blockerPid,...waiting.map(row=>row.pid as number)]
  const locks=(await db.query('SELECT pid,locktype,mode,granted,relation::regclass::text AS relation FROM pg_locks WHERE pid=ANY($1::int[]) ORDER BY pid,locktype,mode',[pids])).rows
  expect(waiting.length).toBeGreaterThan(0)
  console.info(JSON.stringify({m3AuthorityWait:{label,blockerPid,waiting,locks}}))
}
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
type ReviewerFixture = { actorId: string; sessionId: string }

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

async function createReviewerFixture(f: OpenPullRequestFixture): Promise<ReviewerFixture> {
  const actorId = (await db.query<{ id: string }>(
    "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Independent reviewer') RETURNING id",
    [f.workspaceId],
  )).rows[0]!.id
  const capabilities = ['artifact:write', 'repo:read']
  const agentId = (await db.query<{ id: string }>(
    `INSERT INTO agent_definitions(
       workspace_id,actor_id,slug,display_name,requested_capabilities,approved_capabilities)
     VALUES($1,$2,$3,'Independent reviewer',$4,$4) RETURNING id`,
    [f.workspaceId, actorId, `reviewer-${randomUUID()}`, capabilities],
  )).rows[0]!.id
  const delegationId = (await db.query<{ id: string }>(
    `INSERT INTO delegations(
       workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,
       role,scope_type,scope_id,permissions_snapshot,capability_scope)
     VALUES($1,$2,$3,$4,$5,$6,'reviewer','work_item',$6,$7,$8) RETURNING id`,
    [f.workspaceId, f.teamId, agentId, actorId, f.humanId, f.workItemId, capabilities,
      {
        workspaceId: f.workspaceId,
        teamIds: [f.teamId],
        projectIds: [f.projectId],
        workItemIds: [f.workItemId],
        repositoryIds: [f.repositoryId],
      }],
  )).rows[0]!.id
  await db.query(
    `INSERT INTO agent_team_access(
       workspace_id,agent_id,team_id,granted_by_actor_id,approved_capabilities)
     VALUES($1,$2,$3,$4,$5)`,
    [f.workspaceId, agentId, f.teamId, f.humanId, capabilities],
  )
  const sessionId = (await db.query<{ id: string }>(
    `INSERT INTO agent_sessions(
       workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state)
     VALUES($1,$2,$3,$4,$5,$6,'executing') RETURNING id`,
    [f.workspaceId, f.teamId, agentId, actorId, delegationId, f.workItemId],
  )).rows[0]!.id
  return { actorId, sessionId }
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

async function approvedActionFixture(kind:'merge_pull_request'|'retry_ci_check') {
  const f=await openPullRequestFixture(await fixture())
  await db.query('DELETE FROM provider_actions WHERE id=$1',[f.actionId])
  await db.query("UPDATE delegations SET permissions_snapshot=array_append(permissions_snapshot,'ci:run') WHERE id=$1",[f.delegationId])
  await db.query("UPDATE agent_definitions SET requested_capabilities=array_append(requested_capabilities,'ci:run'),approved_capabilities=array_append(approved_capabilities,'ci:run') WHERE id=$1",[f.agentId])
  await db.query("UPDATE agent_team_access SET approved_capabilities=array_append(approved_capabilities,'ci:run') WHERE agent_id=$1",[f.agentId])
  await db.query(`INSERT INTO repository_contexts(workspace_id,repository_id,work_item_id,base_branch,base_sha,branch_pattern,allowed_paths,permissions,guidance_manifest_hash,created_by_actor_id)
    SELECT workspace_id,repository_id,work_item_id,base_branch,base_sha,branch_pattern,allowed_paths,array_append(permissions,'ci'),guidance_manifest_hash,created_by_actor_id
    FROM repository_contexts WHERE repository_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1`,[f.repositoryId])
  const pr=(await db.query<{id:string}>(`INSERT INTO pull_request_projections(workspace_id,repository_id,external_id,number,uri,work_item_id,session_id,producer_actor_id,base_branch,head_branch,base_sha,head_sha,state,draft)
    VALUES($1,$2,'71',71,'https://example.test/71',$3,$4,$5,'main','workmesh/DEL-1-recovery','base','head','open',false) RETURNING id`,[f.workspaceId,f.repositoryId,f.workItemId,f.sessionId,f.agentActorId])).rows[0]!.id
  await db.query("INSERT INTO ci_check_projections(pull_request_id,external_id,name,status,head_sha) VALUES($1,'42','test','failed','head')",[pr])
  const payload=kind==='retry_ci_check'
    ? {provider:'github' as const,connectionId:f.connectionId,repositoryId:f.repositoryId,pullRequestId:pr,checkRunId:'42',headSha:'head'}
    : {provider:'github' as const,connectionId:f.connectionId,repositoryId:f.repositoryId,pullRequestId:'71',headSha:'head',method:'squash' as const}
  const canonical=kind==='retry_ci_check'?canonicalActionApprovalPayload(payload):canonicalMergeApprovalPayload(payload as Parameters<typeof canonicalMergeApprovalPayload>[0])
  const hash=`sha256:${createHash('sha256').update(canonical).digest('hex')}`
  const approval=(await db.query<{id:string}>(`INSERT INTO approvals(workspace_id,session_id,requested_by_actor_id,approval_type,action_name,action_payload_sanitized,action_payload_hash,risk_level,rationale_summary,status,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,'high','Exact-head guard fixture','approved',clock_timestamp()+interval '5 minutes') RETURNING id`,
    [f.workspaceId,f.sessionId,f.agentActorId,kind==='retry_ci_check'?'provider_action':'merge',kind==='retry_ci_check'?'provider.ci.retry':'provider.pull_request.merge',payload,hash])).rows[0]!.id
  if(kind==='merge_pull_request') {
    await db.query("UPDATE ci_check_projections SET status='passed' WHERE pull_request_id=$1",[pr])
    const reviewer=await createReviewerFixture(f)
    const artifact=(await db.query<{id:string}>(`INSERT INTO artifacts(workspace_id,session_id,work_item_id,producer_actor_id,type,title,checksum,source_tool,metadata)
      VALUES($1,$2,$3,$4,'code_review','Exact-head review',$5,'M3 lock fixture','{"source":"M3 lock fixture"}'::jsonb) RETURNING id`,[f.workspaceId,reviewer.sessionId,f.workItemId,reviewer.actorId,`sha256:${'f'.repeat(64)}`])).rows[0]!.id
    await db.query(`INSERT INTO structured_reviews(pull_request_id,reviewer_session_id,reviewer_actor_id,artifact_id,head_sha,verdict,summary,evidence,metadata)
      VALUES($1,$2,$3,$4,'head','approved','Current head','[]'::jsonb,'{}'::jsonb)`,[pr,reviewer.sessionId,reviewer.actorId,artifact])
    await db.query(`INSERT INTO merge_approval_bindings(approval_id,connection_id,repository_id,pull_request_id,provider_pull_request_id,head_sha,method,canonical_payload_hash)
      VALUES($1,$2,$3,$4,'71','head','squash',$5)`,[approval,f.connectionId,f.repositoryId,pr,hash])
  }
  const id=(await db.query<{id:string}>(`INSERT INTO provider_actions(workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,kind,intent_key,payload,expected_head_sha,approval_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'head',$10) RETURNING id`,[f.workspaceId,f.connectionId,f.repositoryId,f.agentActorId,f.sessionId,f.workItemId,kind,randomUUID(),payload,approval])).rows[0]!.id
  return {...f,actionId:id,pr,approval}
}

describe('Stage 3 provider webhook worker', () => {
  beforeAll(async () => { await applyMigrations(db) })
  beforeEach(async () => { await db.query('TRUNCATE workspaces CASCADE') })
  afterAll(async () => { await db.end() })

  it.each(['fake','github','gitea'] as const)('M3 %s所有五类无checkpoint旧领取停发，合法checkpoint本地恢复不构造provider',async provider=>{
    const f=await openPullRequestFixture(await fixture())
    await db.query("UPDATE provider_actions SET status='completed' WHERE id=$1",[f.actionId])
    await db.query('UPDATE provider_connections SET provider=$2 WHERE id=$1',[f.connectionId,provider])
    let accesses=0
    const worker=createProviderActionWorker({db,workerId:'same-generation-id',resolveProvider:()=>{accesses++;throw new Error('Must not resolve provider')}})
    for(const kind of ['create_branch','create_commit','open_pull_request','merge_pull_request','retry_ci_check']) {
      const id=(await db.query<{id:string}>(`INSERT INTO provider_actions(workspace_id,connection_id,repository_id,requested_by_actor_id,
        session_id,work_item_id,kind,intent_key,payload,attempt_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'{}',1) RETURNING id`,
        [f.workspaceId,f.connectionId,f.repositoryId,f.agentActorId,f.sessionId,f.workItemId,kind,randomUUID()])).rows[0]!.id
      await worker.tick()
      expect((await db.query('SELECT status,last_error,result FROM provider_actions WHERE id=$1',[id])).rows[0]).toEqual({status:'dead',last_error:'PROVIDER_ACTION_OUTCOME_UNKNOWN',result:null})
      expect((await db.query("SELECT count(*)::int AS n FROM domain_events WHERE aggregate_id=$1 AND event_type='provider.action.dead_lettered'",[id])).rows[0]).toEqual({n:1})
    }
    const id=(await db.query<{id:string}>(`INSERT INTO provider_actions(workspace_id,connection_id,repository_id,requested_by_actor_id,
      session_id,work_item_id,kind,intent_key,payload,result,attempt_count) VALUES($1,$2,$3,$4,$5,$6,'create_branch',$7,$8,$9,8) RETURNING id`,
      [f.workspaceId,f.connectionId,f.repositoryId,f.agentActorId,f.sessionId,f.workItemId,randomUUID(),{name:'exact',baseSha:'base'},{name:'exact',headSha:'base'}])).rows[0]!.id
    await worker.tick();await worker.tick()
    expect((await db.query('SELECT status,attempt_count FROM provider_actions WHERE id=$1',[id])).rows[0]).toEqual({status:'completed',attempt_count:8})
    expect(accesses).toBe(0)
  })

  it.each(['fake','github','gitea'] as const)('M3 %s逐kind合法checkpoint仅本地finish，纯读重领有界恢复',async provider=>{
    let accesses=0
    for(const kind of ['create_branch','create_commit','open_pull_request','merge_pull_request','retry_ci_check','resolve_repository_context'] as const) {
      const approved=kind==='merge_pull_request'||kind==='retry_ci_check'?await approvedActionFixture(kind):null
      const f=approved??await openPullRequestFixture(await fixture())
      await db.query('DELETE FROM provider_actions WHERE id=$1',[f.actionId])
      await db.query('UPDATE provider_connections SET provider=$2 WHERE id=$1',[f.connectionId,provider])
      const payload={name:'exact',baseSha:'base',branch:'exact',files:[{path:'src/exact.ts',content:'safe'}],baseBranch:'main',headBranch:'exact',pullRequestId:'71',headSha:'head',checkRunId:'43',workItemId:f.workItemId,branchPattern:'workmesh/{workItemKey}-{slug}',allowedPaths:['src/**'],permissions:['read']}
      const results:Record<typeof kind,Record<string,unknown>>={create_branch:{name:'exact',headSha:'base'},create_commit:{id:'commit',sha:'commit',branch:'exact',uri:'https://local.invalid/commit'},open_pull_request:{id:'checkpoint-pr',number:99,uri:'https://local.invalid/pr',baseBranch:'main',headBranch:'exact',baseSha:'base',headSha:'head',state:'open',draft:false},merge_pull_request:{merged:true,mergeSha:'merge'},retry_ci_check:{requested:true,checkRunId:'43'},resolve_repository_context:{guidance:[]}}
      const id=(await db.query<{id:string}>(`INSERT INTO provider_actions(workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,kind,intent_key,payload,result,attempt_count,approval_id,expected_head_sha)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,8,$11,'head') RETURNING id`,[f.workspaceId,f.connectionId,f.repositoryId,kind==='resolve_repository_context'?f.humanId:f.agentActorId,kind==='resolve_repository_context'?null:f.sessionId,f.workItemId,kind,randomUUID(),payload,results[kind],approved?.approval??null])).rows[0]!.id
      const worker=createProviderActionWorker({db,resolveProvider:()=>{accesses++;throw new Error('Checkpoint must not access provider')}})
      await worker.tick();await worker.tick()
      const invalid=provider==='gitea'&&kind==='retry_ci_check'
      expect((await db.query('SELECT status,attempt_count FROM provider_actions WHERE id=$1',[id])).rows[0]).toEqual({status:invalid?'dead':'completed',attempt_count:8})
      expect(accesses).toBe(0)
      if(kind==='resolve_repository_context') {
        // A pure GET action can retry after an old claim; no write adapter is used.
        const retry=(await db.query<{id:string}>(`INSERT INTO provider_actions(workspace_id,connection_id,repository_id,requested_by_actor_id,work_item_id,kind,intent_key,payload,attempt_count)
          VALUES($1,$2,$3,$4,$5,'resolve_repository_context',$6,$7,1) RETURNING id`,[f.workspaceId,f.connectionId,f.repositoryId,f.humanId,f.workItemId,randomUUID(),payload])).rows[0]!.id
        const reader=new FakeGitProvider();reader.seedRepository(f.connectionId,'9001','main','base')
        reader.seedRepositoryFiles(f.connectionId,'9001','base',{})
        let reads=0
        await createProviderActionWorker({db,resolveProvider:()=>{reads++;return reader}}).tick()
        expect(reads).toBe(1)
        expect((await db.query('SELECT status,attempt_count FROM provider_actions WHERE id=$1',[retry])).rows[0]).toEqual({status:'completed',attempt_count:2})
      }
    }
  })

  it('M3真实GitHub rerequest成功后checkpoint前崩溃，跨真实租期重领HTTP写次数仍为一',async()=>{
    const f=await openPullRequestFixture(await fixture())
    await db.query("UPDATE provider_actions SET status='completed' WHERE id=$1",[f.actionId])
    await db.query("UPDATE delegations SET permissions_snapshot=array_append(permissions_snapshot,'ci:run') WHERE id=$1",[f.delegationId])
    await db.query("UPDATE agent_definitions SET requested_capabilities=array_append(requested_capabilities,'ci:run'),approved_capabilities=array_append(approved_capabilities,'ci:run') WHERE id=$1",[f.agentId])
    await db.query("UPDATE agent_team_access SET approved_capabilities=array_append(approved_capabilities,'ci:run') WHERE agent_id=$1",[f.agentId])
    await db.query(`INSERT INTO repository_contexts(workspace_id,repository_id,work_item_id,base_branch,base_sha,branch_pattern,allowed_paths,permissions,guidance_manifest_hash,created_by_actor_id)
      SELECT workspace_id,repository_id,work_item_id,base_branch,base_sha,branch_pattern,allowed_paths,array_append(permissions,'ci'),guidance_manifest_hash,created_by_actor_id
      FROM repository_contexts WHERE repository_id=$1 ORDER BY created_at DESC LIMIT 1`,[f.repositoryId])
    const pr=(await db.query<{id:string}>(`INSERT INTO pull_request_projections(workspace_id,repository_id,external_id,number,uri,work_item_id,session_id,producer_actor_id,base_branch,head_branch,base_sha,head_sha,state,draft)
      VALUES($1,$2,'71',71,'https://example.test/71',$3,$4,$5,'main','workmesh/DEL-1-recovery','base','head','open',false) RETURNING id`,[f.workspaceId,f.repositoryId,f.workItemId,f.sessionId,f.agentActorId])).rows[0]!.id
    await db.query("INSERT INTO ci_check_projections(pull_request_id,external_id,name,status,head_sha) VALUES($1,'42','test','failed','head')",[pr])
    const payload={provider:'github',connectionId:f.connectionId,repositoryId:f.repositoryId,pullRequestId:pr,checkRunId:'42',headSha:'head'}
    const hash=`sha256:${createHash('sha256').update(canonicalActionApprovalPayload(payload)).digest('hex')}`
    const approval=(await db.query<{id:string}>(`INSERT INTO approvals(workspace_id,session_id,requested_by_actor_id,approval_type,action_name,action_payload_sanitized,action_payload_hash,risk_level,rationale_summary,status,expires_at)
      VALUES($1,$2,$3,'provider_action','provider.ci.retry',$4,$5,'medium','Exact check','approved',clock_timestamp()+interval '5 minutes') RETURNING id`,[f.workspaceId,f.sessionId,f.agentActorId,payload,hash])).rows[0]!.id
    const id=(await db.query<{id:string}>(`INSERT INTO provider_actions(workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,kind,intent_key,payload,expected_head_sha,approval_id)
      VALUES($1,$2,$3,$4,$5,$6,'retry_ci_check',$7,$8,'head',$9) RETURNING id`,[f.workspaceId,f.connectionId,f.repositoryId,f.agentActorId,f.sessionId,f.workItemId,randomUUID(),payload,approval])).rows[0]!.id
    const requests:string[]=[]
    const server=createServer((req,res)=>{requests.push(`${req.method}:${req.url}`);res.setHeader('content-type','application/json');res.end(req.url?.endsWith('/access_tokens')?JSON.stringify({token:'local-fixture',expires_at:new Date(Date.now()+3600000).toISOString()}):'{}')})
    server.listen(0,'127.0.0.1');await once(server,'listening')
    const key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString()
    const worker=()=>createProviderActionWorker({db,workerId:'reused-worker-id',resolveProvider:(_provider,_connection,guard)=>new GitHubAppProvider({appId:'1',installationId:'2',privateKey:key,apiBaseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}`,beforeMutation:guard})})
    try {
      const first=worker(),claim=(await first.claimAction())!
      expect(claim.id).toBe(id)
      process.env.PROVIDER_INJECT_FAILURE_AFTER_PROVIDER_SUCCESS='true'
      try {await expect(first.executeAction(claim)).rejects.toThrow('PROVIDER_INJECTED_FAILURE_AFTER_PROVIDER_SUCCESS')}
      finally {delete process.env.PROVIDER_INJECT_FAILURE_AFTER_PROVIDER_SUCCESS}
      expect(requests.filter(r=>r.endsWith('/rerequest'))).toHaveLength(1)
      // Real PostgreSQL clock and the original production lease; no timestamp mutation.
      while((await db.query<{active:boolean}>("SELECT claimed_at+interval '60 seconds'>clock_timestamp() AS active FROM provider_actions WHERE id=$1",[id])).rows[0]!.active)await new Promise(r=>setTimeout(r,250))
      const second=worker(),recovered=(await second.claimAction())!
      expect(recovered.attempt_count).toBe(2)
      console.info(JSON.stringify({m3UnknownRecovery:{kind:'retry_ci_check',claimedAt:claim.claimed_at,reclaimedAt:recovered.claimed_at,databaseClock:(await db.query('SELECT clock_timestamp() AS now')).rows[0],defaultLeaseSeconds:60,writesBeforeRecovery:requests.filter(r=>r.endsWith('/rerequest')).length}}))
      await second.executeAction(recovered)
      await expect(first.executeAction(claim)).rejects.toThrow('PROVIDER_ACTION_CLAIM_LOST')
      expect(requests.filter(r=>r.endsWith('/rerequest'))).toHaveLength(1)
      expect((await db.query('SELECT status,last_error FROM provider_actions WHERE id=$1',[id])).rows[0]).toEqual({status:'dead',last_error:'PROVIDER_ACTION_OUTCOME_UNKNOWN'})
    } finally {server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()))}
  },90000)

  it.each(['stop','revoke'] as const)('M3 %s事务先提交：观察真实锁等待，锁后重读拒绝零外发',async change=>{
    const f=await openPullRequestFixture(await fixture()),connection=await db.connect()
    const provider=new FakeGitProvider();provider.seedRepository(f.connectionId,'9001','main','base')
    provider.branches.set(`${f.connectionId}:9001:workmesh/DEL-1-recovery`,{name:'workmesh/DEL-1-recovery',headSha:'base'})
    let providerAccess=0
    const worker=createProviderActionWorker({db,workerId:'blocked-sender',resolveProvider:()=>{providerAccess++;return provider}})
    const action=(await worker.claimAction())!
    let running:Promise<void>|undefined
    try {
      await connection.query('BEGIN')
      await connection.query('SELECT id FROM workspaces WHERE id=$1 FOR KEY SHARE',[f.workspaceId])
      await lockAgentAuthorityPlan(connection,{definitionIds:[f.agentId],teamGrants:[{workspaceId:f.workspaceId,agentId:f.agentId,teamId:f.teamId}],delegationIds:[f.delegationId],sessionIds:[f.sessionId],workItemIds:[f.workItemId],projectIds:[f.projectId]})
      const pid=(await connection.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
      running=worker.executeAction(action)
      let observed=false
      for(let n=0;n<100;n++){
        observed=!!(await db.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rowCount
        if(observed)break
        await new Promise(r=>setTimeout(r,20))
      }
      expect(observed).toBe(true);expect(providerAccess).toBe(0)
      await recordAuthorityWait(pid,`${change}-commits-first`)
      if(change==='stop')await connection.query("UPDATE agent_sessions SET state='stopping' WHERE id=$1",[f.sessionId])
      else await connection.query("UPDATE delegations SET status='revoked',revoked_at=clock_timestamp(),revoked_by_actor_id=$2 WHERE id=$1",[f.delegationId,f.humanId])
      await connection.query('COMMIT');await running
      expect(providerAccess).toBe(0)
      expect((await db.query('SELECT status FROM provider_actions WHERE id=$1',[action.id])).rows[0]).toEqual({status:'dead'})
    } finally {await connection.query('ROLLBACK');connection.release();await running}
  })

  it.each(['stop','revoke','context'] as const)('M3发送许可先提交，%s在首个HTTP等待中提交，第二个仓库写零发送',async change=>{
    const f=await openPullRequestFixture(await fixture())
    await db.query("UPDATE provider_actions SET kind='create_commit',payload=$2,expected_head_sha='base' WHERE id=$1",[f.actionId,{branch:'workmesh/DEL-1-recovery',expectedHeadSha:'base',message:'Guard each write',files:[{path:'apps/test.ts',content:'one'}]}])
    let releaseFirst:()=>void=()=>{},receivedFirst:()=>void=()=>{}
    const firstReceived=new Promise<void>(r=>{receivedFirst=r}),firstReleased=new Promise<void>(r=>{releaseFirst=r})
    const writes:string[]=[]
    const server=createServer(async(req,res)=>{
      res.setHeader('content-type','application/json')
      if(req.url?.endsWith('/access_tokens')){res.end(JSON.stringify({token:'local-fixture',expires_at:new Date(Date.now()+3600000).toISOString()}));return}
      if(req.method==='GET'){res.end(JSON.stringify(req.url?.includes('/ref/')?{object:{sha:'base'}}:{tree:{sha:'base-tree'}}));return}
      writes.push(`${req.method}:${req.url}`);receivedFirst();await firstReleased;res.end(JSON.stringify({sha:'new-tree'}))
    })
    server.listen(0,'127.0.0.1');await once(server,'listening')
    const key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString()
    const worker=createProviderActionWorker({db,workerId:'multi-http-sender',resolveProvider:(_p,_c,guard)=>new GitHubAppProvider({appId:'1',installationId:'2',privateKey:key,apiBaseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}`,beforeMutation:guard})})
    const action=(await worker.claimAction())!,running=worker.executeAction(action).catch(async error=>{
      expect((error as Error).message).toBe('PROVIDER_ACTION_AUTHORITY_REVOKED');await worker.failAction(action,error)
    })
    const blocker=await db.connect()
    try {
      await Promise.race([firstReceived,new Promise<never>((_r,j)=>setTimeout(()=>j(new Error('First HTTP not received')),10000))])
      await blocker.query('BEGIN')
      await lockAgentAuthorityPlan(blocker,{definitionIds:[f.agentId],teamGrants:[{workspaceId:f.workspaceId,agentId:f.agentId,teamId:f.teamId}],delegationIds:[f.delegationId],sessionIds:[f.sessionId],workItemIds:[f.workItemId],projectIds:[f.projectId]})
      if(change==='stop')await blocker.query("UPDATE agent_sessions SET state='stopping' WHERE id=$1",[f.sessionId])
      else if(change==='revoke') await blocker.query("UPDATE delegations SET status='revoked',revoked_at=clock_timestamp(),revoked_by_actor_id=$2 WHERE id=$1",[f.delegationId,f.humanId])
      else {
        await blocker.query('SELECT id FROM repositories WHERE id=$1 FOR UPDATE',[f.repositoryId])
        await blocker.query(`INSERT INTO repository_contexts(workspace_id,repository_id,work_item_id,base_branch,base_sha,branch_pattern,allowed_paths,permissions,guidance_manifest_hash,created_by_actor_id)
          SELECT workspace_id,repository_id,work_item_id,base_branch,base_sha,'private/{slug}',allowed_paths,permissions,guidance_manifest_hash,created_by_actor_id
          FROM repository_contexts WHERE repository_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1`,[f.repositoryId])
        const pid=(await blocker.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
        releaseFirst()
        let waiting=false
        for(let n=0;n<100;n++) {
          waiting=!!(await db.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rowCount
          if(waiting)break
          await new Promise(r=>setTimeout(r,20))
        }
        expect(waiting).toBe(true);expect(writes).toHaveLength(1)
        await recordAuthorityWait(pid,'first-tree-permitted-context-before-second-write')
      }
      await blocker.query('COMMIT');releaseFirst();await running
      expect(writes).toHaveLength(1);expect(writes[0]).toContain('/git/trees')
      expect((await db.query('SELECT status,last_error FROM provider_actions WHERE id=$1',[action.id])).rows[0]).toEqual({status:'dead',last_error:'PROVIDER_ACTION_OUTCOME_UNKNOWN'})
    } finally {releaseFirst();await blocker.query('ROLLBACK');blocker.release();await running;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
  },20000)

  it('M3逐次发送事务持authority锁时Stop实际阻塞，许可先提交仅当前tree在途随后写拒绝',async()=>{
    const f=await openPullRequestFixture(await fixture())
    await db.query("UPDATE provider_actions SET kind='create_commit',payload=$2,expected_head_sha='base' WHERE id=$1",[f.actionId,{branch:'workmesh/DEL-1-recovery',expectedHeadSha:'base',message:'Permit then Stop',files:[{path:'apps/test.ts',content:'one'}]}])
    let tokenReady:()=>void=()=>{},releaseToken:()=>void=()=>{},firstReady:()=>void=()=>{},releaseFirst:()=>void=()=>{}
    const tokenReceived=new Promise<void>(r=>{tokenReady=r}),tokenReleased=new Promise<void>(r=>{releaseToken=r})
    const firstReceived=new Promise<void>(r=>{firstReady=r}),firstReleased=new Promise<void>(r=>{releaseFirst=r})
    const writes:string[]=[]
    const server=createServer(async(req,res)=>{
      res.setHeader('content-type','application/json')
      if(req.url?.endsWith('/access_tokens')){tokenReady();await tokenReleased;res.end(JSON.stringify({token:'local-fixture',expires_at:new Date(Date.now()+3600000).toISOString()}));return}
      if(req.method==='GET'){res.end(JSON.stringify(req.url?.includes('/ref/')?{object:{sha:'base'}}:{tree:{sha:'base-tree'}}));return}
      writes.push(`${req.method}:${req.url}`);firstReady();await firstReleased;res.end(JSON.stringify({sha:'new-tree'}))
    })
    server.listen(0,'127.0.0.1');await once(server,'listening')
    const key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString()
    const worker=createProviderActionWorker({db,workerId:'permit-before-stop',resolveProvider:(_p,_c,guard)=>new GitHubAppProvider({appId:'1',installationId:'2',privateKey:key,apiBaseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}`,beforeMutation:guard})})
    const claim=(await worker.claimAction())!,lateLock=await db.connect(),stop=await db.connect()
    const running=worker.executeAction(claim).catch(async error=>{expect((error as Error).message).toBe('PROVIDER_ACTION_AUTHORITY_REVOKED');await worker.failAction(claim,error)})
    let stopping:Promise<void>|undefined
    try {
      await tokenReceived
      // Park the per-HTTP transaction at its last-ranked action row, after it
      // owns authority. This is an observed PostgreSQL wait, not a time delay.
      await lateLock.query('BEGIN');await lateLock.query('SELECT id FROM provider_actions WHERE id=$1 FOR UPDATE',[claim.id])
      const blocker=(await lateLock.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
      releaseToken()
      let senderPid:number|undefined
      for(let n=0;n<100;n++){
        senderPid=(await db.query<{pid:number}>('SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[blocker])).rows[0]?.pid
        if(senderPid)break
        await new Promise(r=>setTimeout(r,20))
      }
      expect(senderPid).toBeTruthy();await recordAuthorityWait(blocker,'per-http-sender-holds-authority')
      stopping=(async()=>{
        await stop.query('BEGIN');await stop.query('SELECT id FROM workspaces WHERE id=$1 FOR KEY SHARE',[f.workspaceId])
        await lockAgentAuthorityPlan(stop,{definitionIds:[f.agentId],teamGrants:[{workspaceId:f.workspaceId,agentId:f.agentId,teamId:f.teamId}],delegationIds:[f.delegationId],sessionIds:[f.sessionId],workItemIds:[f.workItemId],projectIds:[f.projectId]})
        await stop.query("UPDATE agent_sessions SET state='stopping' WHERE id=$1",[f.sessionId]);await stop.query('COMMIT')
      })()
      let observed=false
      for(let n=0;n<100;n++){
        observed=!!(await db.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[senderPid])).rowCount
        if(observed)break
        await new Promise(r=>setTimeout(r,20))
      }
      expect(observed).toBe(true);expect(writes).toEqual([]);await recordAuthorityWait(senderPid!,'stop-waits-for-per-http-authority-commit')
      await lateLock.query('COMMIT');await firstReceived;await stopping
      expect(writes).toHaveLength(1);expect(writes[0]).toContain('/git/trees')
      releaseFirst();await running
      expect(writes).toHaveLength(1)
      expect((await db.query('SELECT status,last_error FROM provider_actions WHERE id=$1',[claim.id])).rows[0]).toEqual({status:'dead',last_error:'PROVIDER_ACTION_OUTCOME_UNKNOWN'})
    } finally {releaseToken();releaseFirst();await lateLock.query('ROLLBACK');await stopping;await running;await stop.query('ROLLBACK');lateLock.release();stop.release();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
  },20000)

  it.each(['merge_pull_request','retry_ci_check'] as const)('M3 %s合法准入后pin收窄先提交，每次HTTP guard锁后拒绝',async kind=>{
    for(const scope of ['branch','base'] as const) {
      const f=await approvedActionFixture(kind)
      let tokenReady:()=>void=()=>{},releaseToken:()=>void=()=>{}
      const ready=new Promise<void>(r=>{tokenReady=r}),released=new Promise<void>(r=>{releaseToken=r})
      const writes:string[]=[]
      const server=createServer(async(req,res)=>{
        res.setHeader('content-type','application/json')
        if(req.url?.endsWith('/access_tokens')){tokenReady();await released;res.end(JSON.stringify({token:'local-fixture',expires_at:new Date(Date.now()+3600000).toISOString()}));return}
        if(req.method!=='GET')writes.push(`${req.method}:${req.url}`)
        res.end(JSON.stringify({id:71,number:71,html_url:'https://example.test/71',state:'open',draft:false,merged:false,base:{ref:'main',sha:'base'},head:{ref:'workmesh/DEL-1-recovery',sha:'head'}}))
      })
      server.listen(0,'127.0.0.1');await once(server,'listening')
      const key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString()
      const worker=createProviderActionWorker({db,workerId:'pin-window',resolveProvider:(_p,_c,guard)=>new GitHubAppProvider({appId:'1',installationId:'2',privateKey:key,apiBaseUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}`,beforeMutation:guard})})
      const action=(await worker.claimAction())!,running=worker.executeAction(action).catch(async error=>{
        expect((error as Error).message).toBe('PROVIDER_ACTION_AUTHORITY_REVOKED');await worker.failAction(action,error)
      })
      const blocker=await db.connect()
      try {
        await Promise.race([ready,new Promise<never>((_r,j)=>setTimeout(()=>j(new Error('Initial gate did not admit')),10000))])
        await blocker.query('BEGIN')
        await blocker.query('SELECT id FROM workspaces WHERE id=$1 FOR KEY SHARE',[f.workspaceId])
        await lockAgentAuthorityPlan(blocker,{definitionIds:[f.agentId],teamGrants:[{workspaceId:f.workspaceId,agentId:f.agentId,teamId:f.teamId}],delegationIds:[f.delegationId],sessionIds:[f.sessionId],workItemIds:[f.workItemId],projectIds:[f.projectId]})
        await blocker.query('SELECT id FROM repositories WHERE id=$1 FOR UPDATE',[f.repositoryId])
        await blocker.query(`INSERT INTO repository_contexts(workspace_id,repository_id,work_item_id,base_branch,base_sha,branch_pattern,allowed_paths,permissions,guidance_manifest_hash,created_by_actor_id)
          SELECT workspace_id,repository_id,work_item_id,$2,base_sha,$3,allowed_paths,permissions,guidance_manifest_hash,created_by_actor_id
          FROM repository_contexts WHERE repository_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1`,[f.repositoryId,scope==='base'?'release':'main',scope==='branch'?'private/{slug}':'workmesh/{workItemKey}-{slug}'])
        const pid=(await blocker.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
        releaseToken()
        let waiting=false
        for(let n=0;n<100;n++) {
          waiting=!!(await db.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rowCount
          if(waiting)break
          await new Promise(r=>setTimeout(r,20))
        }
        expect(waiting).toBe(true);expect(writes).toEqual([])
        await recordAuthorityWait(pid,`${kind}-${scope}-pin-commits-first`)
        await blocker.query('COMMIT');await running
        expect(writes).toEqual([])
        expect((await db.query('SELECT status,last_error FROM provider_actions WHERE id=$1',[action.id])).rows[0]).toEqual({status:'dead',last_error:'PROVIDER_ACTION_AUTHORITY_REVOKED:REPOSITORY_GUIDANCE_INVALID'})
        expect((await db.query('SELECT status FROM approvals WHERE id=$1',[f.approval])).rows[0]).toEqual({status:'approved'})
      } finally {releaseToken();await blocker.query('ROLLBACK');blocker.release();await running;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}
    }
  },30000)

  it('M3同worker attempt上限饱和，真实租期重领由claimed_at防ABA且合法checkpoint仅本地完成',async()=>{
    const f=await openPullRequestFixture(await fixture())
    await db.query("UPDATE provider_actions SET kind='create_branch',payload=$2,result=$3,attempt_count=8 WHERE id=$1",[f.actionId,{name:'workmesh/DEL-1-capped',baseSha:'base'},{name:'workmesh/DEL-1-capped',headSha:'base'}])
    let accesses=0
    const worker=createProviderActionWorker({db,workerId:'same-worker-at-cap',resolveProvider:()=>{accesses++;throw new Error('Local checkpoint recovery only')}})
    const stale=(await worker.claimAction())!
    expect(stale.attempt_count).toBe(8)
    while((await db.query<{active:boolean}>("SELECT claimed_at+interval '60 seconds'>clock_timestamp() AS active FROM provider_actions WHERE id=$1",[f.actionId])).rows[0]!.active)await new Promise(r=>setTimeout(r,250))
    const current=(await worker.claimAction())!
    expect(current.attempt_count).toBe(8);expect(current.claimed_at.getTime()).toBeGreaterThan(stale.claimed_at.getTime())
    console.info(JSON.stringify({m3GenerationRecovery:{workerId:'same-worker-at-cap',stale:{attempt:stale.attempt_count,claimedAt:stale.claimed_at},current:{attempt:current.attempt_count,claimedAt:current.claimed_at},databaseClock:(await db.query('SELECT clock_timestamp() AS now')).rows[0],defaultLeaseSeconds:60}}))
    await expect(worker.executeAction(stale)).rejects.toThrow('PROVIDER_ACTION_CLAIM_LOST')
    await worker.failAction(stale,new Error('Stale failure must not overwrite new claim'))
    expect((await db.query('SELECT status,claimed_by FROM provider_actions WHERE id=$1',[f.actionId])).rows[0]).toEqual({status:'claimed',claimed_by:'same-worker-at-cap'})
    await worker.executeAction(current);expect(accesses).toBe(0)
    expect((await db.query('SELECT status,attempt_count,result FROM provider_actions WHERE id=$1',[f.actionId])).rows[0]).toEqual({status:'completed',attempt_count:8,result:{name:'workmesh/DEL-1-capped',headSha:'base'}})
  },90000)

  it('M3完整authority真实锁等待跨默认60秒，锁后租期拒绝且无provider构造或外发',async()=>{
    const f=await openPullRequestFixture(await fixture()),blocker=await db.connect()
    let accesses=0
    const worker=createProviderActionWorker({db,workerId:'lease-lock-wait',resolveProvider:()=>{accesses++;throw new Error('Expired claim must not construct provider')}})
    const claim=(await worker.claimAction())!
    let running:Promise<void>|undefined
    try {
      await blocker.query('BEGIN')
      await blocker.query('SELECT id FROM workspaces WHERE id=$1 FOR KEY SHARE',[f.workspaceId])
      await lockAgentAuthorityPlan(blocker,{definitionIds:[f.agentId],teamGrants:[{workspaceId:f.workspaceId,agentId:f.agentId,teamId:f.teamId}],delegationIds:[f.delegationId],sessionIds:[f.sessionId],workItemIds:[f.workItemId],projectIds:[f.projectId]})
      const pid=(await blocker.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
      running=worker.executeAction(claim).catch(async error=>{
        expect((error as Error).message).toBe('PROVIDER_ACTION_CLAIM_EXPIRED');await worker.failAction(claim,error)
      })
      let observed=false
      for(let n=0;n<100;n++){
        observed=!!(await db.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rowCount
        if(observed)break
        await new Promise(r=>setTimeout(r,20))
      }
      expect(observed).toBe(true);await recordAuthorityWait(pid,'lease-live-before-real-lock-wait')
      while((await db.query<{active:boolean}>("SELECT claimed_at+interval '60 seconds'>clock_timestamp() AS active FROM provider_actions WHERE id=$1",[claim.id])).rows[0]!.active)await new Promise(r=>setTimeout(r,250))
      await recordAuthorityWait(pid,'lease-expired-still-blocked')
      expect(accesses).toBe(0);await blocker.query('COMMIT');await running
      expect(accesses).toBe(0)
      expect((await db.query('SELECT status,last_error FROM provider_actions WHERE id=$1',[claim.id])).rows[0]).toEqual({status:'dead',last_error:'PROVIDER_ACTION_OUTCOME_UNKNOWN'})
    } finally {await blocker.query('ROLLBACK');blocker.release();await running}
  },90000)

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

  it('revalidates the provider allowlist before every provider access and never revives rejected actions', async () => {
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
        status: 'dead',
        attempt_count: 1,
        claimed_by: null,
        last_error: expect.stringMatching(/^PROVIDER_ACTION_AUTHORITY_REVOKED:/),
      })
    }
    const branchName = 'workmesh/DEL-1-provider-toggle'
    let branchActionId = (await db.query<{ id: string }>(
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
    )).rowCount).toBe(1)

    await db.query("UPDATE provider_connections SET provider='github' WHERE id=$1", [f.connectionId])
    const rejectedBranchId=branchActionId
    // Privileged test seed of a distinct intent after configuration recovery;
    // never reduce attempt_count or revive the rejected action.
    branchActionId=(await db.query<{id:string}>(`INSERT INTO provider_actions(workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,project_id,plan_step_id,kind,intent_key,payload)
      SELECT workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,project_id,plan_step_id,kind,$2,payload FROM provider_actions WHERE id=$1 RETURNING id`,[rejectedBranchId,randomUUID()])).rows[0]!.id
    expect(branchActionId).not.toBe(rejectedBranchId)
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
    )).rowCount).toBe(2)
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
    process.env.PROVIDER_INJECT_FAILURE_AFTER_RESULT_CHECKPOINT='true'
    try {await expect(crashedWorker.executeAction(crashedAction)).rejects.toThrow('PROVIDER_INJECTED_FAILURE_AFTER_RESULT_CHECKPOINT')}
    finally {delete process.env.PROVIDER_INJECT_FAILURE_AFTER_RESULT_CHECKPOINT}
    const opened=(await db.query<{result:{id:string;number:number;uri:string;baseBranch:string;headBranch:string;baseSha:string;headSha:string}}>('SELECT result FROM provider_actions WHERE id=$1',[f.actionId])).rows[0]!.result
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

    const reviewer = await createReviewerFixture(f)
    const reviewArtifactId = (await db.query<{ id: string }>(
      `INSERT INTO artifacts(
         workspace_id,session_id,work_item_id,producer_actor_id,type,title,checksum,source_tool,metadata)
       VALUES($1,$2,$3,$4,'code_review','Independent recovered-head review',$5,
         'integration-reviewer','{"source":"worker-integration"}'::jsonb)
       RETURNING id`,
      [f.workspaceId, reviewer.sessionId, f.workItemId, reviewer.actorId, `sha256:${'d'.repeat(64)}`],
    )).rows[0]!.id
    await db.query(
      `INSERT INTO structured_reviews(
         pull_request_id,reviewer_session_id,reviewer_actor_id,artifact_id,head_sha,
         verdict,summary,evidence,metadata)
       VALUES($1,$2,$3,$4,$5,'approved','Independent recovered-head approval','[]'::jsonb,'{}'::jsonb)`,
      [reconciled.id, reviewer.sessionId, reviewer.actorId, reviewArtifactId, opened.headSha],
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

  it('stops an unproven provider-merged webhook race after a crash without a second merge', async () => {
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
    const reviewer = await createReviewerFixture(f)
    const reviewArtifactId = (await db.query<{ id: string }>(
      `INSERT INTO artifacts(
         workspace_id,session_id,work_item_id,producer_actor_id,type,title,checksum,source_tool,metadata)
       VALUES($1,$2,$3,$4,'code_review','Independent current-head review',$5,
         'integration-reviewer','{"source":"worker-integration"}'::jsonb)
       RETURNING id`,
      [f.workspaceId, reviewer.sessionId, f.workItemId, reviewer.actorId, `sha256:${'f'.repeat(64)}`],
    )).rows[0]!.id
    await db.query(
      `INSERT INTO structured_reviews(
         pull_request_id,reviewer_session_id,reviewer_actor_id,artifact_id,head_sha,
         verdict,summary,evidence,metadata)
       VALUES($1,$2,$3,$4,'race-head','approved','Independent approval','[]'::jsonb,'{}'::jsonb)`,
      [pullRequestId, reviewer.sessionId, reviewer.actorId, reviewArtifactId],
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
        status: 'dead',
        result: null,
      })
    const approval = (await db.query<{ status: string; consumed_at: Date | null }>(
      'SELECT status,consumed_at FROM approvals WHERE id=$1',
      [approvalId],
    )).rows[0]!
    expect(approval.status).toBe('approved')
    expect(approval.consumed_at).toBeNull()
    expect((await db.query(
      'SELECT count(*)::int AS count FROM completion_suggestions WHERE pull_request_id=$1',
      [pullRequestId],
    )).rows[0]).toEqual({ count: 0 })
    expect((await db.query(
      `SELECT count(*)::int AS count FROM domain_events e
        JOIN outbox_events o ON o.domain_event_id=e.id
       WHERE e.aggregate_id=$1 AND e.event_type='pull_request.merged'`,
      [actionId],
    )).rows[0]).toEqual({ count: 0 })
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
    const f = await openPullRequestFixture(await fixture())
    await db.query('DELETE FROM provider_actions WHERE id=$1',[f.actionId])
    const {sessionId,agentActorId,workItemId}=f
    const pullRequestId = (await db.query<{ id: string }>(
      `INSERT INTO pull_request_projections(
         workspace_id,repository_id,external_id,number,uri,work_item_id,session_id,producer_actor_id,
         base_branch,head_branch,base_sha,head_sha,state,draft
       ) VALUES($1,$2,'fake-pr-1',1,'https://example.test/pull/1',$3,$4,$5,'main','workmesh/DEL-1-drift','base','approved-head','open',false)
       RETURNING id`,
      [f.workspaceId, f.repositoryId, workItemId, sessionId, agentActorId],
    )).rows[0]!.id
    const reviewer=await createReviewerFixture(f)
    const artifactId=(await db.query<{id:string}>(`INSERT INTO artifacts(
      workspace_id,session_id,work_item_id,producer_actor_id,type,title,uri,checksum,source_tool,metadata)
      VALUES($1,$2,$3,$4,'code_review','Independent exact-head review','https://example.test/review',$5,'worker-test','{}'::jsonb) RETURNING id`,
      [f.workspaceId,reviewer.sessionId,workItemId,reviewer.actorId,`sha256:${'d'.repeat(64)}`])).rows[0]!.id
    await db.query(`INSERT INTO structured_reviews(pull_request_id,reviewer_session_id,reviewer_actor_id,artifact_id,head_sha,verdict,summary,evidence,metadata)
      VALUES($1,$2,$3,$4,'approved-head','approved','Reviewed exact head','[]'::jsonb,'{}'::jsonb)`,
      [pullRequestId,reviewer.sessionId,reviewer.actorId,artifactId])
    const approvalId = (await db.query<{ id: string }>(
      `INSERT INTO approvals(
         workspace_id,session_id,requested_by_actor_id,approval_type,action_name,action_payload_sanitized,
         action_payload_hash,risk_level,rationale_summary,status,expires_at
       ) VALUES($1,$2,$3,'merge','provider.pull_request.merge',$4,$5,'high','Exact head approved','approved',now()+interval '1 hour')
       RETURNING id`,
      [f.workspaceId, sessionId, agentActorId, { headSha: 'approved-head' }, `sha256:${'b'.repeat(64)}`],
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
