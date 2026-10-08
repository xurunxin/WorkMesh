import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applyMigrations, createDb, opaqueToken, tokenHash } from '@workmesh/db'
import { loadFeatureConfig } from '@workmesh/config'
import { configurationReadinessResponseSchema, routePolicyManifest, type ConfigurationReadinessResponse } from '@workmesh/contracts'
import { buildApp } from '../src/server.js'
import { seedAgentSessionBearer } from './agent-session-test-credentials.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl || !/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error(`Configuration readiness requires a dedicated *test* database and RUN_INTEGRATION=1 (RUN_INTEGRATION=${process.env.RUN_INTEGRATION}, database=${databaseUrl ? new URL(databaseUrl).pathname : 'missing'})`)
const db = createDb(databaseUrl)
let afterAuthorization: (() => Promise<void>) | undefined
const app = buildApp({ logger: false, afterAuthorizeRequest: async request => {
  if (request.routeOptions.url === '/api/v1/workbench/configuration-readiness' && afterAuthorization) {
    const action = afterAuthorization; afterAuthorization = undefined; await action()
  }
} })
type Human = { id: string; cookie: string; csrf: string; workspaceId: string }
let admin: Human
const base = '/api/v1/workbench/configuration-readiness'
const url = (teamId: string, extra: Record<string, string> = {}) =>
  `${base}?${new URLSearchParams({ teamId, workKind: 'repository', ...extra })}`
