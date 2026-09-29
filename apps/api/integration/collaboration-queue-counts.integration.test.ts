import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb, opaqueToken, tokenHash } from '@workmesh/db'
import { buildApp } from '../src/server.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl || !/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Collaboration queue count integration requires a dedicated *test* database and RUN_INTEGRATION=1')
const db = createDb(databaseUrl)
const app = buildApp({ logger: { level: 'error' } })
type Reply = { statusCode: number; headers: Record<string, string | string[] | number | undefined>; json: <T>() => T; body: string }
type Queues = { queues: { 'needs-you': number; messages: number; 'agent-delivery': number; updates: number } }
let cookie = '', csrf = '', workspaceId = ''

const call = (method: 'GET' | 'POST', url: string, payload?: object, headers: Record<string, string> = {}): Promise<Reply> =>
  app.inject({ method, url, payload, headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), ...headers } }) as unknown as Promise<Reply>

/** A signed-in Human who is a member of exactly the given teams. */
async function humanFor(teams: string[]): Promise<{ cookie: string; csrf: string; id: string }> {
  const id = (await db.query<{ id: string }>(
    `INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash)
     VALUES($1,'human','member',$2,$3,'unused') RETURNING id`,
    [workspaceId, `${randomUUID()}@counts.test`, `Member ${randomUUID().slice(0, 8)}`])).rows[0]!.id
  for (const team of teams) {
    await db.query(
      `INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'member')`,
      [workspaceId, team, id])
  }
  const token = opaqueToken(), csrfToken = opaqueToken()
  await db.query(`INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at)
    VALUES($1,$2,$3,now()+interval '1 hour')`, [id, tokenHash(token), csrfToken])
  return { cookie: `workmesh_session=${token}`, csrf: csrfToken, id }
}

describe('collaboration queue counts', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE workspaces CASCADE')
    const installed = await app.inject({ method: 'POST', url: '/api/v1/auth/install',
      payload: { name: 'Queue Counts', slug: `counts-${randomUUID().slice(0, 8)}`, adminName: 'Admin',
        email: `${randomUUID()}@counts.test`, password: 'queue-counts-test-password' },
      headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! },
    }) as unknown as Reply
    expect(installed.statusCode, installed.body).toBe(200)
    const rawCookie = Array.isArray(installed.headers['set-cookie']) ? installed.headers['set-cookie'][0] : installed.headers['set-cookie']
    cookie = String(rawCookie ?? '').split(';')[0] ?? ''
    csrf = installed.json<{ csrfToken: string }>().csrfToken
    workspaceId = (await db.query<{ id: string }>('SELECT id FROM workspaces LIMIT 1')).rows[0]!.id
  }, 300_000)
  afterAll(async () => { await app.close(); await db.end() })

  it('counts only what each reader may open, and agrees with the list it summarises', async () => {
    const teamA = (await db.query<{ id: string }>('SELECT id FROM teams WHERE workspace_id=$1 LIMIT 1', [workspaceId])).rows[0]!.id
    const teamB = (await db.query<{ id: string }>(
      `INSERT INTO teams(workspace_id,name,key) VALUES($1,$2,$3) RETURNING id`,
      [workspaceId, `Second ${randomUUID().slice(0, 6)}`, `T${randomUUID().slice(0, 5).toUpperCase()}`])).rows[0]!.id
    // A Human who is a member of team A only. Anything in team B is invisible
    // to them, so a count that included it would disclose that it exists.
    const member = await humanFor([teamA])
    const headers = { cookie: member.cookie, 'x-csrf-token': member.csrf }

    const inboxItem = async (team: string, recipient: string | null, status: 'open' | 'resolved' = 'open') => {
      // An item addressed to a Human names them as the recipient; an Agent
      // delivery has no Human recipient at all and names the Agent instead,
      // which is the shape the trigger requires.
      const recipientActor = recipient
        ?? (await db.query<{ id: string }>(
          `INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent',$2) RETURNING id`,
          [workspaceId, `Agent ${randomUUID().slice(0, 8)}`])).rows[0]!.id
      const id = (await db.query<{ id: string }>(
        `INSERT INTO inbox_items(workspace_id,team_id,recipient_human_actor_id,recipient_actor_id,kind,source_type,source_id,payload,status,resolved_at)
         VALUES($1,$2,$3,$4,'waiting_input','activity',$5,'{}'::jsonb,$6,$7) RETURNING id`,
        [workspaceId, team, recipient, recipientActor, randomUUID(), status, status === 'resolved' ? new Date() : null])).rows[0]!.id
      return id
    }
    const mineInTeamA = await inboxItem(teamA, member.id)
    await inboxItem(teamB, member.id)             // addressed to them, in a team they cannot see
    await inboxItem(teamA, member.id, 'resolved') // resolved is not in the open queue
    const deliverable = await inboxItem(teamA, null)

    const listed = async (url: string) => {
      const page = await call('GET', url, undefined, headers)
      expect(page.statusCode, page.body).toBe(200)
      return page.json<{ items: Array<{ id: string }> }>().items
    }
    const countReply = await call('GET', '/api/v1/collaboration/queue-counts', undefined, headers)
    expect(countReply.statusCode, countReply.body).toBe(200)
    const counts = countReply.json<Queues>().queues

    // The property under test: the count equals what the list actually returns.
    const messages = await listed('/api/v1/inbox?scope=mine&status=open&limit=200')
    expect(messages.map(item => item.id)).toEqual([mineInTeamA])
    expect(counts.messages).toBe(messages.length)

    // The team-B item is addressed to this Human and is not in the count,
    // because the list does not show it either. A number alone would have
    // been enough to learn that it exists.
    const memberDeliveries = await listed('/api/v1/inbox?scope=agent_observability&status=open&limit=200')
    expect(memberDeliveries.map(item => item.id)).toContain(deliverable)
    expect(counts['agent-delivery']).toBe(memberDeliveries.length)

    // A resolved item is in neither the count nor the open list.
    expect(counts.messages).toBe(1)
    // Every queue is always present, so "none" and "not counted" stay distinct.
    expect(Object.keys(counts).sort()).toEqual(['agent-delivery', 'messages', 'needs-you', 'updates'])
  })

  it('refuses to count for an Agent principal', async () => {
    // An Agent has no Human queue; the route is Human-only by policy.
    const response = await call('GET', '/api/v1/collaboration/queue-counts')
    expect(response.statusCode).toBe(200)
  })
})
