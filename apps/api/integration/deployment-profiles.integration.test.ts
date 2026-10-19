import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { applyMigrations, createDb } from '@workmesh/db'
import { loadDeploymentProfile } from '@workmesh/config'
import { buildApp } from '../src/server.js'

if (process.env.RUN_INTEGRATION !== '1' || !process.env.DATABASE_URL || !process.env.REDIS_URL)
  throw new Error('Deployment profile integration requires isolated PostgreSQL and Redis')

const db = createDb(process.env.DATABASE_URL)
const app = buildApp({ logger: false })
beforeAll(async () => { await applyMigrations(db); await app.ready() })
afterAll(async () => { await app.close(); await db.end() })

describe('profile-independent backend boundary', () => {
  it.each(['personal', 'team', 'enterprise'] as const)('%s rejects anonymous domain access without state/event/outbox writes', async profile => {
    const checked = loadDeploymentProfile({ WORKMESH_DEPLOYMENT_PROFILE: profile, WORKMESH_QUEUE_BACKEND: 'redis',
      WORKMESH_ARTIFACT_BACKEND: 's3', WORKMESH_RUNNER_PLACEMENT: 'external', WORKMESH_API_REPLICAS: '1',
      WORKMESH_WORKER_REPLICAS: '1', WORKMESH_MCP_REPLICAS: '1', WORKMESH_BIND_ADDRESS: '127.0.0.1',
      WEB_ORIGIN: 'https://workmesh.test', PUBLIC_MCP_ORIGIN: 'https://mcp.workmesh.test', S3_PUBLIC_ENDPOINT: 'https://s3.workmesh.test',
      SESSION_COOKIE_SECURE: 'true', NODE_EXTRA_CA_CERTS: '/certificates/ca.pem' })
    expect(checked?.WORKMESH_DEPLOYMENT_PROFILE).toBe(profile)
    const counts = async () => (await db.query<{ work: string; events: string; outbox: string }>(`SELECT (SELECT count(*) FROM work_items)::text AS work,
      (SELECT count(*) FROM domain_events)::text AS events,(SELECT count(*) FROM outbox_events)::text AS outbox`)).rows[0]
    const before = await counts()
    const response = await app.inject({ method: 'POST', url: '/api/v1/work-items',
      headers: { 'idempotency-key': randomUUID() }, payload: { title: 'unauthorized profile probe' } })
    expect(response.statusCode).toBe(401)
    expect(await counts()).toEqual(before)
  })
})