const get = (human: Human, teamId: string, extra: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: url(teamId, extra), headers: { cookie: human.cookie } })
const mutate = async (method: 'POST' | 'PUT', route: string, payload: object, headers: Record<string, string> = {}) => {
  const reply = await app.inject({ method, url: route, payload,
    headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf, 'idempotency-key': randomUUID(), ...headers } })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply
}
async function team(workspaceId = admin.workspaceId): Promise<string> {
  return (await db.query<{ id: string }>('INSERT INTO teams(workspace_id,name,key) VALUES($1,$2,$3) RETURNING id',
    [workspaceId, 'Readiness fixture', `T${randomUUID().slice(0, 6)}`])).rows[0]!.id
}
async function human(teams: string[], workspaceId = admin.workspaceId, role = 'member'): Promise<Human> {
  const id = (await db.query<{ id: string }>(
    `INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash)
     VALUES($1,'human',$2,$3,'Readiness fixture','unused') RETURNING id`,
    [workspaceId, role, `${randomUUID()}@readiness.test`])).rows[0]!.id
  for (const teamId of teams) await db.query('INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,\'member\')',
    [workspaceId, teamId, id])
  const token = opaqueToken(), csrf = opaqueToken()
  await db.query('INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval \'1 hour\')',
    [id, tokenHash(token), csrf])
  return { id, cookie: `workmesh_session=${token}`, csrf, workspaceId }
}
async function project(teamId: string): Promise<string> {
  return (await db.query<{ id: string }>('INSERT INTO projects(workspace_id,team_id,name) VALUES($1,$2,\'Readiness project\') RETURNING id',
    [admin.workspaceId, teamId])).rows[0]!.id
}
async function model(owner: Human, scope: 'personal' | 'team' | 'workspace', teamId?: string,
  status = 'active', enabled = true): Promise<{ connectionId: string; modelId: string }> {
  const connectionId = (await db.query<{ id: string }>(
    `INSERT INTO workbench_llm_connections(workspace_id,scope,owner_actor_id,team_id,name,api_type,base_url,status,
       secret_ciphertext,created_by_actor_id,revoked_at)
     VALUES($1,$2,$3,$4,$5,'openai-completions','https://example.test/v1',$6,$7,$8,$9) RETURNING id`,
    [owner.workspaceId, scope, scope === 'personal' ? owner.id : null, scope === 'team' ? teamId : null,
      `Private fixture ${randomUUID()}`, status, Buffer.from('fixture-only'), owner.id, status === 'revoked' ? new Date() : null])).rows[0]!.id
  const modelId = (await db.query<{ id: string }>(
    `INSERT INTO workbench_llm_models(workspace_id,connection_id,external_model_id,display_name,enabled,capabilities)
     VALUES($1,$2,'fixture','Fixture model',$3,'{}') RETURNING id`, [owner.workspaceId, connectionId, enabled])).rows[0]!.id
  return { connectionId, modelId }
}
async function agent(teamId: string, capabilities = ['work:read']): Promise<string> {
  const registered = await mutate('POST', '/api/v1/agents/register', { name: 'Readiness agent', slug: `readiness-${randomUUID().slice(0, 8)}`,
    provider: 'fake', version: '1', supportedProtocols: ['native_http'], requestedCapabilities: capabilities, approvedCapabilities: capabilities })
  const agentId = registered.json<{ id: string }>().id
  await mutate('PUT', `/api/v1/agents/${agentId}/team-access/${teamId}`, { approvedCapabilities: capabilities })
  return agentId
}
async function repository(teamId: string, target: { projectId?: string; workItemId?: string }, provider = 'fake', branch = 'main') {
  const serviceId = (await db.query<{ id: string }>(
    `INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'service','Readiness provider') RETURNING id`, [admin.workspaceId])).rows[0]!.id
  const providerId = (await db.query<{ id: string }>(
    `INSERT INTO provider_connections(workspace_id,provider,external_account_id,display_name,service_actor_id,webhook_secret_ciphertext,
       installation_id,credentials_ciphertext)
     VALUES($1,$2,$3,'Readiness provider',$4,$5,'fixture-installation',$5) RETURNING id`,
    [admin.workspaceId, provider, randomUUID(), serviceId, Buffer.from('fixture-only')])).rows[0]!.id
  const repositoryId = (await db.query<{ id: string }>(
    `INSERT INTO repositories(workspace_id,connection_id,team_id,external_id,full_name,default_branch)
     VALUES($1,$2,$3,$4,'fixture/repository','main') RETURNING id`, [admin.workspaceId, providerId, teamId, randomUUID()])).rows[0]!.id
  await db.query(`INSERT INTO repository_contexts(workspace_id,repository_id,project_id,work_item_id,base_branch,base_sha,
    branch_pattern,allowed_paths,permissions,guidance_manifest_hash,created_by_actor_id)
    VALUES($1,$2,$3,$4,$5,'fixture-base','work/*',ARRAY['.'],ARRAY['read'],'fixture-manifest',$6)`,
  [admin.workspaceId, repositoryId, target.projectId ?? null, target.workItemId ?? null, branch, admin.id])
  return { providerId, repositoryId }
}
async function workItem(teamId: string, projectId?: string) {
  await db.query(`INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'admin') ON CONFLICT DO NOTHING`,
    [admin.workspaceId, teamId, admin.id])
  const statusId = (await db.query<{ id: string }>(
    `INSERT INTO workflow_states(workspace_id,team_id,name,category,position) VALUES($1,$2,'Ready','planned',0) RETURNING id`,
    [admin.workspaceId, teamId])).rows[0]!.id
  const work = await mutate('POST', '/api/v1/work-items', { teamId, projectId, statusId, title: 'Readiness work', responsibleHumanActorId: admin.id })
  return work.json<{ id: string; revision: number }>()
}
const parsed = async (human: Human, teamId: string, extra: Record<string, string> = {}): Promise<ConfigurationReadinessResponse> => {
  const response = await get(human, teamId, extra)
  expect(response.statusCode, response.body).toBe(200)
  expect(response.headers['cache-control']).toBe('no-store')
  return configurationReadinessResponseSchema.parse(response.json())
}
const error = (reply: { json: () => { error: Record<string, unknown> } }) => {
  const { correlationId: _correlationId, ...body } = reply.json().error
  return body
}
async function snapshot(): Promise<Record<string, { count: number; digest: string }>> {
  const tables = await db.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
  const rows: Record<string, { count: number; digest: string }> = {}
  for (const { tablename } of tables.rows) {
    if (!/^[a-z0-9_]+$/.test(tablename)) throw new Error('Unexpected test table name')
    rows[tablename] = (await db.query<{ count: number; digest: string }>(
      `SELECT count(*)::int AS count,md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]')) AS digest FROM public."${tablename}" r`)).rows[0]!
  }
  return rows
}

