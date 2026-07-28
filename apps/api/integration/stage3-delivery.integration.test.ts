import { createHash, createHmac, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyMigrations, createDb } from '@workmesh/db'
import { FakeGitProvider } from '@workmesh/git-provider'
import { canonicalActionApprovalPayload, canonicalMergeApprovalPayload } from '@workmesh/domain'
import { buildApp } from '../src/server.js'
import { createProviderActionWorker } from '../../worker/src/provider-actions.js'
import { createArtifactUploadWorker } from '../../worker/src/artifact-uploads.js'
import { artifactStorageFromEnvironment } from '@workmesh/artifact-storage'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Stage 3 API integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Stage 3 API integration requires a dedicated *test* database.')
const db = createDb(databaseUrl)
const app = buildApp()
type Response = { statusCode: number; headers: Record<string, string | string[] | number | undefined>; json: <T>() => T }
type Human = { cookie: string; csrf: string; actorId: string }
type Agent = { id: string; token: string; sessionId: string }
type Fixture = { human: Human; workspaceId: string; teamId: string; projectId: string; workItemId: string; agent: Agent; connectionId: string; repositoryId: string }

const humanCall = async (human: Human, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object): Promise<Response> =>
  await app.inject({ method, url, payload, headers: { cookie: human.cookie, 'x-csrf-token': human.csrf, 'idempotency-key': randomUUID() } }) as unknown as Response
const agentCall = async (token: string, method: 'GET' | 'POST', url: string, payload?: object): Promise<Response> =>
  await app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() } }) as unknown as Response
const capabilities = ['work:read', 'work:write', 'artifact:write', 'repo:read', 'repo:write_branch', 'repo:open_pr', 'repo:merge', 'ci:run']

async function requestAndResolveContext(
  human: Human,
  repositoryId: string,
  input: {
    workItemId?: string
    projectId?: string
    sessionId?: string
    baseBranch: string
    baseSha: string
    branchPattern: string
    allowedPaths: string[]
    permissions: string[]
  },
): Promise<Response> {
  const response = await humanCall(human, 'POST', `/api/v1/repositories/${repositoryId}/context`, input)
  if (response.statusCode !== 200) return response
  const repository = (await db.query<{ connection_id: string; external_id: string }>(
    'SELECT connection_id,external_id FROM repositories WHERE id=$1',
    [repositoryId],
  )).rows[0]!
  const provider = new FakeGitProvider()
  provider.seedRepository(repository.connection_id, repository.external_id, input.baseBranch, input.baseSha)
  provider.seedRepositoryFiles(repository.connection_id, repository.external_id, input.baseSha, {
    'AGENTS.md': '# Root guidance\n',
    'apps/api/AGENTS.md': '# API guidance\n',
    'secret/AGENTS.md': '# Secret-path guidance\n',
  })
  const worker = createProviderActionWorker({ db, resolveProvider: () => provider, workerId: `context-${randomUUID()}` })
  await worker.tick()
  expect((await db.query<{ status: string }>('SELECT status FROM provider_actions WHERE id=$1', [
    response.json<{ id: string }>().id,
  ])).rows[0]?.status).toBe('completed')
  return response
}

async function createAgent(
  human: Human,
  workspaceId: string,
  teamId: string,
  workItemId: string,
  suffix: string,
  role: 'executor' | 'reviewer' = 'executor',
  repositoryIds: string[] = [],
): Promise<Agent> {
  const registration = await humanCall(human, 'POST', '/api/v1/agents/register', {
    name: `stage3-${suffix}`, slug: `stage3-${suffix}`, provider: 'fake', version: '1',
    supportedProtocols: ['native_http'], requestedCapabilities: capabilities,
    approvedCapabilities: capabilities, maxConcurrency: 2,
  })
  expect(registration.statusCode).toBe(200)
  const created = registration.json<{ id: string; installation_token: string }>()
  expect((await humanCall(human, 'PUT', `/api/v1/agents/${created.id}/team-access/${teamId}`, { approvedCapabilities: capabilities })).statusCode).toBe(200)
  const delegation = await humanCall(human, 'POST', `/api/v1/work-items/${workItemId}/delegations`, {
    agentId: created.id, principalHumanActorId: human.actorId, role,
    scopeType: 'work_item', scopeId: workItemId, permissionsSnapshot: capabilities,
    capabilityScope: { workspaceId, teamIds: [teamId], projectIds: [], workItemIds: [workItemId], repositoryIds, capabilities },
  })
  expect(delegation.statusCode).toBe(200)
  const session = await humanCall(human, 'POST', '/api/v1/agent-sessions', {
    delegationId: delegation.json<{ id: string }>().id, workItemId, initialPrompt: 'Stage 3 delivery',
  })
  expect(session.statusCode).toBe(200)
  const sessionBody = session.json<{ id: string; exchangeToken: string }>()
  const exchange = await app.inject({
    method: 'POST', url: `/api/v1/agent-sessions/${sessionBody.id}/token/exchange`,
    payload: { exchangeToken: sessionBody.exchangeToken },
    headers: { authorization: `Bearer ${created.installation_token}`, 'idempotency-key': randomUUID() },
  }) as unknown as Response
  const token = exchange.json<{ sessionToken: string }>().sessionToken
  const ack = await agentCall(token, 'POST', `/api/v1/agent-sessions/${sessionBody.id}/ack`, { summary: 'accepted', externalUrls: [] })
  expect(ack.statusCode).toBe(200)
  const execute = await app.inject({
    method: 'POST', url: `/api/v1/agent-sessions/${sessionBody.id}/state`,
    payload: { state: 'executing', reason: 'delivery integration' },
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID(), 'if-match': `"revision-${ack.json<{ revision: number }>().revision}"` },
  }) as unknown as Response
  expect(execute.statusCode).toBe(200)
  return { id: created.id, token, sessionId: sessionBody.id }
}

async function fixture(): Promise<Fixture> {
  const install = await app.inject({
    method: 'POST', url: '/api/v1/auth/install',
    payload: { name: 'Stage Three', slug: `stage-three-${randomUUID().slice(0, 8)}`, adminName: 'Admin', email: `${randomUUID()}@example.test`, password: 'stage-three-password' },
    headers: { 'idempotency-key': randomUUID() },
  }) as unknown as Response
  const setCookie = Array.isArray(install.headers['set-cookie']) ? install.headers['set-cookie'][0] : install.headers['set-cookie']
  const human = { cookie: typeof setCookie === 'string' ? setCookie.split(';')[0] ?? '' : '', csrf: install.json<{ csrfToken: string }>().csrfToken, actorId: '' }
  human.actorId = (await humanCall(human, 'GET', '/api/v1/auth/me')).json<{ actor: { id: string } }>().actor.id
  const teamId = (await humanCall(human, 'GET', '/api/v1/teams')).json<Array<{ id: string }>>()[0]!.id
  const readyId = (await humanCall(human, 'GET', `/api/v1/teams/${teamId}/states`)).json<Array<{ id: string; name: string }>>().find(state => state.name === 'Ready')!.id
  const project = await humanCall(human, 'POST', '/api/v1/projects', { teamId, name: 'Stage 3 project' })
  const projectId = project.json<{ id: string }>().id
  const milestone = await humanCall(human, 'POST', `/api/v1/projects/${projectId}/milestones`, { name: 'First delivery' })
  expect(milestone.statusCode).toBe(200)
  const work = await humanCall(human, 'POST', '/api/v1/work-items', {
    teamId, projectId, milestoneId: milestone.json<{ id: string }>().id,
    title: 'Deliver code', statusId: readyId, responsibleHumanActorId: human.actorId,
  })
  const workItemId = work.json<{ id: string }>().id
  expect((await db.query('SELECT 1 FROM work_items WHERE id=$1 AND milestone_id=$2', [workItemId, milestone.json<{ id: string }>().id])).rowCount).toBe(1)
  const workspaceId = (await db.query<{ workspace_id: string }>('SELECT workspace_id FROM work_items WHERE id=$1', [workItemId])).rows[0]!.workspace_id
  const connection = await humanCall(human, 'POST', '/api/v1/provider-connections', {
    provider: 'github', externalAccountId: 'installation-42', displayName: 'GitHub App',
    installationId: '42', appId: '7',
    privateKey: '-----BEGIN PRIVATE KEY-----\nstage3-integration-placeholder-private-key-material\n-----END PRIVATE KEY-----',
    webhookSecret: 'stage3-webhook-secret-value',
  })
  expect(connection.statusCode, JSON.stringify(connection.json())).toBe(200)
  const connectionId = connection.json<{ id: string }>().id
  const repo = await humanCall(human, 'POST', '/api/v1/repositories', {
    connectionId, teamId, externalId: '9001', fullName: 'acme/workmesh', defaultBranch: 'main', requiredChecks: ['test'],
  })
  expect(repo.statusCode).toBe(200)
  const repositoryId = repo.json<{ id: string }>().id
  const context = await requestAndResolveContext(human, repositoryId, {
    workItemId, baseBranch: 'main', baseSha: 'base-sha', branchPattern: 'workmesh/{workItemKey}-{slug}',
    allowedPaths: ['apps/api/**'], permissions: ['read', 'write_branch', 'open_pr', 'review', 'merge', 'ci'],
  })
  expect(context.statusCode).toBe(200)
  const agent = await createAgent(human, workspaceId, teamId, workItemId, randomUUID().slice(0, 8), 'executor', [repositoryId])
  return { human, workspaceId, teamId, projectId, workItemId, agent, connectionId, repositoryId }
}

