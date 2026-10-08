import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  applyMigrations,
  createDb,
  withTx,
  appendEvent,
  admitChannelEvent,
  claimChannelNotifications,
  prepareChannelSend,
  settleChannelSend,
} from '@workmesh/db'
import { loadFeatureConfig } from '@workmesh/config'
import { buildApp } from '../src/server.js'
import { seedAgentSessionBearer } from './agent-session-test-credentials.js'

const databaseUrl = process.env.DATABASE_URL
if (
  process.env.RUN_INTEGRATION !== '1' ||
  !databaseUrl ||
  !/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))
)
  throw new Error('C1 requires a dedicated integration test database')
const db = createDb(databaseUrl)
const features = loadFeatureConfig({
  WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS: 'true',
})
const app = buildApp({ features })
const root = '/api/v1/notification-channel-targets'
const deliveryRoot = '/api/v1/channel-notification-deliveries'
type Human = { cookie: string; csrf: string }
let owner: Human,
  other: Human,
  workspaceId: string,
  actorId: string,
  teamId: string,
  targetId: string,
  targetRevision: number
const secret = 'https://channel.example.test/hook?key=private-' + randomUUID()
const call = (
  human: Human,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
  extra: Record<string, string> = {},
) =>
  app.inject({
    method,
    url,
    payload,
    headers: {
      cookie: human.cookie,
      'x-csrf-token': human.csrf,
      'idempotency-key': randomUUID(),
      ...extra,
    },
  })
const body = {
  name: '个人目标',
  provider: 'wecom',
  secretMaterial: secret,
  enabled: true,
}
const revision = (value: number) => ({
  'if-match': '"revision-' + value + '"',
})