describe('配置就绪只读投影', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE workspaces CASCADE')
    const installed = await app.inject({ method: 'POST', url: '/api/v1/auth/install',
      payload: { name: 'Readiness Test', slug: `readiness-${randomUUID().slice(0, 8)}`, adminName: 'Admin',
        email: `${randomUUID()}@readiness.test`, password: 'readiness-test-password' },
      headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! } })
    expect(installed.statusCode, installed.body).toBe(200)
    const me = installed.json<{ csrfToken: string; actor: { id: string; workspace_id: string } }>()
    const actor = (await db.query<{ id: string; workspace_id: string }>("SELECT id,workspace_id FROM actors WHERE kind='human' LIMIT 1")).rows[0]!
    admin = { id: actor.id, workspaceId: actor.workspace_id, csrf: me.csrfToken,
      cookie: String(installed.headers['set-cookie']).split(';')[0]! }
  })
  afterAll(async () => { afterAuthorization = undefined; await app.close(); await db.end() })

  it('#8 原验收1：四项检查各自的 happy path', async () => {
    const teamId = await team(), reader = await human([teamId]), projectId = await project(teamId)
    const empty = await parsed(reader, teamId)
    expect(empty.checks.model.state).toBe('blocked'); expect(empty.checks.agent.state).toBe('blocked')
    expect(empty.checks.repository.state).toBe('blocked'); expect(empty.checks.runner.state).toBe('unknown')
    await model(reader, 'team', teamId); await agent(teamId); await repository(teamId, { projectId })
    expect((await parsed(reader, teamId, { projectId })).checks).toMatchObject({ model: { state: 'ready' }, agent: { state: 'ready' },
      repository: { state: 'ready' }, runner: { state: 'unknown' } })
  })

  it('#8 原验收2：跨 Team 与他人个人模型**不泄露存在性**', async () => {
    const ownTeam = await team(), hiddenTeam = await team(), reader = await human([ownTeam])
    const baseline = await parsed(reader, ownTeam)
    await model(await human([ownTeam]), 'personal'); await model(admin, 'team', hiddenTeam)
    await agent(hiddenTeam); await repository(hiddenTeam, { projectId: await project(hiddenTeam) })
    expect(await parsed(reader, ownTeam)).toEqual(baseline)
    const hidden = await get(reader, hiddenTeam), missing = await get(reader, randomUUID())
    expect(hidden.statusCode).toBe(404); expect(error(hidden)).toEqual(error(missing))
    const hiddenProject = await project(hiddenTeam)
    expect(error(await get(reader, ownTeam, { projectId: hiddenProject }))).toEqual(error(await get(reader, ownTeam, { projectId: randomUUID() })))
    const otherWorkspace = (await db.query<{ id: string }>("INSERT INTO workspaces(name,slug) VALUES('Other',$1) RETURNING id", [randomUUID()])).rows[0]!.id
    const otherTeam = await team(otherWorkspace), outsider = await human([otherTeam], otherWorkspace, 'admin')
    await model(outsider, 'workspace')
    expect(await parsed(reader, ownTeam)).toEqual(baseline)
    expect(error(await get(reader, otherTeam))).toEqual(error(missing))
    expect((await get(outsider, ownTeam)).statusCode).toBe(404)
  })

  it('#8 原验收3：**无 assignment 的空闲 Runner 不得被报成离线**（`unknown`）', async () => {
    const teamId = await team()
    expect((await parsed(admin, teamId)).checks.runner.state).toBe('unknown')
    const agentId = await agent(teamId, ['work:read', 'work:write']), work = await workItem(teamId)
    expect((await parsed(admin, teamId)).checks.runner.state).toBe('unknown')
    const started = await mutate('POST', `/api/v1/work-items/${work.id}/agent-session`, {
      agentId, principalHumanActorId: admin.id, role: 'executor', requestedCapabilities: ['work:read', 'work:write'], initialPrompt: 'Fixture', budget: {},
    }, { 'if-match': `"revision-${work.revision}"` })
    const sessionId = started.json<{ session: { id: string } }>().session.id
    await db.query("UPDATE agent_sessions SET last_heartbeat_at=now()-interval '1 day' WHERE id=$1", [sessionId])
    expect((await parsed(admin, teamId)).checks.runner.state).toBe('unknown')
    const bearer = await seedAgentSessionBearer(db, sessionId, agentId)
    const runnerHeaders = { authorization: `Bearer ${bearer}`, 'idempotency-key': randomUUID() }
    const ack = await app.inject({ method: 'POST', url: `/api/v1/agent-sessions/${sessionId}/ack`,
      payload: { summary: 'Fixture ready', externalUrls: [] }, headers: runnerHeaders })
    expect(ack.statusCode, ack.body).toBe(200)
    const executing = await app.inject({ method: 'POST', url: `/api/v1/agent-sessions/${sessionId}/state`,
      payload: { state: 'executing', reason: 'Fixture' }, headers: { ...runnerHeaders, 'idempotency-key': randomUUID(),
        'if-match': `"revision-${ack.json<{ revision: number }>().revision}"` } })
    expect(executing.statusCode, executing.body).toBe(200)
    expect((await parsed(admin, teamId)).checks.runner.state).toBe('unknown')
    const denied = await app.inject({ method: 'GET', url: url(teamId), headers: { authorization: `Bearer ${bearer}` } })
    expect(denied.statusCode).toBe(403)
  })

  it('#8 原验收4：模型 disabled → `blocked`；模型属于他人 → 对该调用者 `blocked` 且不泄露', async () => {
    const teamId = await team(), reader = await human([teamId])
    const baseline = await parsed(reader, teamId)
    const disabled = await model(reader, 'personal', undefined, 'active', false)
    await model(reader, 'team', teamId, 'disabled'); await model(reader, 'team', teamId, 'revoked')
    await model(await human([teamId]), 'personal')
    expect(await parsed(reader, teamId)).toEqual(baseline)
    await db.query('UPDATE workbench_llm_models SET enabled=true WHERE id=$1', [disabled.modelId])
    expect((await parsed(reader, teamId)).checks.model.state).toBe('ready')
    await db.query("UPDATE workbench_llm_connections SET status='disabled' WHERE id=$1", [disabled.connectionId])
    expect(await parsed(reader, teamId)).toEqual(baseline)
    const shared = await model(admin, 'workspace')
    expect((await parsed(reader, teamId)).checks.model.state).toBe('ready')
    await db.query("UPDATE workbench_llm_connections SET status='revoked',revoked_at=now() WHERE id=$1", [shared.connectionId])
  })

  it('#8 原验收5：非仓库工作 → `not_applicable` 而非 `blocked`', async () => {
    const teamId = await team(), reader = await human([teamId]), selected = await project(teamId), other = await project(teamId)
    await repository(teamId, { projectId: other })
    expect((await parsed(reader, teamId, { projectId: selected })).checks.repository.state).toBe('blocked')
    expect((await parsed(reader, teamId)).checks.repository.state).toBe('ready')
    expect((await parsed(reader, teamId, { workKind: 'non_repository', projectId: selected })).checks.repository)
      .toEqual({ applicability: 'not_applicable', state: null, reasonCode: 'non_repository_work' })
    const work = await workItem(teamId, selected)
    expect((await parsed(reader, teamId, { workItemId: work.id })).checks.repository.state).toBe('blocked')
    await repository(teamId, { workItemId: work.id })
    expect((await parsed(reader, teamId, { workItemId: work.id, projectId: selected })).checks.repository.state).toBe('ready')
    expect((await get(reader, teamId, { workItemId: work.id, projectId: other })).statusCode).toBe(404)
    expect((await get(reader, teamId, { workKind: 'non_repository', projectId: randomUUID() })).statusCode).toBe(404)
    await repository(teamId, { projectId: selected })
    expect((await parsed(reader, teamId, { workItemId: work.id })).checks.repository.state).toBe('ready')
    await db.query('UPDATE projects SET deleted_at=now() WHERE id=$1', [selected])
    expect((await get(reader, teamId, { projectId: selected })).statusCode).toBe(404)
  })

  it('#8 原验收6：断言**无状态/事件/outbox/receipt 写入**（不是「事务计数为 0」）', async () => {
    const teamId = await team(), reader = await human([teamId])
    const before = await snapshot()
    expect((await get(reader, teamId)).statusCode).toBe(200)
    expect((await get(reader, teamId)).statusCode).toBe(200)
    const parallel = await Promise.all([get(reader, teamId), get(reader, teamId)])
    expect(parallel.map(reply => reply.statusCode)).toEqual([200, 200])
    const key = randomUUID()
    for (let repeat = 0; repeat < 2; repeat++)
      expect((await app.inject({ method: 'GET', url: url(teamId), headers: { cookie: reader.cookie,
        'idempotency-key': key, 'if-match': '"revision-0"' } })).statusCode).toBe(200)
    for (const query of ['teamId=bad&workKind=repository', `teamId=${teamId}`, `teamId=${teamId}&workKind=invalid`,
      `teamId=${teamId}&workKind=repository&projectId=bad`, `teamId=${teamId}&workKind=repository&teamId=${teamId}`])
      expect((await app.inject({ method: 'GET', url: `${base}?${query}`, headers: { cookie: reader.cookie } })).statusCode).toBe(400)
    expect(await snapshot()).toEqual(before)
    const original = Pool.prototype.query
    const failure = vi.spyOn(Pool.prototype, 'query').mockImplementation(function (this: Pool, ...args: unknown[]) {
      if (typeof args[0] === 'string' && args[0].includes('/* configuration-readiness */')) throw new Error('Injected query failure')
      return Reflect.apply(original, this, args) as ReturnType<Pool['query']>
    })
    try {
      const failed = await get(reader, teamId)
      expect(failed.statusCode).toBe(500)
      expect(failed.json()).not.toHaveProperty('checks')
    } finally { failure.mockRestore() }
    expect(await snapshot()).toEqual(before)
    const denied = await app.inject({ method: 'GET', url: url(teamId) })
    expect(denied.statusCode).toBe(401)
    const after = await snapshot()
    expect(after.authorization_denials!.count).toBeGreaterThan(before.authorization_denials!.count)
    delete before.authorization_denials; delete after.authorization_denials
    expect(after).toEqual(before)
  })

  it('#8 原验收7：路由策略矩阵用生成器重生成，不手改', async () => {
    const policy = routePolicyManifest.find(p => p.operationId === 'getConfigurationReadiness')!
    expect(policy).toMatchObject({ method: 'GET', actorKinds: ['human'], revision: 'none', idempotency: 'none', audit: { denial: 'required' } })
    expect(await readFile(new URL('../../../docs/route-policy-matrix.md', import.meta.url), 'utf8')).toContain(policy.policyId)
    await app.ready()
    expect(app.hasRoute({ method: 'GET', url: base })).toBe(true)
    expect(app.hasRoute({ method: 'POST', url: base })).toBe(false)
  })

  it.each(['首次', '已有会话', '过期会话'] as const)(
    '审查回归：有效 Installation Token %s及重复 Human-only 请求只写拒绝审计', async scenario => {
      const teamId = await team()
      await db.query(`INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'admin')`,
        [admin.workspaceId, teamId, admin.id])
      const agentId = await agent(teamId)
      const slug = (await db.query<{ slug: string }>('SELECT slug FROM agent_definitions WHERE id=$1', [agentId])).rows[0]!.slug
      const coordinatorApp = buildApp({ logger: false, features: loadFeatureConfig({ ...process.env,
        WORKMESH_BETA_COORDINATION_MCP: 'true', WORKMESH_BETA_MODEL_PRESETS: 'true',
        WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS: 'true' }) })
      try {
        const created = await coordinatorApp.inject({ method: 'POST', url: '/api/v1/agent-connections',
          headers: { cookie: admin.cookie, 'x-csrf-token': admin.csrf, 'idempotency-key': randomUUID() },
          payload: { name: 'Readiness rejection fixture', agentSlug: slug, clientType: 'codex', teamId,
            principalHumanActorId: admin.id, requestedCapabilities: ['work:read'], grantAgentDelegate: false } })
        expect(created.statusCode, created.body).toBe(201)
        const envelope = created.json<{ connection: { id: string }; connect_url: string }>()
        const redeemed = await coordinatorApp.inject({ method: 'POST', url: '/api/v1/agent-connections/redeem',
          headers: { 'idempotency-key': randomUUID() }, payload: { pairingCode: new URL(envelope.connect_url).hash.slice(1),
            agentSlug: slug, client: { type: 'codex', version: '1.1.0' } } })
        expect(redeemed.statusCode).toBe(200)
        const token = redeemed.json<{ installation_token: string }>().installation_token
        const identity = () => coordinatorApp.inject({ method: 'GET', url: '/api/v1/agent-connections/current-identity',
          headers: { 'x-workmesh-installation-token': token } })
        expect((await db.query('SELECT id FROM agent_coordination_sessions WHERE connection_id=$1', [envelope.connection.id])).rowCount).toBe(0)
        let previousSessionId: string | undefined
        if (scenario !== '首次') {
          const resolved = await identity()
          expect(resolved.statusCode, resolved.body).toBe(200)
          previousSessionId = resolved.json<{ coordination_session: { id: string } }>().coordination_session.id
          if (scenario === '过期会话') await db.query(
            "UPDATE agent_coordination_sessions SET expires_at=now()-interval '1 minute' WHERE connection_id=$1",
            [envelope.connection.id])
        }
        const before = await snapshot()
        const { authorization_denials: auditBefore, ...domainBefore } = before
        // C3 公开目录不解析附带的有效凭据，也不创建或续期身份。
        for (const headers of [{}, { 'x-workmesh-installation-token': token },
          { 'x-workmesh-installation-token': token, cookie: admin.cookie }]) {
          const catalog = await coordinatorApp.inject({ method: 'GET', url: '/api/v1/workbench/model-presets', headers })
          expect(catalog.statusCode, catalog.body).toBe(200)
          expect(catalog.json().entries).toHaveLength(9)
          expect(catalog.body).not.toContain(token)
          expect(await snapshot()).toEqual(before)
        }
        // 包含重复请求和同时携带 Human cookie 的请求，不能绕过凭据类型拒绝。
        const requests = [
          { method: 'GET' as const, route: url(teamId), operation: 'getConfigurationReadiness' },
          { method: 'GET' as const, route: '/api/v1/workbench/llm-connections', operation: 'listWorkbenchLlmConnections' },
          // C1 的读取与本人写命令同样须在 identity 副作用前拒绝；不存在的目标不能代替身份拒绝。
          { method: 'GET' as const, route: '/api/v1/notification-channel-targets/config', operation: 'getNotificationChannelConfig' },
          { method: 'GET' as const, route: '/api/v1/notification-channel-targets', operation: 'listNotificationChannelTargets' },
          { method: 'GET' as const, route: '/api/v1/channel-notification-deliveries', operation: 'listChannelNotificationDeliveries' },
          { method: 'POST' as const, route: '/api/v1/notification-channel-targets', operation: 'createNotificationChannelTarget' },
          { method: 'PATCH' as const, route: `/api/v1/notification-channel-targets/${randomUUID()}`, operation: 'updateNotificationChannelTarget' },
          { method: 'DELETE' as const, route: `/api/v1/notification-channel-targets/${randomUUID()}`, operation: 'revokeNotificationChannelTarget' },
          { method: 'POST' as const, route: `/api/v1/channel-notification-deliveries/${randomUUID()}/reconcile`, operation: 'reconcileChannelNotificationDelivery' },
        ].flatMap(route => [false, false, true].map(withCookie => ({ ...route, withCookie })))
        for (const [index, { method, route, operation, withCookie }] of requests.entries()) {
          const denied = await coordinatorApp.inject({ method, url: route,
            headers: { 'x-workmesh-installation-token': token, ...(withCookie ? { cookie: admin.cookie } : {}) } })
          expect(denied.statusCode, denied.body).toBe(403)
          expect(denied.json().error).toMatchObject({ code: 'FORBIDDEN', details: { authorizationStage: 'identity' } })
          expect(denied.body).not.toContain(token)
          const { authorization_denials: auditAfter, ...domainAfter } = await snapshot()
          expect(domainAfter).toEqual(domainBefore)
          expect(auditAfter!.count).toBe(auditBefore!.count + index + 1)
          const audit = (await db.query<{ operation_id: string; reason_code: string; authorization_stage: string; principal_actor_id: string | null }>(
            'SELECT operation_id,reason_code,authorization_stage,principal_actor_id FROM authorization_denials WHERE correlation_id=$1',
            [denied.json().error.correlationId])).rows[0]
          expect(audit).toEqual({ operation_id: operation, reason_code: 'FORBIDDEN',
            authorization_stage: 'identity', principal_actor_id: null })
        }
        // 在快照比较之外调用正常身份端点，证明凭据确实有效，而非伪造 token 的无写入假阳性。
        const resolved = await identity()
        expect(resolved.statusCode, resolved.body).toBe(200)
        const sessionId = resolved.json<{ coordination_session: { id: string } }>().coordination_session.id
        if (scenario === '已有会话') expect(sessionId).toBe(previousSessionId)
        if (scenario === '过期会话') expect(sessionId).not.toBe(previousSessionId)
      } finally { await coordinatorApp.close() }
    })

  it('R1-8-1 visible active模型+enabled model、active Agent及仓库上下文正确；Runner恒unknown', async () => {
    const teamId = await team(), reader = await human([teamId]), projectId = await project(teamId)
    const ownModel = await model(reader, 'personal'), agentId = await agent(teamId)
    const repo = await repository(teamId, { projectId })
    const checks = (await parsed(reader, teamId, { projectId })).checks
    expect(checks.model.state).toBe('ready'); expect(checks.agent.state).toBe('ready')
    expect(checks.repository.state).toBe('ready'); expect(checks.runner.state).toBe('unknown')
    afterAuthorization = async () => { await db.query('UPDATE agent_team_access SET revoked_at=now() WHERE agent_id=$1 AND team_id=$2', [agentId, teamId]) }
    expect((await parsed(reader, teamId)).checks.agent.state).toBe('blocked')
    await db.query('UPDATE agent_team_access SET revoked_at=NULL WHERE agent_id=$1 AND team_id=$2', [agentId, teamId])
    expect((await parsed(reader, teamId)).checks.agent.state).toBe('ready')
    await db.query('UPDATE agent_definitions SET is_active=false WHERE id=$1', [agentId])
    expect((await parsed(reader, teamId)).checks.agent.state).toBe('blocked')
    afterAuthorization = async () => { await db.query('UPDATE workbench_llm_models SET enabled=false WHERE id=$1', [ownModel.modelId]) }
    expect((await parsed(reader, teamId)).checks.model.state).toBe('blocked')
    await db.query('UPDATE repositories SET active=false WHERE id=$1', [repo.repositoryId])
    expect((await parsed(reader, teamId, { projectId })).checks.repository.state).toBe('blocked')
    await db.query('UPDATE repositories SET active=true WHERE id=$1', [repo.repositoryId])
    await db.query('UPDATE provider_connections SET active=false WHERE id=$1', [repo.providerId])
    expect((await parsed(reader, teamId, { projectId })).checks.repository.state).toBe('blocked')
  })

  it('R1-8-2 跨workspace/Team及personal模型不可见，不泄漏存在性', async () => {
    const one = await team(), two = await team(), reader = await human([one, two])
    await model(admin, 'team', two)
    expect((await parsed(reader, one)).checks.model.state).toBe('blocked')
    expect((await parsed(reader, two)).checks.model.state).toBe('ready')
    const personal = await model(reader, 'personal')
    expect((await parsed(reader, one)).checks.model.state).toBe('ready')
    expect((await parsed(await human([one]), one)).checks.model.state).toBe('blocked')
    await db.query("UPDATE workbench_llm_connections SET status='disabled' WHERE id=$1", [personal.connectionId])
  })

  it('R1-8-8 两个Team并行查询不串投影；撤权后下一次读按实时授权收敛', async () => {
    const one = await team(), two = await team(), reader = await human([one, two])
    await model(admin, 'team', one); await agent(one)
    const results = await Promise.all([parsed(reader, one), parsed(reader, two)])
    expect(results[0]!.checks.model.state).toBe('ready'); expect(results[1]!.checks.model.state).toBe('blocked')
    expect(results[0]!.checks.agent.state).toBe('ready'); expect(results[1]!.checks.agent.state).toBe('blocked')
    afterAuthorization = async () => { await db.query('DELETE FROM memberships WHERE team_id=$1 AND actor_id=$2', [one, reader.id]) }
    const denied = await get(reader, one)
    expect(denied.statusCode).toBe(404); expect(error(denied)).toEqual(error(await get(reader, randomUUID())))
    expect((await get(reader, two)).statusCode).toBe(200)
    afterAuthorization = async () => { await db.query('UPDATE sessions SET revoked_at=now() WHERE actor_id=$1', [reader.id]) }
    expect((await get(reader, two)).statusCode).toBe(404)
    expect((await get(reader, two)).statusCode).toBe(401)
    const deactivated = await human([two])
    afterAuthorization = async () => { await db.query('UPDATE actors SET is_active=false WHERE id=$1', [deactivated.id]) }
    expect((await get(deactivated, two)).statusCode).toBe(404)
    expect((await get(deactivated, two)).statusCode).toBe(401)
    const demoted = await human([], admin.workspaceId, 'admin')
    expect((await get(demoted, two)).statusCode).toBe(200)
    afterAuthorization = async () => { await db.query("UPDATE actors SET workspace_role='member' WHERE id=$1", [demoted.id]) }
    expect((await get(demoted, two)).statusCode).toBe(404)
  })

  it('空 base branch 与关闭的 Gitea 不被报告就绪', async () => {
    const teamId = await team(), projectId = await project(teamId)
    await repository(teamId, { projectId }, 'fake', ' ')
    expect((await parsed(admin, teamId, { projectId })).checks.repository.state).toBe('blocked')
    await repository(teamId, { projectId }, 'gitea')
    expect((await parsed(admin, teamId, { projectId })).checks.repository.state).toBe('blocked')
    const enabled = buildApp({ logger: false, features: loadFeatureConfig({ ...process.env, WORKMESH_BETA_GITEA: 'true' }) })
    try {
      const reply = await enabled.inject({ method: 'GET', url: url(teamId, { projectId }), headers: { cookie: admin.cookie } })
      expect(reply.statusCode, reply.body).toBe(200)
      expect(reply.json<ConfigurationReadinessResponse>().checks.repository.state).toBe('ready')
    } finally { await enabled.close() }
  })
})