describe('Stage 3 delivery API', () => {
  beforeAll(async () => { await applyMigrations(db); await app.ready() })
  beforeEach(async () => { await db.query('TRUNCATE workspaces CASCADE') })
  afterAll(async () => { await app.close(); await db.end() })

  it('authorizes before context disclosure and persists provider intent without provider I/O', async () => {
    const f = await fixture()
    for (const cloneUrl of ['javascript:alert(1)', 'data:text/html,unsafe', 'https://user:password@example.test/repository']) {
      const unsafeRepository = await humanCall(f.human, 'POST', '/api/v1/repositories', {
        connectionId: f.connectionId, teamId: f.teamId, externalId: randomUUID(),
        fullName: 'acme/unsafe', defaultBranch: 'main', cloneUrl,
      })
      expect(unsafeRepository.statusCode).toBe(400)
    }
    for (const uri of ['javascript:alert(1)', 'data:text/html,unsafe', 'https://user:password@example.test/artifact']) {
      const unsafeArtifact = await agentCall(f.agent.token, 'POST', '/api/v1/delivery-artifacts', {
        workItemId: f.workItemId, sessionId: f.agent.sessionId, projectId: f.projectId,
        type: 'test_report', title: 'unsafe artifact', uri,
        checksum: `sha256:${'d'.repeat(64)}`, sourceTool: 'integration',
      })
      expect(unsafeArtifact.statusCode).toBe(400)
    }
    const context = await agentCall(f.agent.token, 'GET', `/api/v1/repositories/${f.repositoryId}/context`)
    expect(context.statusCode).toBe(200)
    expect(context.json<Array<{ base_sha: string; guidance: Array<{ path: string }> }>>()[0]).toMatchObject({
      base_sha: 'base-sha', guidance: [{ path: 'AGENTS.md' }, { path: 'apps/api/AGENTS.md' }],
    })
    const intent = await agentCall(f.agent.token, 'POST', '/api/v1/provider-actions', {
      kind: 'create_branch', repositoryId: f.repositoryId, workItemId: f.workItemId,
      sessionId: f.agent.sessionId, projectId: f.projectId, name: 'workmesh/GEN-1-delivery', baseSha: 'base-sha',
    })
    expect(intent.statusCode).toBe(200)
    expect(intent.json<{ status: string }>().status).toBe('pending')
    expect(
      (
        await db.query(
          "SELECT 1 FROM provider_actions WHERE repository_id=$1 AND kind='create_branch'",
          [f.repositoryId],
        )
      ).rowCount,
    ).toBe(1)
    const fakeProvider = new FakeGitProvider()
    fakeProvider.seedRepository(f.connectionId, '9001', 'main', 'base-sha')
    const providerWorker = createProviderActionWorker({ db, resolveProvider: () => fakeProvider, workerId: 'api-golden-worker' })
    await providerWorker.tick()
    expect((await db.query("SELECT 1 FROM artifacts WHERE work_item_id=$1 AND type='branch'", [f.workItemId])).rowCount).toBe(1)
    const branchAttempts = [
      { branch: 'main', message: 'default branch' },
      { branch: 'feature/unpinned', message: 'nonmatching branch' },
      { branch: 'workmesh/GEN-2-other-work', message: 'another work item branch' },
    ]
    for (const attempt of branchAttempts) {
      const deniedBranch = await agentCall(f.agent.token, 'POST', '/api/v1/provider-actions', {
        kind: 'create_commit', repositoryId: f.repositoryId, workItemId: f.workItemId,
        sessionId: f.agent.sessionId, projectId: f.projectId, branch: attempt.branch,
        expectedHeadSha: 'base-sha', message: attempt.message,
        files: [{ path: 'apps/api/denied.ts', content: 'export {}\n' }],
      })
      expect(deniedBranch.statusCode).toBe(403)
    }
    const escapedPath = await agentCall(f.agent.token, 'POST', '/api/v1/provider-actions', {
      kind: 'create_commit', repositoryId: f.repositoryId, workItemId: f.workItemId,
      sessionId: f.agent.sessionId, projectId: f.projectId, branch: 'workmesh/GEN-1-delivery',
      expectedHeadSha: 'base-sha', message: 'escape scoped prefix',
      files: [{ path: 'apps/api-secrets/credentials.ts', content: 'export const leaked = true\n' }],
    })
    expect(escapedPath.statusCode).toBe(403)
    expect(
      (
        await db.query(
          "SELECT 1 FROM provider_actions WHERE repository_id=$1 AND kind='create_branch'",
          [f.repositoryId],
        )
      ).rowCount,
    ).toBe(1)
    const otherWork = await humanCall(f.human, 'POST', '/api/v1/work-items', {
      teamId: f.teamId, title: 'No repository context',
      statusId: (await humanCall(f.human, 'GET', `/api/v1/teams/${f.teamId}/states`)).json<Array<{ id: string; name: string }>>().find(state => state.name === 'Ready')!.id,
      responsibleHumanActorId: f.human.actorId,
    })
    const other = await createAgent(f.human, f.workspaceId, f.teamId, otherWork.json<{ id: string }>().id, randomUUID().slice(0, 8))
    const denied = await agentCall(other.token, 'GET', `/api/v1/repositories/${f.repositoryId}/context`)
    expect(denied.statusCode).toBe(403)
    expect(JSON.stringify(denied.json())).not.toContain('base-sha')
  })

  it('persists an exact-head, approval-bound CI retry through the provider action queue', async () => {
    const f = await fixture()
    const agentActorId = (await db.query<{ agent_actor_id: string }>(
      'SELECT agent_actor_id FROM agent_sessions WHERE id=$1',
      [f.agent.sessionId],
    )).rows[0]!.agent_actor_id
    const pullRequestId = (await db.query<{ id: string }>(
      `INSERT INTO pull_request_projections(
         workspace_id,repository_id,external_id,number,uri,work_item_id,session_id,producer_actor_id,
         base_branch,head_branch,base_sha,head_sha,state,draft)
       VALUES($1,$2,'ci-retry-pr',71,'https://example.test/pull/71',$3,$4,$5,
         'main','workmesh/DEL-1-ci-retry','base-sha','ci-head','open',false)
       RETURNING id`,
      [f.workspaceId, f.repositoryId, f.workItemId, f.agent.sessionId, agentActorId],
    )).rows[0]!.id
    await db.query(
      `INSERT INTO ci_check_projections(
         pull_request_id,external_id,name,status,head_sha,details_url,provider_observed_at,provider_observation_rank)
       VALUES($1,'ci-501','test','failed','ci-head','https://example.test/check/501',now(),1)`,
      [pullRequestId],
    )
    const approvalPayload = {
      provider: 'github',
      connectionId: f.connectionId,
      repositoryId: f.repositoryId,
      pullRequestId,
      checkRunId: 'ci-501',
      headSha: 'ci-head',
    }
    const approvalHash = `sha256:${createHash('sha256').update(canonicalActionApprovalPayload(approvalPayload)).digest('hex')}`
    const approval = await agentCall(f.agent.token, 'POST', '/api/v1/approvals', {
      sessionId: f.agent.sessionId,
      approvalType: 'provider_action',
      actionName: 'provider.ci.retry',
      actionPayloadSanitized: approvalPayload,
      actionPayloadHash: approvalHash,
      riskLevel: 'medium',
      rationaleSummary: 'Retry the failed current-head CI check.',
      requiredApprovals: 1,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    })
    expect(approval.statusCode).toBe(200)
    const approvalBody = approval.json<{ id: string; revision: number }>()
    const decision = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/${approvalBody.id}/decide`,
      payload: { decision: 'approved', reason: 'The exact failed check may be retried.' },
      headers: {
        cookie: f.human.cookie,
        'x-csrf-token': f.human.csrf,
        'idempotency-key': randomUUID(),
        'if-match': `"revision-${approvalBody.revision}"`,
      },
    }) as unknown as Response
    expect(decision.statusCode).toBe(200)
    const retry = await agentCall(
      f.agent.token,
      'POST',
      `/api/v1/pull-requests/${pullRequestId}/checks/ci-501/retry`,
      {
        sessionId: f.agent.sessionId,
        approvalId: approvalBody.id,
        actionPayloadHash: approvalHash,
        headSha: 'ci-head',
      },
    )
    expect(retry.statusCode, JSON.stringify(retry.json())).toBe(200)
    expect(retry.json<{ kind: string; status: string }>()).toMatchObject({
      kind: 'retry_ci_check',
      status: 'pending',
    })
  })

  it('verifies exact raw GitHub bytes and makes duplicate deliveries a single durable effect', async () => {
    const f = await fixture()
    const raw = JSON.stringify({ repository: { id: 9001 }, ref: 'refs/heads/main', before: 'old', after: 'new' })
    const signature = `sha256=${createHmac('sha256', 'stage3-webhook-secret-value').update(raw).digest('hex')}`
    const call = () => app.inject({
      method: 'POST', url: `/api/v1/provider-webhooks/${f.connectionId}/github`, payload: raw,
      headers: { 'content-type': 'application/json', 'x-github-delivery': 'delivery-1', 'x-github-event': 'push', 'x-hub-signature-256': signature },
    }) as unknown as Promise<Response>
    expect((await call()).statusCode).toBe(202)
    expect((await call()).statusCode).toBe(200)
    expect((await db.query('SELECT 1 FROM provider_webhook_deliveries WHERE connection_id=$1 AND delivery_id=$2', [f.connectionId, 'delivery-1'])).rowCount).toBe(1)
    const tampered = await app.inject({
      method: 'POST', url: `/api/v1/provider-webhooks/${f.connectionId}/github`, payload: '{}',
      headers: { 'content-type': 'application/json', 'x-github-delivery': 'delivery-2', 'x-github-event': 'push', 'x-hub-signature-256': signature },
    }) as unknown as Response
    expect(tampered.statusCode).toBe(403)
  })

  it('uses one live exact-context predicate and revokes repository disclosure immediately', async () => {
    const f = await fixture()
    const stateId = (await humanCall(f.human, 'GET', `/api/v1/teams/${f.teamId}/states`))
      .json<Array<{ id: string; name: string }>>().find(state => state.name === 'Ready')!.id
    const otherWork = await humanCall(f.human, 'POST', '/api/v1/work-items', {
      teamId: f.teamId, projectId: f.projectId, title: 'Foreign context', statusId: stateId,
      responsibleHumanActorId: f.human.actorId,
    })
    expect((await requestAndResolveContext(f.human, f.repositoryId, {
      workItemId: otherWork.json<{ id: string }>().id, baseBranch: 'main', baseSha: 'foreign-secret-sha',
      branchPattern: 'workmesh/{workItemKey}-{slug}', allowedPaths: ['secret/**'], permissions: ['read'],
    })).statusCode).toBe(200)
    const exact = await agentCall(f.agent.token, 'GET', `/api/v1/repositories/${f.repositoryId}/context`)
    expect(exact.statusCode).toBe(200)
    expect(exact.json<Array<{ base_sha: string }>>()).toHaveLength(1)
    expect(JSON.stringify(exact.json())).not.toContain('foreign-secret')
    expect((await agentCall(f.agent.token, 'GET', '/api/v1/repositories')).json<Array<{ id: string }>>().map(row => row.id)).toEqual([f.repositoryId])
    for (const context of [
      { projectId: f.projectId, baseSha: 'project-pin' },
      { workItemId: f.workItemId, baseSha: 'work-pin-newest' },
      { sessionId: f.agent.sessionId, baseSha: 'session-pin-v1' },
      { sessionId: f.agent.sessionId, baseSha: 'session-pin-v2' },
    ]) {
      expect((await requestAndResolveContext(f.human, f.repositoryId, {
        ...context, baseBranch: 'main', branchPattern: 'workmesh/{workItemKey}-{slug}',
        allowedPaths: ['apps/api/**'], permissions: ['read'],
      })).statusCode).toBe(200)
    }
    const selected = await agentCall(f.agent.token, 'GET', `/api/v1/repositories/${f.repositoryId}/context`)
    expect(selected.statusCode).toBe(200)
    expect(selected.json<Array<{ base_sha: string }>>()).toEqual([
      expect.objectContaining({ base_sha: 'session-pin-v2' }),
    ])

    const session = (await db.query<{ agent_id: string; delegation_id: string }>(
      'SELECT agent_id,delegation_id FROM agent_sessions WHERE id=$1', [f.agent.sessionId],
    )).rows[0]!
    const expectNoDisclosure = async () => {
      const list = await agentCall(f.agent.token, 'GET', '/api/v1/repositories')
      expect([200, 401, 403, 409]).toContain(list.statusCode)
      if (list.statusCode === 200) expect(list.json()).toEqual([])
      const context = await agentCall(f.agent.token, 'GET', `/api/v1/repositories/${f.repositoryId}/context`)
      expect([401, 403, 409]).toContain(context.statusCode)
      expect(JSON.stringify(context.json())).not.toMatch(/base-sha|foreign-secret|AGENTS\.md|acme\/workmesh/)
    }
    await db.query('UPDATE agent_definitions SET is_active=false WHERE id=$1', [session.agent_id])
    await expectNoDisclosure()
    await db.query('UPDATE agent_definitions SET is_active=true WHERE id=$1', [session.agent_id])
    await db.query('UPDATE agent_team_access SET revoked_at=now() WHERE agent_id=$1 AND team_id=$2', [session.agent_id, f.teamId])
    await expectNoDisclosure()
    await db.query('UPDATE agent_team_access SET revoked_at=NULL WHERE agent_id=$1 AND team_id=$2', [session.agent_id, f.teamId])
    await db.query("UPDATE delegations SET status='revoked',revoked_at=now() WHERE id=$1", [session.delegation_id])
    await expectNoDisclosure()
  })

  it('rejects missing pinned review and merge permissions before PR evidence with zero residue', async () => {
    const f = await fixture()
    const prId = (await db.query<{ id: string }>(
      `INSERT INTO pull_request_projections(
         workspace_id,repository_id,external_id,number,uri,work_item_id,producer_actor_id,
         base_branch,head_branch,base_sha,head_sha,state,draft)
       VALUES($1,$2,'permission-pr',51,'https://example.test/pr/51',$3,$4,'main','workmesh/GEN-1-permission','base','head','open',false)
       RETURNING id`,
      [f.workspaceId, f.repositoryId, f.workItemId, f.human.actorId],
    )).rows[0]!.id
    const reviewer = await createAgent(f.human, f.workspaceId, f.teamId, f.workItemId, randomUUID().slice(0, 8), 'reviewer', [f.repositoryId])
    expect((await requestAndResolveContext(f.human, f.repositoryId, {
      workItemId: f.workItemId, baseBranch: 'main', baseSha: 'base',
      branchPattern: 'workmesh/{workItemKey}-{slug}', allowedPaths: ['apps/api/**'],
      permissions: ['read', 'write_branch', 'open_pr'],
    })).statusCode).toBe(200)
    const before = (await db.query<{ reviews: string; bindings: string; actions: string; events: string; outbox: string }>(
      `SELECT
        (SELECT count(*) FROM structured_reviews)::text AS reviews,
        (SELECT count(*) FROM merge_approval_bindings)::text AS bindings,
        (SELECT count(*) FROM provider_actions)::text AS actions,
        (SELECT count(*) FROM domain_events)::text AS events,
        (SELECT count(*) FROM outbox_events)::text AS outbox`,
    )).rows[0]!
    const deniedReview = await agentCall(reviewer.token, 'POST', `/api/v1/pull-requests/${prId}/reviews`, {
      sessionId: reviewer.sessionId, artifactId: randomUUID(), headSha: 'head',
      verdict: 'approved', summary: 'must not persist', findings: [],
    })
    expect(deniedReview.statusCode).toBe(403)
    expect(JSON.stringify(deniedReview.json())).not.toContain('head')
    const deniedMerge = await agentCall(f.agent.token, 'POST', `/api/v1/pull-requests/${prId}/merge`, {
      sessionId: f.agent.sessionId, approvalId: randomUUID(), actionPayloadHash: `sha256:${'1'.repeat(64)}`,
      headSha: 'head', method: 'squash',
    })
    expect(deniedMerge.statusCode).toBe(403)
    const after = (await db.query<typeof before>(
      `SELECT
        (SELECT count(*) FROM structured_reviews)::text AS reviews,
        (SELECT count(*) FROM merge_approval_bindings)::text AS bindings,
        (SELECT count(*) FROM provider_actions)::text AS actions,
        (SELECT count(*) FROM domain_events)::text AS events,
        (SELECT count(*) FROM outbox_events)::text AS outbox`,
    )).rows[0]!
    expect(after).toEqual(before)
  })

  it('rejects sensitive artifact content and rolls back artifact, event, and outbox writes', async () => {
    const f = await fixture()
    const before = (await db.query<{ artifacts: string; reviews: string; findings: string; events: string; outbox: string }>(
      `SELECT (SELECT count(*) FROM artifacts)::text AS artifacts,
              (SELECT count(*) FROM structured_reviews)::text AS reviews,
              (SELECT count(*) FROM structured_review_findings)::text AS findings,
              (SELECT count(*) FROM domain_events)::text AS events,
              (SELECT count(*) FROM outbox_events)::text AS outbox`,
    )).rows[0]!
    const common = {
      workItemId: f.workItemId, sessionId: f.agent.sessionId, projectId: f.projectId,
      type: 'test_report', title: 'safe', checksum: `sha256:${'7'.repeat(64)}`, sourceTool: 'integration',
    }
    const sensitive = [
      { ...common, title: 'Bearer abcdefghijklmnop' },
      { ...common, command: 'token=top-secret-value' },
      { ...common, metadata: { api_key: 'secret' } },
      { ...common, metadata: { nested: 'eyJabcdefghijk.abcdefghijk.abcdefghijk' } },
      { ...common, title: 'see https://user:password@example.test/log' },
      { ...common, metadata: { privateKey: 'not-allowed' } },
      { ...common, metadata: { access_key_id: 'AKIAIOSFODNN7EXAMPLE' } },
      { ...common, metadata: { 'secret-access-key': 'not-allowed' } },
      { ...common, metadata: { clientSecret: 'not-allowed' } },
      { ...common, metadata: { webhook_secret: 'not-allowed' } },
      { ...common, command: '-----BEGIN PRIVATE KEY-----\nprivate material' },
      { ...common, command: 'x-api-key: abcdefghijklmnop' },
      { ...common, result: 'passed', title: 'sk-abcdefghijklmnopqrstuvwxyz' },
    ]
    for (const payload of sensitive)
      expect((await agentCall(f.agent.token, 'POST', '/api/v1/delivery-artifacts', payload)).statusCode).toBe(400)
    for (const review of [
      { summary: 'Bearer abcdefghijklmnop', findings: [], evidence: [], metadata: {} },
      { summary: 'safe', findings: [{ severity: 'high', title: 'safe', body: 'clientSecret=abcdefgh' }], evidence: [], metadata: {} },
      { summary: 'safe', findings: [], evidence: ['-----BEGIN RSA PRIVATE KEY-----'], metadata: {} },
      { summary: 'safe', findings: [], evidence: [], metadata: { accessKeyId: 'AKIAIOSFODNN7EXAMPLE' } },
    ]) {
      const response = await agentCall(f.agent.token, 'POST', `/api/v1/pull-requests/${randomUUID()}/reviews`, {
        sessionId: f.agent.sessionId, artifactId: randomUUID(), headSha: 'head',
        verdict: 'approved', ...review,
      })
      expect(response.statusCode).toBe(404)
      expect(response.json<{ error: { code: string } }>()).toMatchObject({
        error: { code: 'NOT_FOUND' },
      })
      const serializedError = JSON.stringify(response.json())
      for (const sensitiveValue of [
        'abcdefghijklmnop',
        'abcdefgh',
        'PRIVATE KEY',
        'AKIAIOSFODNN7EXAMPLE',
      ]) expect(serializedError).not.toContain(sensitiveValue)
    }
    const after = (await db.query<typeof before>(
      `SELECT (SELECT count(*) FROM artifacts)::text AS artifacts,
              (SELECT count(*) FROM structured_reviews)::text AS reviews,
              (SELECT count(*) FROM structured_review_findings)::text AS findings,
              (SELECT count(*) FROM domain_events)::text AS events,
              (SELECT count(*) FROM outbox_events)::text AS outbox`,
    )).rows[0]!
    expect(after).toEqual(before)
  })

  it('requires current Team membership for human updates and serializes dependency cycles', async () => {
    const f = await fixture()
    const secondTeam = await humanCall(f.human, 'POST', '/api/v1/teams', { name: 'Other Team', key: `OT${randomUUID().slice(0, 4)}`.toUpperCase() })
    expect(secondTeam.statusCode).toBe(200)
    const secondTeamId = secondTeam.json<{ id: string }>().id
    await db.query("UPDATE actors SET workspace_role='member' WHERE id=$1", [f.human.actorId])
    await db.query('DELETE FROM memberships WHERE actor_id=$1 AND team_id=$2', [f.human.actorId, f.teamId])
    const before = (await db.query<{ updates: string; events: string; outbox: string }>(
      `SELECT (SELECT count(*) FROM project_updates)::text AS updates,
              (SELECT count(*) FROM domain_events)::text AS events,
              (SELECT count(*) FROM outbox_events)::text AS outbox`,
    )).rows[0]!
    expect((await humanCall(f.human, 'POST', `/api/v1/projects/${f.projectId}/updates`, {
      health: 'on_track', body: 'cross-team denied', status: 'draft',
    })).statusCode).toBe(403)
    const after = (await db.query<typeof before>(
      `SELECT (SELECT count(*) FROM project_updates)::text AS updates,
              (SELECT count(*) FROM domain_events)::text AS events,
              (SELECT count(*) FROM outbox_events)::text AS outbox`,
    )).rows[0]!
    expect(after).toEqual(before)

    await db.query("UPDATE actors SET workspace_role='admin' WHERE id=$1", [f.human.actorId])
    await db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'maintainer') ON CONFLICT DO NOTHING", [f.workspaceId, f.teamId, f.human.actorId])
    const otherProject = await humanCall(f.human, 'POST', '/api/v1/projects', { teamId: f.teamId, name: 'Dependency peer' })
    const otherProjectId = otherProject.json<{ id: string }>().id
    const [forward, reverse] = await Promise.all([
      humanCall(f.human, 'POST', `/api/v1/projects/${f.projectId}/dependencies`, { dependsOnProjectId: otherProjectId }),
      humanCall(f.human, 'POST', `/api/v1/projects/${otherProjectId}/dependencies`, { dependsOnProjectId: f.projectId }),
    ])
    expect([forward.statusCode, reverse.statusCode].sort()).toEqual([200, 400])
    expect((await db.query('SELECT 1 FROM project_dependencies WHERE project_id=ANY($1::uuid[])', [[f.projectId, otherProjectId]])).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM domain_events WHERE event_type='project.dependency.created' AND aggregate_id=ANY($1::uuid[])", [[f.projectId, otherProjectId]])).rowCount).toBe(1)
  })

  it('keeps agent project updates draft-only and makes publication and completion decisions human, revisioned, and replay-safe', async () => {
    const f = await fixture()
    const beforePublishedAttempt = (await db.query<{ updates: string; events: string; outbox: string }>(
      `SELECT (SELECT count(*) FROM project_updates)::text AS updates,
              (SELECT count(*) FROM domain_events)::text AS events,
              (SELECT count(*) FROM outbox_events)::text AS outbox`,
    )).rows[0]!
    const agentPublished = await agentCall(f.agent.token, 'POST', `/api/v1/projects/${f.projectId}/updates`, {
      health: 'on_track', body: 'Agent cannot publish', status: 'published',
    })
    expect(agentPublished.statusCode).toBe(400)
    expect((await db.query<typeof beforePublishedAttempt>(
      `SELECT (SELECT count(*) FROM project_updates)::text AS updates,
              (SELECT count(*) FROM domain_events)::text AS events,
              (SELECT count(*) FROM outbox_events)::text AS outbox`,
    )).rows[0]).toEqual(beforePublishedAttempt)

    const draft = await agentCall(f.agent.token, 'POST', `/api/v1/projects/${f.projectId}/updates`, {
      health: 'on_track', body: 'Agent-authored draft', status: 'draft',
    })
    expect(draft.statusCode).toBe(200)
    const draftBody = draft.json<{ id: string; status: string; revision: number }>()
    expect(draftBody).toMatchObject({ status: 'draft', revision: 1 })
    const publishKey = randomUUID()
    const publish = async (key: string, revision: number) => await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${f.projectId}/updates/${draftBody.id}/publish`,
      payload: {},
      headers: {
        cookie: f.human.cookie, 'x-csrf-token': f.human.csrf,
        'idempotency-key': key, 'if-match': `"revision-${revision}"`,
      },
    }) as unknown as Response
    const published = await publish(publishKey, 1)
    expect(published.statusCode).toBe(200)
    expect(published.json()).toMatchObject({ id: draftBody.id, status: 'published', revision: 2 })
    expect((await publish(publishKey, 1)).json()).toEqual(published.json())
    expect((await publish(randomUUID(), 1)).statusCode).toBe(409)
    expect((await db.query(
      `SELECT 1 FROM domain_events e JOIN outbox_events o ON o.domain_event_id=e.id
        WHERE e.aggregate_id=$1 AND e.event_type='project.update.published'`,
      [draftBody.id],
    )).rowCount).toBe(1)

    const createSuggestion = async (rationale: string) => {
      const response = await agentCall(f.agent.token, 'POST', `/api/v1/projects/${f.projectId}/completion-suggestions`, {
        workItemId: f.workItemId, rationale, evidenceArtifactIds: [],
      })
      expect(response.statusCode).toBe(200)
      return response.json<{ id: string; status: string; revision: number }>()
    }
    const acceptedSuggestion = await createSuggestion('Accept without auto-transition')
    const workStatusBefore = (await db.query<{ status_id: string }>('SELECT status_id FROM work_items WHERE id=$1', [f.workItemId])).rows[0]!.status_id
    const decide = async (
      suggestionId: string,
      decision: 'accepted' | 'dismissed',
      key: string,
      revision: number,
      human = true,
    ) => await app.inject({
      method: 'POST',
      url: `/api/v1/completion-suggestions/${suggestionId}/decision`,
      payload: { decision },
      headers: human
        ? {
            cookie: f.human.cookie, 'x-csrf-token': f.human.csrf,
            'idempotency-key': key, 'if-match': `"revision-${revision}"`,
          }
        : {
            authorization: `Bearer ${f.agent.token}`,
            'idempotency-key': key, 'if-match': `"revision-${revision}"`,
          },
    }) as unknown as Response
    expect((await decide(acceptedSuggestion.id, 'accepted', randomUUID(), 1, false)).statusCode).toBe(403)
    await db.query("UPDATE actors SET workspace_role='member' WHERE id=$1", [f.human.actorId])
    await db.query('DELETE FROM memberships WHERE actor_id=$1 AND team_id=$2', [f.human.actorId, f.teamId])
    expect((await decide(acceptedSuggestion.id, 'accepted', randomUUID(), 1)).statusCode).toBe(403)
    expect((await db.query('SELECT status,revision FROM completion_suggestions WHERE id=$1', [acceptedSuggestion.id])).rows[0])
      .toEqual({ status: 'open', revision: 1 })
    await db.query("UPDATE actors SET workspace_role='admin' WHERE id=$1", [f.human.actorId])
    await db.query(
      "INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'maintainer') ON CONFLICT DO NOTHING",
      [f.workspaceId, f.teamId, f.human.actorId],
    )
    const acceptKey = randomUUID()
    const accepted = await decide(acceptedSuggestion.id, 'accepted', acceptKey, 1)
    expect(accepted.statusCode).toBe(200)
    expect(accepted.json()).toMatchObject({ status: 'accepted', revision: 2 })
    expect((await decide(acceptedSuggestion.id, 'accepted', acceptKey, 1)).json()).toEqual(accepted.json())
    expect((await decide(acceptedSuggestion.id, 'accepted', randomUUID(), 1)).statusCode).toBe(409)

    const dismissedSuggestion = await createSuggestion('Dismiss without auto-transition')
    const dismissed = await decide(dismissedSuggestion.id, 'dismissed', randomUUID(), 1)
    expect(dismissed.statusCode).toBe(200)
    expect(dismissed.json()).toMatchObject({ status: 'dismissed', revision: 2 })
    expect((await db.query<{ status_id: string }>('SELECT status_id FROM work_items WHERE id=$1', [f.workItemId])).rows[0]!.status_id)
      .toBe(workStatusBefore)
    expect((await db.query(
      `SELECT event_type,count(*)::int AS count FROM domain_events
        WHERE aggregate_id=ANY($1::uuid[])
          AND event_type IN ('work_item.completion_suggestion.accepted','work_item.completion_suggestion.dismissed')
        GROUP BY event_type ORDER BY event_type`,
      [[acceptedSuggestion.id, dismissedSuggestion.id]],
    )).rows).toEqual([
      { event_type: 'work_item.completion_suggestion.accepted', count: 1 },
      { event_type: 'work_item.completion_suggestion.dismissed', count: 1 },
    ])
  })

  it('commits upload expiry before returning a stable replay-safe error without publishing an artifact', async () => {
    const f = await fixture()
    const agentActorId = (await db.query<{ agent_actor_id: string }>(
      'SELECT agent_actor_id FROM agent_sessions WHERE id=$1',
      [f.agent.sessionId],
    )).rows[0]!.agent_actor_id
    const uploadId = (await db.query<{ id: string }>(
      `INSERT INTO artifact_upload_intents(
         workspace_id,work_item_id,session_id,project_id,repository_id,requested_by_actor_id,
         storage_key,filename,mime_type,size_bytes,expected_checksum,source_tool,created_at,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,'expired-evidence.txt','text/plain',1,$8,
         'integration-expiry',now()-interval '2 hours',now()-interval '1 hour')
       RETURNING id`,
      [
        f.workspaceId,
        f.workItemId,
        f.agent.sessionId,
        f.projectId,
        f.repositoryId,
        agentActorId,
        `${f.workspaceId}/${randomUUID()}/expired-evidence.txt`,
        `sha256:${'8'.repeat(64)}`,
      ],
    )).rows[0]!.id
    const replayKey = `expired-finalize-${randomUUID()}`
    const finalize = async (idempotencyKey: string): Promise<Response> =>
      await app.inject({
        method: 'POST',
        url: `/api/v1/artifact-upload-intents/${uploadId}/finalize`,
        payload: {},
        headers: {
          authorization: `Bearer ${f.agent.token}`,
          'idempotency-key': idempotencyKey,
        },
      }) as unknown as Response

    const first = await finalize(replayKey)
    expect(first.statusCode).toBe(400)
    expect(first.json<{ error: { code: string } }>().error.code).toBe('ARTIFACT_UPLOAD_EXPIRED')
    expect((await db.query(
      `SELECT status,actual_checksum,verified_at,claimed_at,claimed_by
         FROM artifact_upload_intents WHERE id=$1`,
      [uploadId],
    )).rows[0]).toEqual({
      status: 'expired',
      actual_checksum: null,
      verified_at: null,
      claimed_at: null,
      claimed_by: null,
    })

    for (const idempotencyKey of [replayKey, `expired-finalize-${randomUUID()}`]) {
      const replay = await finalize(idempotencyKey)
      expect(replay.statusCode).toBe(400)
      expect(replay.json<{ error: { code: string } }>().error.code).toBe('ARTIFACT_UPLOAD_EXPIRED')
    }
    expect((await db.query(
      `SELECT e.event_type,e.idempotency_key,count(o.id)::int AS outbox_count
         FROM domain_events e JOIN outbox_events o ON o.domain_event_id=e.id
        WHERE e.aggregate_id=$1 AND e.event_type='artifact.upload.expired'
        GROUP BY e.id,e.event_type,e.idempotency_key`,
      [uploadId],
    )).rows).toEqual([{
      event_type: 'artifact.upload.expired',
      idempotency_key: replayKey,
      outbox_count: 1,
    }])
    expect((await db.query(
      `SELECT count(*)::int AS count FROM domain_events
        WHERE aggregate_id=$1 AND event_type='artifact.upload.finalization_requested'`,
      [uploadId],
    )).rows[0]).toEqual({ count: 0 })
    expect((await db.query(
      `SELECT count(*)::int AS count FROM artifacts
        WHERE metadata->>'uploadIntentId'=$1`,
      [uploadId],
    )).rows[0]).toEqual({ count: 0 })
    const worker = createArtifactUploadWorker({
      db,
      workerId: 'expired-upload-worker',
      storage: { verify: async () => { throw new Error('expired upload must not be verified') } },
    })
    expect(await worker.claim()).toBeUndefined()
  })

  it('requires project and completion evidence to be linked to the exact delivery target', async () => {
    const f = await fixture()
    const stateId = (await humanCall(f.human, 'GET', `/api/v1/teams/${f.teamId}/states`))
      .json<Array<{ id: string; name: string }>>().find(state => state.name === 'Ready')!.id
    const sameProjectWork = await humanCall(f.human, 'POST', '/api/v1/work-items', {
      teamId: f.teamId, projectId: f.projectId, title: 'Sibling work item', statusId: stateId,
      responsibleHumanActorId: f.human.actorId,
    })
    const otherProject = await humanCall(f.human, 'POST', '/api/v1/projects', { teamId: f.teamId, name: 'Other Stage 3 project' })
    const otherProjectId = otherProject.json<{ id: string }>().id
    const otherProjectWork = await humanCall(f.human, 'POST', '/api/v1/work-items', {
      teamId: f.teamId, projectId: otherProjectId, title: 'Other project work item', statusId: stateId,
      responsibleHumanActorId: f.human.actorId,
    })
    const producer = (await db.query<{ agent_actor_id: string }>(
      'SELECT agent_actor_id FROM agent_sessions WHERE id=$1',
      [f.agent.sessionId],
    )).rows[0]!.agent_actor_id
    const insertEvidence = async (projectId: string, workItemId: string, suffix: string): Promise<string> => {
      const artifactId = (await db.query<{ id: string }>(
        `INSERT INTO artifacts(workspace_id,session_id,work_item_id,producer_actor_id,type,title,checksum,source_tool,metadata)
         VALUES($1,$2,$3,$4,'test_report',$5,$6,'integration',$7) RETURNING id`,
        [f.workspaceId, f.agent.sessionId, workItemId, producer, `Evidence ${suffix}`, `sha256:${suffix.repeat(64).slice(0, 64)}`, { evidence: suffix }],
      )).rows[0]!.id
      await db.query(
        `INSERT INTO artifact_links(artifact_id,workspace_id,project_id,work_item_id,session_id,provenance)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [artifactId, f.workspaceId, projectId, workItemId, f.agent.sessionId, { source: 'integration' }],
      )
      return artifactId
    }
    const siblingArtifactId = await insertEvidence(f.projectId, sameProjectWork.json<{ id: string }>().id, 'e')
    const otherProjectArtifactId = await insertEvidence(otherProjectId, otherProjectWork.json<{ id: string }>().id, 'f')
    for (const artifactId of [randomUUID(), siblingArtifactId, otherProjectArtifactId]) {
      const completion = await agentCall(f.agent.token, 'POST', `/api/v1/projects/${f.projectId}/completion-suggestions`, {
        workItemId: f.workItemId, rationale: 'Invalid evidence must be rejected', evidenceArtifactIds: [artifactId],
      })
      expect(completion.statusCode).toBe(403)
    }
    const projectUpdate = await agentCall(f.agent.token, 'POST', `/api/v1/projects/${f.projectId}/updates`, {
      health: 'on_track', body: 'Cross-work-item evidence must be rejected', status: 'draft',
      evidenceArtifactIds: [siblingArtifactId],
    })
    expect(projectUpdate.statusCode).toBe(403)

    const insertPullRequest = async (workItemId: string, number: number): Promise<string> =>
      (await db.query<{ id: string }>(
        `INSERT INTO pull_request_projections(
           workspace_id,repository_id,external_id,number,uri,work_item_id,base_branch,head_branch,base_sha,head_sha,state,draft
         ) VALUES($1,$2,$3,$4,$5,$6,'main',$7,'base','head','open',false) RETURNING id`,
        [f.workspaceId, f.repositoryId, `foreign-${number}`, number, `https://example.test/pull/${number}`, workItemId, `foreign/${number}`],
      )).rows[0]!.id
    const siblingPullRequestId = await insertPullRequest(sameProjectWork.json<{ id: string }>().id, 91)
    const otherProjectPullRequestId = await insertPullRequest(otherProjectWork.json<{ id: string }>().id, 92)
    for (const pullRequestId of [randomUUID(), siblingPullRequestId, otherProjectPullRequestId]) {
      const completion = await agentCall(f.agent.token, 'POST', `/api/v1/projects/${f.projectId}/completion-suggestions`, {
        workItemId: f.workItemId, pullRequestId, rationale: 'Invalid pull request must be rejected', evidenceArtifactIds: [],
      })
      expect(completion.statusCode).toBe(403)
    }
    const ownPullRequestId = await insertPullRequest(f.workItemId, 93)
    const uploadCommon = {
      workItemId: f.workItemId, sessionId: f.agent.sessionId, projectId: f.projectId,
      repositoryId: f.repositoryId, pullRequestId: ownPullRequestId, headSha: 'head',
      sourceTool: 'integration', filename: 'evidence.txt', mimeType: 'text/plain',
      sizeBytes: 1, checksum: `sha256:${'9'.repeat(64)}`,
    }
    const uploadCountBefore = Number((await db.query<{ count: string }>('SELECT count(*) FROM artifact_upload_intents')).rows[0]!.count)
    expect((await agentCall(f.agent.token, 'POST', '/api/v1/artifact-upload-intents', {
      ...uploadCommon, headSha: 'stale-head',
    })).statusCode).toBe(409)
    expect((await agentCall(f.agent.token, 'POST', '/api/v1/artifact-upload-intents', {
      ...uploadCommon, pullRequestId: siblingPullRequestId,
    })).statusCode).toBe(409)
    expect((await agentCall(f.agent.token, 'POST', '/api/v1/artifact-upload-intents', {
      ...uploadCommon, projectId: otherProjectId, pullRequestId: undefined, headSha: undefined,
    })).statusCode).toBe(403)
    expect(Number((await db.query<{ count: string }>('SELECT count(*) FROM artifact_upload_intents')).rows[0]!.count))
      .toBe(uploadCountBefore)
  })

  it('runs branch, commit, PR, check, independent review, exact-head approval, merge, and suggestion', async () => {
    const f = await fixture()
    const provider = new FakeGitProvider()
    provider.seedRepository(f.connectionId, '9001', 'main', 'base-sha')
    const mergeProvider = vi.spyOn(provider, 'mergePullRequest')
    const worker = createProviderActionWorker({ db, resolveProvider: () => provider, workerId: 'stage3-golden-worker' })

    const branch = await agentCall(f.agent.token, 'POST', '/api/v1/provider-actions', {
      kind: 'create_branch', repositoryId: f.repositoryId, workItemId: f.workItemId,
      sessionId: f.agent.sessionId, projectId: f.projectId, name: 'workmesh/GEN-1-stage3', baseSha: 'base-sha',
    })
    expect(branch.statusCode).toBe(200)
    const claimedBranch = await worker.claimAction()
    expect(claimedBranch).toMatchObject({ external_id: '9001', kind: 'create_branch' })
    await worker.executeAction(claimedBranch!)
    expect(provider.branches.has(`${f.connectionId}:9001:workmesh/GEN-1-stage3`)).toBe(true)

    const commit = await agentCall(f.agent.token, 'POST', '/api/v1/provider-actions', {
      kind: 'create_commit', repositoryId: f.repositoryId, workItemId: f.workItemId,
      sessionId: f.agent.sessionId, projectId: f.projectId, branch: 'workmesh/GEN-1-stage3',
      expectedHeadSha: 'base-sha', message: 'feat: add Stage 3', files: [{ path: 'apps/api/stage3.ts', content: 'export const ready = true\n' }],
    })
    expect(commit.statusCode).toBe(200)
    const claimedCommit = await worker.claimAction()
    expect(claimedCommit).toMatchObject({ external_id: '9001', kind: 'create_commit' })
    await worker.executeAction(claimedCommit!)
    const commitResult = (await db.query<{ result: { sha: string } }>('SELECT result FROM provider_actions WHERE id=$1', [commit.json<{ id: string }>().id])).rows[0]!.result

    const open = await agentCall(f.agent.token, 'POST', '/api/v1/provider-actions', {
      kind: 'open_pull_request', repositoryId: f.repositoryId, workItemId: f.workItemId,
      sessionId: f.agent.sessionId, projectId: f.projectId, baseBranch: 'main',
      headBranch: 'workmesh/GEN-1-stage3', title: 'Stage 3 delivery', body: 'Evidence-backed delivery', draft: false,
    })
    expect(open.statusCode).toBe(200)
    const claimedOpen = await worker.claimAction()
    expect(claimedOpen).toMatchObject({ external_id: '9001', kind: 'open_pull_request' })
    await worker.executeAction(claimedOpen!)
    const pr = (await db.query<{ id: string; external_id: string; head_sha: string }>(
      'SELECT id,external_id,head_sha FROM pull_request_projections WHERE repository_id=$1',
      [f.repositoryId],
    )).rows[0]!
    expect(pr.head_sha).toBe(commitResult.sha)

    const deliverCheck = async (
      externalId: number,
      conclusion: 'success' | 'failure',
      observedAt: string,
      deliveryId: string,
    ) => {
      const rawCheck = JSON.stringify({
        repository: { id: 9001 },
        check_run: {
          id: externalId, name: 'test', status: 'completed', conclusion,
          head_sha: pr.head_sha, html_url: `https://example.test/check/${externalId}`,
          updated_at: observedAt,
        },
      })
      const checkSignature = `sha256=${createHmac('sha256', 'stage3-webhook-secret-value').update(rawCheck).digest('hex')}`
      const checkResponse = await app.inject({
        method: 'POST', url: `/api/v1/provider-webhooks/${f.connectionId}/github`, payload: rawCheck,
        headers: {
          'content-type': 'application/json',
          'x-github-delivery': deliveryId,
          'x-github-event': 'check_run',
          'x-hub-signature-256': checkSignature,
        },
      }) as unknown as Response
      expect(checkResponse.statusCode).toBe(202)
      await worker.finishWebhook((await worker.claimWebhook())!)
    }
    await deliverCheck(77, 'success', '2026-07-25T01:00:00Z', 'golden-check')
    expect((await db.query("SELECT 1 FROM ci_check_projections WHERE pull_request_id=$1 AND name='test' AND status='passed'", [pr.id])).rowCount).toBe(1)
    const delivery = await humanCall(f.human, 'GET', `/api/v1/projects/${f.projectId}/delivery`)
    expect(delivery.statusCode).toBe(200)
    expect(delivery.json<{
      providerPullRequests: Array<{
        provider: string
        number: number
        state: string
        headSha: string
        provenance: { source: string; sourceId: string | null }
        checks: Array<{ name: string; status: string; provenance: { source: string; sourceId: string | null } }>
      }>
    }>().providerPullRequests).toMatchObject([{
      provider: 'github',
      number: expect.any(Number),
      state: 'open',
      headSha: pr.head_sha,
      provenance: { source: 'provider_action', sourceId: expect.any(String) },
      checks: [{ name: 'test', status: 'passed', provenance: { source: 'provider_webhook', sourceId: expect.any(String) } }],
    }])

    const reviewer = await createAgent(
      f.human, f.workspaceId, f.teamId, f.workItemId, randomUUID().slice(0, 8), 'reviewer', [f.repositoryId],
    )
    const legacyArtifact = await agentCall(reviewer.token, 'POST', '/api/v1/artifacts', {
      sessionId: reviewer.sessionId, workItemId: f.workItemId, type: 'code_review',
      title: 'Legacy unprovenanced review', metadata: { headSha: pr.head_sha },
    })
    expect(legacyArtifact.statusCode).toBe(200)
    const unlinkedArtifact = await agentCall(reviewer.token, 'POST', '/api/v1/delivery-artifacts', {
      sessionId: reviewer.sessionId, workItemId: f.workItemId, projectId: f.projectId,
      type: 'code_review', title: 'Unlinked review', checksum: `sha256:${'8'.repeat(64)}`,
      sourceTool: 'integration-reviewer', result: 'passed',
    })
    expect(unlinkedArtifact.statusCode).toBe(200)
    for (const artifactId of [
      legacyArtifact.json<{ id: string }>().id,
      unlinkedArtifact.json<{ id: string }>().id,
    ]) {
      const rejected = await agentCall(reviewer.token, 'POST', `/api/v1/pull-requests/${pr.id}/reviews`, {
        sessionId: reviewer.sessionId, artifactId, headSha: pr.head_sha,
        verdict: 'approved', summary: 'must be linked', findings: [],
      })
      expect(rejected.statusCode).toBe(404)
    }
    const mismatchedHeadArtifact = await agentCall(reviewer.token, 'POST', '/api/v1/delivery-artifacts', {
      sessionId: reviewer.sessionId, workItemId: f.workItemId, projectId: f.projectId,
      repositoryId: f.repositoryId, pullRequestId: pr.id, headSha: `${pr.head_sha}-stale`, type: 'code_review',
      title: 'MCP stale-head review', checksum: `sha256:${'5'.repeat(64)}`,
      sourceTool: 'workmesh-mcp-reviewer', result: 'passed',
    })
    expect(mismatchedHeadArtifact.statusCode).toBe(409)
    const staleArtifact = await agentCall(reviewer.token, 'POST', '/api/v1/delivery-artifacts', {
      sessionId: reviewer.sessionId, workItemId: f.workItemId, projectId: f.projectId,
      repositoryId: f.repositoryId, pullRequestId: pr.id, headSha: pr.head_sha, type: 'code_review',
      title: 'Stale head review', checksum: `sha256:${'6'.repeat(64)}`,
      sourceTool: 'integration-reviewer', result: 'passed',
    })
    expect(staleArtifact.statusCode).toBe(200)
    await db.query('UPDATE pull_request_projections SET head_sha=$2 WHERE id=$1', [pr.id, `${pr.head_sha}-new`])
    const staleReview = await agentCall(reviewer.token, 'POST', `/api/v1/pull-requests/${pr.id}/reviews`, {
      sessionId: reviewer.sessionId, artifactId: staleArtifact.json<{ id: string }>().id,
      headSha: `${pr.head_sha}-new`, verdict: 'approved', summary: 'stale evidence denied', findings: [],
    })
    expect(staleReview.statusCode).toBe(404)
    await db.query('UPDATE pull_request_projections SET head_sha=$2 WHERE id=$1', [pr.id, pr.head_sha])
    expect((await db.query('SELECT 1 FROM structured_reviews WHERE pull_request_id=$1', [pr.id])).rowCount).toBe(0)
    const reviewArtifact = await agentCall(reviewer.token, 'POST', '/api/v1/delivery-artifacts', {
      sessionId: reviewer.sessionId, workItemId: f.workItemId, projectId: f.projectId,
      repositoryId: f.repositoryId, pullRequestId: pr.id, headSha: pr.head_sha, type: 'code_review',
      title: 'Independent Stage 3 review', checksum: `sha256:${'9'.repeat(64)}`,
      sourceTool: 'integration-reviewer', result: 'passed', metadata: { reviewedHeadSha: pr.head_sha },
    })
    expect(reviewArtifact.statusCode).toBe(200)
    const review = await agentCall(reviewer.token, 'POST', `/api/v1/pull-requests/${pr.id}/reviews`, {
      sessionId: reviewer.sessionId, artifactId: reviewArtifact.json<{ id: string }>().id,
      headSha: pr.head_sha, verdict: 'approved', summary: 'Required checks and scope are acceptable.', findings: [],
    })
    expect(review.statusCode).toBe(200)

    const approvalPayload = {
      provider: 'github' as const, connectionId: f.connectionId, repositoryId: f.repositoryId,
      pullRequestId: pr.external_id, headSha: pr.head_sha, method: 'squash' as const,
    }
    const approvalHash = `sha256:${createHash('sha256').update(canonicalMergeApprovalPayload(approvalPayload)).digest('hex')}`
    const approval = await agentCall(f.agent.token, 'POST', '/api/v1/approvals', {
      sessionId: f.agent.sessionId, approvalType: 'merge', actionName: 'provider.pull_request.merge',
      actionPayloadSanitized: approvalPayload, actionPayloadHash: approvalHash, riskLevel: 'high',
      rationaleSummary: 'Merge the independently reviewed exact head.', requiredApprovals: 1,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    })
    expect(approval.statusCode).toBe(200)
    const approvalBody = approval.json<{ id: string; revision: number }>()
    const decision = await app.inject({
      method: 'POST', url: `/api/v1/approvals/${approvalBody.id}/decide`,
      payload: { decision: 'approved', reason: 'Exact head reviewed and checks passed.' },
      headers: {
        cookie: f.human.cookie, 'x-csrf-token': f.human.csrf, 'idempotency-key': randomUUID(),
        'if-match': `"revision-${approvalBody.revision}"`,
      },
    }) as unknown as Response
    expect(decision.statusCode).toBe(200)

    await deliverCheck(78, 'failure', '2026-07-25T01:01:00Z', 'golden-check-rerun-failed')
    const blockedMerge = await agentCall(f.agent.token, 'POST', `/api/v1/pull-requests/${pr.id}/merge`, {
      sessionId: f.agent.sessionId, approvalId: approvalBody.id, actionPayloadHash: approvalHash,
      headSha: pr.head_sha, method: 'squash',
    })
    expect(blockedMerge.statusCode, JSON.stringify(blockedMerge.json())).toBe(400)
    expect(blockedMerge.json<{ error: { code: string } }>().error.code).toBe('MERGE_CHECKS_BLOCKED')
    expect(mergeProvider).not.toHaveBeenCalled()

    await deliverCheck(79, 'success', '2026-07-25T01:02:00Z', 'golden-check-rerun-passed')
    const merge = await agentCall(f.agent.token, 'POST', `/api/v1/pull-requests/${pr.id}/merge`, {
      sessionId: f.agent.sessionId, approvalId: approvalBody.id, actionPayloadHash: approvalHash,
      headSha: pr.head_sha, method: 'squash',
    })
    expect(merge.statusCode, JSON.stringify(merge.json())).toBe(200)
    const mergeActionId = merge.json<{ id: string }>().id
    await deliverCheck(80, 'failure', '2026-07-25T01:03:00Z', 'golden-check-regressed-before-execution')
    await worker.tick()
    expect(mergeProvider).not.toHaveBeenCalled()
    expect((await db.query('SELECT status,last_error FROM provider_actions WHERE id=$1', [mergeActionId])).rows[0])
      .toEqual({ status: 'failed', last_error: 'MERGE_REQUIRED_CHECKS_NOT_PASSED' })

    await deliverCheck(81, 'success', '2026-07-25T01:04:00Z', 'golden-check-rerun-recovered')
    await db.query('UPDATE provider_actions SET available_at=now() WHERE id=$1', [mergeActionId])
    await worker.tick()
    expect(mergeProvider).toHaveBeenCalledTimes(1)
    expect((await db.query("SELECT 1 FROM pull_request_projections WHERE id=$1 AND state='merged'", [pr.id])).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM approvals WHERE id=$1 AND status='consumed'", [approvalBody.id])).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM completion_suggestions WHERE work_item_id=$1 AND status='open'", [f.workItemId])).rowCount).toBe(1)
    expect((await db.query("SELECT 1 FROM work_items w JOIN workflow_states s ON s.id=w.status_id WHERE w.id=$1 AND s.category<>'completed'", [f.workItemId])).rowCount).toBe(1)
    await db.query(
      `INSERT INTO ci_check_projections(
         pull_request_id,external_id,name,status,required,head_sha,details_url,
         provider_observed_at,provider_observation_rank)
       VALUES($1,'stale-head-check','test','failed',true,'obsolete-head',
         'https://example.test/check/stale','2026-07-25T02:00:00Z',3)`,
      [pr.id],
    )
    const recoveredDeliveryId = (await db.query<{ id: string }>(
      "SELECT id FROM provider_webhook_deliveries WHERE delivery_id='golden-check-rerun-recovered'",
    )).rows[0]!.id
    const currentDelivery = await humanCall(f.human, 'GET', `/api/v1/projects/${f.projectId}/delivery`)
    expect(currentDelivery.statusCode).toBe(200)
    const currentChecks = currentDelivery.json<{
      providerPullRequests: Array<{
        id: string
        checks: Array<{
          name: string
          status: string
          required: boolean
          headSha: string
          detailsUrl: string | null
          provenance: { source: string; sourceId: string | null }
        }>
      }>
    }>().providerPullRequests.find(candidate => candidate.id === pr.id)?.checks
    expect(currentChecks).toEqual([{
      name: 'test',
      status: 'passed',
      required: true,
      headSha: pr.head_sha,
      detailsUrl: 'https://example.test/check/81',
      provenance: { source: 'provider_webhook', sourceId: recoveredDeliveryId },
    }])

    const evidence = Buffer.from('stage3 verified build evidence')
    const evidenceChecksum = `sha256:${createHash('sha256').update(evidence).digest('hex')}`
    const upload = await agentCall(f.agent.token, 'POST', '/api/v1/artifact-upload-intents', {
      workItemId: f.workItemId, sessionId: f.agent.sessionId, projectId: f.projectId,
      repositoryId: f.repositoryId, pullRequestId: pr.id, headSha: pr.head_sha, sourceTool: 'stage3-e2e',
      filename: 'build-evidence.txt', mimeType: 'text/plain', sizeBytes: evidence.length, checksum: evidenceChecksum,
    })
    expect(upload.statusCode, JSON.stringify(upload.json())).toBe(200)
    const uploadBody = upload.json<{
      id: string; uploadUrl: string; requiredHeaders: Record<string, string>
    }>()
    const put = await fetch(uploadBody.uploadUrl, { method: 'PUT', headers: uploadBody.requiredHeaders, body: evidence })
    expect(put.status).toBe(200)
    expect((await agentCall(f.agent.token, 'POST', `/api/v1/artifact-upload-intents/${uploadBody.id}/finalize`, {})).statusCode).toBe(200)
    const uploadWorker = createArtifactUploadWorker({
      db, storage: artifactStorageFromEnvironment(), workerId: 'stage3-upload-worker',
    })
    await uploadWorker.tick()
    expect((await db.query("SELECT 1 FROM artifact_upload_intents WHERE id=$1 AND status='verified' AND actual_checksum=$2", [uploadBody.id, evidenceChecksum])).rowCount).toBe(1)
    const uploadedLink = (await db.query<{
      workspace_id: string; project_id: string; work_item_id: string; session_id: string;
      repository_id: string; pull_request_id: string; provenance: Record<string, unknown>
    }>(
      `SELECT l.workspace_id,l.project_id,l.work_item_id,l.session_id,l.repository_id,l.pull_request_id,l.provenance
         FROM artifact_links l
         JOIN artifacts a ON a.id=l.artifact_id
        WHERE l.provenance->>'uploadIntentId'=$1 AND a.source_tool='stage3-e2e'`,
      [uploadBody.id],
    )).rows[0]!
    expect(uploadedLink).toMatchObject({
      workspace_id: f.workspaceId, project_id: f.projectId, work_item_id: f.workItemId,
      session_id: f.agent.sessionId, repository_id: f.repositoryId, pull_request_id: pr.id,
    })
    expect(uploadedLink.provenance).toMatchObject({
      workspaceId: f.workspaceId, projectId: f.projectId, workItemId: f.workItemId,
      sessionId: f.agent.sessionId, repositoryId: f.repositoryId, pullRequestId: pr.id,
      headSha: pr.head_sha, sourceTool: 'stage3-e2e', checksum: evidenceChecksum,
    })
    const download = await agentCall(f.agent.token, 'GET', `/api/v1/artifact-upload-intents/${uploadBody.id}/download`)
    expect(download.statusCode).toBe(200)
    const downloaded = await fetch(download.json<{ downloadUrl: string }>().downloadUrl)
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(evidence)
  })
})