describe('C1 target ownership, redaction and reconciliation', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE workspaces CASCADE')
    const email = randomUUID() + '@channel.test',
      password = 'channel-integration-password'
    const installed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/install',
      payload: {
        name: 'C1 targets',
        slug: 'c1-' + randomUUID(),
        adminName: 'C1 owner',
        email,
        password,
      },
      headers: {
        'idempotency-key': randomUUID(),
        'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN!,
      },
    })
    expect(installed.statusCode, installed.body).toBe(200)
    owner = {
      cookie: String(installed.headers['set-cookie']).split(';')[0]!,
      csrf: installed.json<{ csrfToken: string }>().csrfToken,
    }
    const actor = (await call(owner, 'GET', '/api/v1/auth/me')).json<{
      actor: { id: string; workspace_id: string }
    }>().actor
    actorId = actor.id
    workspaceId = actor.workspace_id
    teamId = (await call(owner, 'GET', '/api/v1/teams')).json<{
      items: Array<{ id: string }>
    }>().items[0]!.id
    const otherEmail = randomUUID() + '@channel.test'
    await db.query(
      `INSERT INTO actors(workspace_id,kind,email,display_name,password_hash,workspace_role)
      SELECT workspace_id,'human',$2,'Another admin',password_hash,'admin' FROM actors WHERE id=$1`,
      [actorId, otherEmail],
    )
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: otherEmail, password },
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(login.statusCode, login.body).toBe(200)
    other = {
      cookie: String(login.headers['set-cookie']).split(';')[0]!,
      csrf: login.json<{ csrfToken: string }>().csrfToken,
    }
  })
  afterAll(async () => {
    await app.close()
    await db.end()
  })
  it('creates a redacted target, replays the same body and rejects a changed body', async () => {
    const key = randomUUID(),
      created = await call(owner, 'POST', root, body, {
        'idempotency-key': key,
      })
    expect(created.statusCode, created.body).toBe(201)
    const row = created.json<{
      id: string
      revision: number
      secret_ref: string
    }>()
    targetId = row.id
    targetRevision = row.revision
    expect(row.secret_ref).toBe(targetId)
    expect(created.body).not.toContain(secret)
    expect(created.body).not.toContain('secret_ciphertext')
    expect(
      (
        await call(owner, 'POST', root, body, { 'idempotency-key': key })
      ).json(),
    ).toEqual(created.json())
    const conflict = await call(
      owner,
      'POST',
      root,
      { ...body, secretMaterial: secret + 'different' },
      { 'idempotency-key': key },
    )
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED')
    const ciphertext = (
      await db.query<{ encrypted: boolean }>(
        `SELECT position($2::bytea IN secret_ciphertext)=0 AS encrypted FROM notification_channel_targets WHERE id=$1`,
        [targetId, Buffer.from(secret)],
      )
    ).rows[0]!
    expect(ciphertext.encrypted).toBe(true)
    const persistence = (
      await db.query(
        `SELECT payload::text AS value FROM domain_events WHERE workspace_id=$1 UNION ALL SELECT response_body::text FROM api_idempotency_keys WHERE workspace_id=$1`,
        [workspaceId],
      )
    ).rows
    expect(JSON.stringify(persistence)).not.toContain(secret)
  })
  it('rejects another admin and anonymous access and validates HTTPS without performing any probe', async () => {
    expect(
      (
        await call(
          other,
          'PATCH',
          root + '/' + targetId,
          { enabled: false },
          revision(targetRevision),
        )
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await call(
          other,
          'DELETE',
          root + '/' + targetId,
          undefined,
          revision(targetRevision),
        )
      ).statusCode,
    ).toBe(404)
    expect(
      (await call(other, 'GET', root)).json<{ items: unknown[] }>().items,
    ).toEqual([])
    expect((await app.inject({ method: 'GET', url: root })).statusCode).toBe(
      401,
    )
    const bad = await call(owner, 'POST', root, {
      ...body,
      secretMaterial: 'http://channel.example.test/hook',
    })
    expect(bad.statusCode).toBeGreaterThanOrEqual(400)
    const config = (await call(owner, 'GET', root + '/config')).json()
    expect(config).toEqual({
      redis_required: true,
      no_redis_supported: false,
      configured_providers: [],
    })
  })
  it('requires current revision, deduplicates update and returns paginated redacted results', async () => {
    expect(
      (
        await call(
          owner,
          'PATCH',
          root + '/' + targetId,
          { name: 'stale' },
          revision(999),
        )
      ).statusCode,
    ).toBe(409)
    const key = randomUUID(),
      headers = { ...revision(targetRevision), 'idempotency-key': key }
    const changed = await call(
      owner,
      'PATCH',
      root + '/' + targetId,
      { name: '更新名称' },
      headers,
    )
    expect(changed.statusCode, changed.body).toBe(200)
    targetRevision = changed.json<{ revision: number }>().revision
    expect(
      (
        await call(
          owner,
          'PATCH',
          root + '/' + targetId,
          { name: '更新名称' },
          headers,
        )
      ).json(),
    ).toEqual(changed.json())
    await call(owner, 'POST', root, { ...body, name: '第二目标' })
    const page = await call(owner, 'GET', root + '?limit=1')
    const first = page.json<{ items: unknown[]; nextCursor: string }>()
    expect(first.items).toHaveLength(1)
    expect(first.nextCursor).toBeTruthy()
    expect(
      (
        await call(
          owner,
          'GET',
          root + '?limit=1&cursor=' + encodeURIComponent(first.nextCursor),
        )
      ).json<{ items: unknown[] }>().items,
    ).toHaveLength(1)
    expect(page.body).not.toContain(secret)
  })
  it('isolates targets and deliveries from a Human in another workspace', async () => {
    const foreignWorkspace = (
      await db.query<{ id: string }>(
        `INSERT INTO workspaces(name,slug) VALUES('Foreign C1',$1) RETURNING id`,
        ['foreign-c1-' + randomUUID()],
      )
    ).rows[0]!.id
    const email = randomUUID() + '@foreign-channel.test'
    await db.query(
      `INSERT INTO actors(workspace_id,kind,email,display_name,password_hash,workspace_role)
      SELECT $2,'human',$3,'Foreign owner',password_hash,'admin' FROM actors WHERE id=$1`,
      [actorId, foreignWorkspace, email],
    )
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'channel-integration-password' },
      headers: { 'idempotency-key': randomUUID() },
    })
    expect(login.statusCode, login.body).toBe(200)
    const foreign = {
      cookie: String(login.headers['set-cookie']).split(';')[0]!,
      csrf: login.json<{ csrfToken: string }>().csrfToken,
    }
    for (const url of [root, deliveryRoot])
      expect(
        (await call(foreign, 'GET', url)).json<{ items: unknown[] }>().items,
      ).toEqual([])
    expect(
      (
        await call(
          foreign,
          'PATCH',
          root + '/' + targetId,
          { enabled: false },
          revision(targetRevision),
        )
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await call(
          foreign,
          'DELETE',
          root + '/' + targetId,
          undefined,
          revision(targetRevision),
        )
      ).statusCode,
    ).toBe(404)
  })
  it('rejects an otherwise valid active Agent bearer on every channel management route', async () => {
    const states = (
      await call(owner, 'GET', `/api/v1/teams/${teamId}/states`)
    ).json<{ items: Array<{ id: string; name: string }> }>().items
    const created = await call(owner, 'POST', '/api/v1/work-items', {
      teamId,
      title: 'C1 credential boundary',
      statusId: states.find((state) => state.name === 'Ready')!.id,
      responsibleHumanActorId: actorId,
    })
    expect(created.statusCode, created.body).toBe(200)
    const work = created.json<{ id: string; revision: number }>(),
      capabilities = ['work:read', 'work:write']
    const registered = await call(owner, 'POST', '/api/v1/agents/register', {
      slug: 'c1-' + randomUUID(),
      name: 'C1 fake agent',
      provider: 'fake',
      version: '1',
      supportedProtocols: ['native_http'],
      requestedCapabilities: capabilities,
      approvedCapabilities: capabilities,
      maxConcurrency: 1,
    })
    expect(registered.statusCode, registered.body).toBe(200)
    const agent = registered.json<{ id: string }>()
    expect(
      (
        await call(
          owner,
          'PUT',
          `/api/v1/agents/${agent.id}/team-access/${teamId}`,
          { approvedCapabilities: capabilities },
        )
      ).statusCode,
    ).toBe(200)
    const started = await call(
      owner,
      'POST',
      `/api/v1/work-items/${work.id}/agent-session`,
      {
        agentId: agent.id,
        principalHumanActorId: actorId,
        role: 'executor',
        requestedCapabilities: capabilities,
        initialPrompt: 'Test Human-only channels',
        budget: {},
      },
      revision(work.revision),
    )
    expect(started.statusCode, started.body).toBe(200)
    const sessionId = started.json<{ session: { id: string } }>().session.id,
      bearer = await seedAgentSessionBearer(db, sessionId, agent.id)
    const agentHeaders = {
      authorization: `Bearer ${bearer}`,
      'idempotency-key': randomUUID(),
    }
    const acknowledged = await app.inject({
      method: 'POST',
      url: `/api/v1/agent-sessions/${sessionId}/ack`,
      payload: { summary: 'Credential boundary ready', externalUrls: [] },
      headers: agentHeaders,
    })
    expect(acknowledged.statusCode, acknowledged.body).toBe(200)
    const endpoints = [
      { method: 'GET' as const, url: root + '/config' },
      { method: 'GET' as const, url: root },
      { method: 'GET' as const, url: deliveryRoot },
      { method: 'POST' as const, url: root, payload: body },
      {
        method: 'PATCH' as const,
        url: root + '/' + targetId,
        payload: { enabled: false },
      },
      { method: 'DELETE' as const, url: root + '/' + targetId },
      {
        method: 'POST' as const,
        url: deliveryRoot + '/' + randomUUID() + '/reconcile',
        payload: { outcome: 'retry' },
      },
    ]
    for (const endpoint of endpoints) {
      const rejected = await app.inject({
        ...endpoint,
        headers: {
          ...agentHeaders,
          ...revision(targetRevision),
          'idempotency-key': randomUUID(),
        },
      })
      expect(rejected.statusCode, rejected.body).toBe(403)
    }
    expect(
      (
        await db.query(
          'SELECT revision FROM notification_channel_targets WHERE id=$1',
          [targetId],
        )
      ).rows[0]!.revision,
    ).toBe(targetRevision)
  })
  it('keeps Attention reads free of intent, delivery and checkpoint writes', async () => {
    const counts = async () =>
      (
        await db.query(
          `SELECT (SELECT count(*) FROM notification_intents) AS intents,(SELECT count(*) FROM notification_deliveries) AS deliveries,(SELECT count(*) FROM notification_source_checkpoints) AS checkpoints`,
        )
      ).rows[0]
    const before = await counts()
    for (let index = 0; index < 3; index++)
      expect(
        (await call(owner, 'GET', '/api/v1/human-attention')).statusCode,
      ).toBe(200)
    expect(await counts()).toEqual(before)
  })
  it('lets only the owner reconcile an uncertain result with revision and idempotency', async () => {
    const item = await withTx(db, async (tx) => {
      const row = (
        await tx.query<{ id: string }>(
          `INSERT INTO inbox_items(workspace_id,recipient_human_actor_id,team_id,kind,source_type,source_id) VALUES($1,$2,$3,'ask','activity',$4) RETURNING id`,
          [workspaceId, actorId, teamId, randomUUID()],
        )
      ).rows[0]!
      const eventId = await appendEvent(tx, {
        workspaceId,
        actorId,
        correlationId: randomUUID(),
        type: 'inbox.item.created',
        aggregateType: 'inbox_item',
        aggregateId: row.id,
        revision: 1,
      })
      return { row, eventId }
    })
    await withTx(db, (tx) => admitChannelEvent(tx, item.eventId))
    const claimed = (
      await withTx(db, (tx) =>
        claimChannelNotifications(tx, 'api-c1', ['wecom'], 25, 60),
      )
    )[0]!
    await withTx(db, (tx) => prepareChannelSend(tx, claimed, 'api-c1'))
    await withTx(db, (tx) =>
      settleChannelSend(tx, claimed, 'api-c1', 'unknown'),
    )
    const listing = await call(owner, 'GET', deliveryRoot)
    expect(listing.statusCode, listing.body).toBe(200)
    const rows = listing.json<{
      items: Array<{ id: string; revision: number; outcome: string }>
    }>().items
    const row = rows.find((candidate) => candidate.id === claimed.id)!
    expect(row.outcome).toBe('uncertain')
    expect(
      (
        await call(
          other,
          'POST',
          deliveryRoot + '/' + row.id + '/reconcile',
          { outcome: 'delivered' },
          revision(row.revision),
        )
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await call(
          owner,
          'POST',
          deliveryRoot + '/' + row.id + '/reconcile',
          { outcome: 'delivered' },
          revision(row.revision + 1),
        )
      ).statusCode,
    ).toBe(409)
    const key = randomUUID(),
      headers = { ...revision(row.revision), 'idempotency-key': key },
      url = deliveryRoot + '/' + row.id + '/reconcile'
    const confirmed = await call(
      owner,
      'POST',
      url,
      { outcome: 'delivered' },
      headers,
    )
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    expect(
      (
        await call(owner, 'POST', url, { outcome: 'delivered' }, headers)
      ).json(),
    ).toEqual(confirmed.json())
    expect(
      (
        await db.query(
          'SELECT status,effect_key FROM notification_deliveries WHERE id=$1',
          [row.id],
        )
      ).rows[0],
    ).toMatchObject({ status: 'delivered', effect_key: claimed.effectKey })
  })
  it('revokes configuration without returning secret material and rejects subsequent mutations', async () => {
    const revoked = await call(
      owner,
      'DELETE',
      root + '/' + targetId,
      undefined,
      revision(targetRevision),
    )
    expect(revoked.statusCode, revoked.body).toBe(200)
    expect(revoked.json()).toMatchObject({
      enabled: false,
      status: 'revoked',
      secret_status: 'missing',
    })
    expect(revoked.body).not.toContain(secret)
    expect(
      (
        await call(
          owner,
          'PATCH',
          root + '/' + targetId,
          { enabled: true },
          revision(targetRevision + 1),
        )
      ).statusCode,
    ).toBeGreaterThanOrEqual(400)
  })

  it('partitions real Room source snapshots by exact Human audience without public payload leakage or duplicate intents', async () => {
    const otherId = (await call(other, 'GET', '/api/v1/auth/me')).json<{
      actor: { id: string }
    }>().actor.id
    expect(
      (await call(other, 'POST', root, { ...body, name: '精确收件人目标' }))
        .statusCode,
    ).toBe(201)
    const states = (
      await call(owner, 'GET', '/api/v1/teams/' + teamId + '/states')
    ).json<{ items: Array<{ id: string; name: string }> }>().items
    const work = await call(owner, 'POST', '/api/v1/work-items', {
      teamId,
      title: '精确 Room 收件人',
      statusId: states.find((state) => state.name === 'Ready')!.id,
      responsibleHumanActorId: actorId,
    })
    expect(work.statusCode, work.body).toBe(200)
    const room = await call(
      owner,
      'GET',
      '/api/v1/rooms?workItemId=' + work.json<{ id: string }>().id,
    )
    expect(room.statusCode, room.body).toBe(200)
    const message = await call(
      owner,
      'POST',
      '/api/v1/rooms/' + room.json<{ id: string }>().id + '/messages',
      {
        intent: 'ask',
        body: 'Private C1 source text',
        recipientActorIds: [actorId, otherId],
        requiresResponse: true,
      },
    )
    expect(message.statusCode, message.body).toBe(200)
    const messageId = message.json<{ id: string }>().id
    const events = (
      await db.query<{
        id: string
        audience_actor_id: string | null
        event_type: string
        payload: unknown
        notification_sources: Array<{ source_type: string; source_id: string }>
      }>(
        'SELECT id,audience_actor_id,event_type,payload,notification_sources FROM domain_events WHERE aggregate_id=$1 ORDER BY cursor',
        [messageId],
      )
    ).rows
    const inboxes = (
      await db.query<{ id: string; recipient_actor_id: string }>(
        'SELECT id,recipient_actor_id FROM inbox_items WHERE source_id=$1',
        [messageId],
      )
    ).rows
    expect(inboxes).toHaveLength(2)
    expect(
      events.filter((event) => event.event_type === 'room.message.posted'),
    ).toHaveLength(2)
    for (const event of events) {
      expect(event.payload).not.toHaveProperty('notificationSources')
      for (const inbox of inboxes)
        expect(JSON.stringify(event.payload)).not.toContain(inbox.id)
      if (event.audience_actor_id) {
        expect(event.notification_sources).toEqual([
          {
            source_type: 'inbox_item',
            source_id: inboxes.find(
              (inbox) => inbox.recipient_actor_id === event.audience_actor_id,
            )!.id,
            source_revision: 1,
          },
        ])
      } else expect(event.notification_sources).toEqual([])
      await withTx(db, (tx) => admitChannelEvent(tx, event.id))
    }
    const intents = (
      await db.query<{ recipient_actor_id: string; count: number }>(
        'SELECT recipient_actor_id,count(*)::int AS count FROM notification_intents WHERE source_event_id=ANY($1::uuid[]) GROUP BY recipient_actor_id',
        [events.map((event) => event.id)],
      )
    ).rows
    expect(
      intents.sort((a, b) =>
        a.recipient_actor_id.localeCompare(b.recipient_actor_id),
      ),
    ).toEqual(
      [actorId, otherId]
        .sort()
        .map((recipient_actor_id) => ({ recipient_actor_id, count: 1 })),
    )
  })
})
