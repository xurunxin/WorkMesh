// 隔离测量入口：调用发行包的原路由和真实 PG；不供产品加载。
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const appRoot = process.argv[2] ?? '/app';
const lockControl = process.argv.includes('--lock-control');
const requireApp = createRequire(`${appRoot}/package.json`);
const { Client, Pool } = requireApp('pg');
const sha = value => createHash('sha256').update(value).digest('hex');
const context = new AsyncLocalStorage();
const requestTraces = new Map();
const querySource = new Map();
const queryOriginal = Client.prototype.query;
const connectOriginal = Pool.prototype.connect;

Client.prototype.query = function (...args) {
  const trace = context.getStore();
  if (!trace) return queryOriginal.apply(this, args);
  const text = typeof args[0] === 'string' ? args[0] : args[0].text;
  const textSha256 = sha(text);
  querySource.set(textSha256, text); // 仅静态 SQL 模板；不记录参数。
  const row = { ordinal: trace.queries.length, backendPid: this.processID,
    phase: trace.phase, textSha256, verb: text.trim().split(/\s+/)[0],
    startedMs: performance.now() - trace.began };
  trace.queries.push(row);
  const start = performance.now();
  const finish = (error, result) => {
    row.wallMs = performance.now() - start;
    row.status = error ? 'error' : 'completed';
    row.rowCount = result?.rowCount ?? null;
    if (trace.phase === 'handler') {
      trace.lastHandlerQueryFinishedMs = performance.now() - trace.began;
      trace.lastHandlerQueryCpu = process.cpuUsage();
    }
    if (text === 'COMMIT' && trace.phase === 'identity') {
      trace.identityCommittedMs = performance.now() - trace.began;
      trace.phase = 'authorization';
    }
  };
  if (typeof args.at(-1) === 'function') {
    const callback = args.at(-1);
    args[args.length - 1] = (error, result) => { finish(error, result); callback(error, result); };
    return queryOriginal.apply(this, args);
  }
  return queryOriginal.apply(this, args).then(result => { finish(null, result); return result; },
    error => { finish(error); throw error; });
};
Pool.prototype.connect = function (...args) {
  const trace = context.getStore();
  if (!trace) return connectOriginal.apply(this, args);
  const start = performance.now();
  const finish = (error, client) => trace.acquires.push({ wallMs: performance.now() - start,
    backendPid: client?.processID ?? null, status: error ? 'error' : 'completed',
    waitingCount: this.waitingCount, totalCount: this.totalCount, idleCount: this.idleCount });
  if (typeof args[0] === 'function') {
    const callback = args[0];
    args[0] = (error, client, release) => { finish(error, client); callback(error, client, release); };
    return connectOriginal.apply(this, args);
  }
  return connectOriginal.apply(this, args).then(client => { finish(null, client); return client; },
    error => { finish(error); throw error; });
};

// test 仅用于禁止 server.js 导入时自动 listen；构造 app 前恢复 production。
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:5432/ta01_auth_path_test?application_name=ta01-api-auth-path';
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.SESSION_SECRET = randomBytes(48).toString('base64url');
process.env.WORKMESH_MASTER_KEY = randomBytes(32).toString('hex');
process.env.AUTH_RATE_LIMIT_HMAC_KEY = randomBytes(48).toString('base64url');
process.env.WORKMESH_BOOTSTRAP_TOKEN = randomBytes(48).toString('base64url');
process.env.WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK = 'true';
process.env.WORKMESH_BETA_COORDINATION_MCP = 'true';
process.env.WORKMESH_BETA_GITEA = 'true';
process.env.WEB_ORIGIN = 'http://127.0.0.1:3001';
const importsStarted = performance.now();
const dbModule = await import(pathToFileURL(requireApp.resolve('@workmesh/db')));
const { buildApp } = await import(pathToFileURL(`${appRoot}/dist/server.js`));
process.env.NODE_ENV = 'production';
const importsMs = performance.now() - importsStarted;
const app = buildApp({ logger: false, afterAuthorizeRequest: async () => {
  const trace = context.getStore();
  if (trace) { trace.authorizedMs = performance.now() - trace.began; trace.phase = 'handler'; }
} });
// inject 的 caller AsyncResource 不属于 Fastify 请求；在真实 hook 的 done 内绑定。
app.addHook('onRequest', (request, _reply, done) => {
  const trace = requestTraces.get(request.headers['x-correlation-id']);
  if (trace) {
    trace.onRequestMs = performance.now() - trace.began;
    context.run(trace, done);
  } else context.exit(done);
});
app.addHook('onSend', async (_request, _reply, payload) => {
  const trace = context.getStore();
  if (trace) {
    trace.onSendMs = performance.now() - trace.began;
    if (trace.lastHandlerQueryCpu) {
      trace.handlerTail = { wallMs: trace.onSendMs - trace.lastHandlerQueryFinishedMs,
        nodeCpu: process.cpuUsage(trace.lastHandlerQueryCpu),
        scope: 'last handler SQL callback through onSend; includes JS validation and serialization' };
      delete trace.lastHandlerQueryCpu;
    }
  }
  return payload;
});
const setupDb = dbModule.createDb();
const monitor = new Client({ connectionString: process.env.DATABASE_URL,
  application_name: 'ta01-probe-monitor' });
