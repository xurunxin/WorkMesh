import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createDb } from '@workmesh/db'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('RECOVERY_SMOKE_REQUIRES_TEST_DATABASE')
}

const apiUrl = process.env.RECOVERY_SMOKE_API_URL ?? 'http://127.0.0.1:3001'
const workerUrl = process.env.RECOVERY_SMOKE_WORKER_URL ?? 'http://127.0.0.1:3003'
const webUrl = process.env.RECOVERY_SMOKE_WEB_URL ?? 'http://127.0.0.1:3000'
const agentToken = process.env.RECOVERY_SMOKE_AGENT_TOKEN
if (!agentToken) throw new Error('RECOVERY_SMOKE_AGENT_TOKEN_REQUIRED')
const reportPath = resolve(process.env.RECOVERY_SMOKE_REPORT_PATH ?? 'recovery-service-smoke.json')

const check = async (name: string, url: string): Promise<number> => {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
  if (response.status < 200 || response.status >= 400) {
    throw new Error(`RECOVERY_SMOKE_${name.toUpperCase()}_FAILED:${response.status}`)
  }
  return response.status
}

const startedAt = new Date().toISOString()
const db = createDb(databaseUrl)
try {
  const session = (await db.query<{ id: string }>(`
    SELECT session.id
      FROM agent_sessions session
      JOIN agent_definitions agent ON agent.id=session.agent_id
     WHERE agent.slug='recovery-agent'
     ORDER BY session.created_at
     LIMIT 1
  `)).rows[0]
  if (!session) throw new Error('RECOVERY_SMOKE_SESSION_MISSING')

  const [apiStatus, workerStatus, webStatus] = await Promise.all([
    check('api', `${apiUrl}/readyz`),
    check('worker', `${workerUrl}/readyz`),
    check('web', webUrl),
  ])
  const heartbeat = await fetch(`${apiUrl}/api/v1/agent-sessions/${session.id}/heartbeat`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${agentToken}`,
      'content-type': 'application/json',
      'idempotency-key': `recovery-smoke-${randomUUID()}`,
    },
    body: JSON.stringify({ usage: { runtimeSeconds: 1, toolCalls: 0 } }),
    signal: AbortSignal.timeout(10_000),
  })
  if (heartbeat.status !== 200) {
    throw new Error(`RECOVERY_SMOKE_AGENT_HEARTBEAT_FAILED:${heartbeat.status}:${(await heartbeat.text()).slice(0, 1_000)}`)
  }
  const durable = await db.query('SELECT 1 FROM agent_sessions WHERE id=$1 AND last_heartbeat_at IS NOT NULL', [session.id])
  if (durable.rowCount !== 1) throw new Error('RECOVERY_SMOKE_AGENT_HEARTBEAT_NOT_DURABLE')

  const report = {
    schemaVersion: 1,
    status: 'passed',
    startedAt,
    endedAt: new Date().toISOString(),
    checks: {
      apiReady: apiStatus,
      workerReady: workerStatus,
      webReady: webStatus,
      agentHeartbeat: heartbeat.status,
      agentHeartbeatDurable: true,
    },
  }
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  process.stdout.write(`${JSON.stringify(report)}\n`)
} finally {
  await db.end()
}