let cookie = '', csrf = '';
const human = async (method, url, payload) => app.inject({ method, url, payload, headers: {
  cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(),
} });
const expectStatus = (response, status) => assert.equal(response.statusCode, status,
  `unexpected HTTP status ${response.statusCode}; body withheld`);
const report = { mode: 'real-api-auth-pg-path', nodeVersion: process.version,
  executableSha256: sha(readFileSync(process.execPath)), importsMs,
  transport: 'Fastify inject; original hooks/routes, actual PG/Redis, no MCP/TLS/proxy',
  serverImportNodeEnv: 'test', appBuildNodeEnv: 'production',
  fullProductAcceptance: false, runs: [] };

try {
  await monitor.connect();
  await dbModule.applyMigrations(setupDb);
  await monitor.query('CREATE EXTENSION pg_stat_statements');
  report.postgresSettings = (await monitor.query(`SELECT version() AS version,
    current_setting('max_connections') AS max_connections,
    current_setting('track_activities') AS track_activities,
    current_setting('pg_stat_statements.track_planning') AS track_planning,
    current_setting('track_io_timing') AS track_io_timing`)).rows[0];
  const install = await app.inject({ method: 'POST', url: '/api/v1/auth/install',
    headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN },
    payload: { name: 'TA01 isolated auth path', slug: 'ta01-auth-path', adminName: 'Probe',
      email: 'probe@example.test', password: randomBytes(24).toString('base64url') } });
  expectStatus(install, 200);
  const setCookie = install.headers['set-cookie'];
  cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0];
  csrf = install.json().csrfToken;
  const me = await human('GET', '/api/v1/auth/me'); expectStatus(me, 200);
  const teams = await human('GET', '/api/v1/teams'); expectStatus(teams, 200);
  const team = teams.json().items[0];
  const states = await human('GET', `/api/v1/teams/${team.id}/states`); expectStatus(states, 200);
  const project = await human('POST', '/api/v1/projects', { name: 'TA01 probe project', teamId: team.id });
  expectStatus(project, 200);
  const item = await human('POST', '/api/v1/work-items', { teamId: team.id, projectId: project.json().id,
    statusId: states.json().items[0].id, responsibleHumanActorId: me.json().actor.id, title: 'TA01 auth path' });
  expectStatus(item, 200);
  const created = await human('POST', '/api/v1/agent-connections', { name: 'TA01 path probe',
    agentSlug: 'ta01-path-probe', clientType: 'codex', teamId: team.id,
    principalHumanActorId: me.json().actor.id, requestedCapabilities: ['work:read'], grantAgentDelegate: false });
  expectStatus(created, 201);
  const redeemed = await app.inject({ method: 'POST', url: '/api/v1/agent-connections/redeem',
    headers: { 'idempotency-key': randomUUID() }, payload: {
      pairingCode: new URL(created.json().connect_url).hash.slice(1), agentSlug: 'ta01-path-probe',
      client: { type: 'codex', version: '1.1.0' } } });
  expectStatus(redeemed, 200);
  const token = redeemed.json().installation_token;
  report.fixture = { capabilities: ['work:read'], realPairing: true, realCredential: true,
    isolatedFreshDatabase: true, changedProductionAuthority: false };
  const lag = monitorEventLoopDelay({ resolution: 20 }); lag.enable();
  for (let repeat = 0; repeat < (lockControl ? 1 : 3); repeat++) {
    for (const [label, url] of [
      ['qualified-capabilities', '/api/v1/agent-capabilities?discovery=qualified'],
      ['work-item-read', `/api/v1/work-items/${item.json().id}`],
      ...(lockControl ? [['qualified-capabilities-lock-control', '/api/v1/agent-capabilities?discovery=qualified']] : []),
    ]) {
      await monitor.query('SELECT pg_stat_statements_reset()');
      let releaseControl;
      let control;
      if (label.endsWith('-lock-control')) {
        const target = new URL(process.env.DATABASE_URL);
        target.searchParams.set('application_name', 'ta01-probe-blocker');
        const blocker = new Client({ connectionString: target.toString() });
        await blocker.connect();
        await blocker.query('BEGIN');
        await blocker.query('SELECT id FROM agent_connection_credentials WHERE connection_id=$1 FOR UPDATE',
          [created.json().connection.id]);
        const held = performance.now();
        control = { kind: 'own credential row lock', blockerPid: blocker.processID, requestedHoldSeconds: 1 };
        releaseControl = blocker.query('SELECT pg_sleep(1); ROLLBACK').then(() => {
          control.heldWallMs = performance.now() - held;
        }).finally(() => blocker.end());
      }
      lag.reset();
      const trace = { repeat, label, began: performance.now(), phase: 'identity', queries: [], acquires: [], samples: [] };
      let sampleActive = false;
      const sample = async () => {
        if (sampleActive) return;
        sampleActive = true;
        try {
          const rows = (await monitor.query(`SELECT state,wait_event_type,wait_event,
            count(*)::int AS count, max(cardinality(pg_blocking_pids(pid))) AS max_blockers
            FROM pg_stat_activity WHERE datname=current_database()
              AND application_name='ta01-api-auth-path' AND pid<>pg_backend_pid()
            GROUP BY state,wait_event_type,wait_event ORDER BY state,wait_event_type,wait_event`)).rows;
          trace.samples.push({ atMs: performance.now() - trace.began, rows });
        } finally { sampleActive = false; }
      };
      const sampler = setInterval(() => { void context.exit(sample); }, 250);
      const cpu = process.cpuUsage();
      let response;
      let deadline;
      const correlation = randomUUID();
      requestTraces.set(correlation, trace);
      try {
        response = await Promise.race([
          context.run(trace, () => app.inject({ method: 'GET', url,
            headers: { 'x-workmesh-installation-token': token, 'x-correlation-id': correlation } })),
          new Promise((_, reject) => { deadline = setTimeout(() => {
            trace.deadlineReached = true;
            report.runs.push({ ...trace, began: undefined, phase: undefined });
            reject(new Error('probe request deadline reached'));
          }, 30_000); }),
        ]);
      } finally {
        clearInterval(sampler); clearTimeout(deadline); requestTraces.delete(correlation);
        await releaseControl;
      }
      trace.wallMs = performance.now() - trace.began;
      trace.nodeCpu = process.cpuUsage(cpu);
      trace.eventLoopDelayMs = { max: lag.max / 1e6, mean: Number.isFinite(lag.mean) ? lag.mean / 1e6 : null };
      while (sampleActive) await new Promise(resolve => setTimeout(resolve, 1));
      expectStatus(response, 200);
      assert.ok(trace.identityCommittedMs !== undefined && trace.authorizedMs !== undefined
        && trace.queries.length > 0, 'probe context was not propagated');
      assert.ok(trace.wallMs <= 30_000, 'probe response exceeded original request deadline');
      trace.status = response.statusCode;
      if (control) trace.control = control;
      trace.responseBytes = Buffer.byteLength(response.body);
      trace.responseSha256 = sha(response.body);
      if (label.startsWith('qualified-capabilities')) {
        const body = response.json();
        trace.responseKeys = Object.keys(body);
      } else assert.equal(response.json().id, item.json().id);
      trace.serverStatements = (await monitor.query(`SELECT queryid::text,query,calls,plans,
        total_plan_time,total_exec_time,rows,shared_blks_hit,shared_blks_read,
        blk_read_time,blk_write_time FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
          AND query NOT LIKE '%pg_stat_%' ORDER BY queryid`)).rows.map(({ query, ...row }) => ({ ...row, textSha256: sha(query) }));
      delete trace.began; delete trace.phase;
      report.runs.push(trace);
    }
  }
  lag.disable();
  // 实时撤销负例：不保存或复用上一次资格，也不恢复已撤销连接。
  const detail = await human('GET', `/api/v1/agent-connections/${created.json().connection.id}`);
  expectStatus(detail, 200);
  const revokedExact = await app.inject({ method: 'DELETE', url: `/api/v1/agent-connections/${created.json().connection.id}`,
    headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), 'if-match': detail.headers.etag } });
  expectStatus(revokedExact, 204);
  const rejected = await app.inject({ method: 'GET', url: '/api/v1/agent-capabilities?discovery=qualified',
    headers: { 'x-workmesh-installation-token': token } });
  assert.equal(rejected.statusCode, 401);
  report.revokedReadStatus = rejected.statusCode;
  report.sqlTemplates = Object.fromEntries(querySource);
  console.log(JSON.stringify(report));
} catch (error) {
  console.log(JSON.stringify({ ...report, errorType: error.name, errorCode: error.code ?? null,
    errorMessageSha256: sha(String(error.message)) }));
  process.exitCode = 1;
} finally {
  await app.close();
  await setupDb.end();
  await monitor.end();
  // server.js 内部 Pool 不导出；所有已完成请求的回执写出后显式退出。
  setTimeout(() => process.exit(process.exitCode ?? 0), 50);
}
