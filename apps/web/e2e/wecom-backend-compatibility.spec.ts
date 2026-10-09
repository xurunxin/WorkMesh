import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { createDb } from '../../../packages/db/src/index'
import { canonicalObjectHref } from '../app/lib/canonical-route'
import { wecomMarkdown } from '../../worker/src/wecom-notifications'

const api = 'http://127.0.0.1:3101'
const databaseUrl = process.env.DATABASE_URL!
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('C2 requires a dedicated compatibility test database')

test('C2 后端 URL 被 main 消费者识别、当前 Human 重鉴权；登录丢定位记录为延后限制', async ({ page, context, browser }, info) => {
  const db = createDb(databaseUrl), baseURL = String(info.project.use.baseURL)
  const email = `c2-backend-forward-${randomUUID()}@example.test`
  const otherContext = await browser.newContext({ baseURL })
  let itemId = ''
  try {
    const login = await context.request.post(api + '/api/v1/auth/login', {
      headers: { origin: baseURL, 'idempotency-key': randomUUID() },
      data: { email: 'alice@example.test', password: 'password-acceptance' },
    })
    expect(login.ok()).toBe(true)
    const auth = await (await context.request.get(api + '/api/v1/auth/me')).json() as { actor: { id: string; workspace_id: string } }
    const team = (await db.query<{ id: string }>('SELECT id FROM teams WHERE workspace_id=$1 LIMIT 1', [auth.actor.workspace_id])).rows[0]!
    const bob = (await db.query<{ id: string }>(`INSERT INTO actors(workspace_id,kind,email,display_name,password_hash,workspace_role)
      SELECT workspace_id,'human',$2,'C2 backend forwarding Human',password_hash,'member' FROM actors WHERE id=$1 RETURNING id`, [auth.actor.id, email])).rows[0]!
    await db.query(`INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'member')`, [auth.actor.workspace_id, team.id, bob.id])
    itemId = (await db.query<{ id: string }>(`INSERT INTO inbox_items(workspace_id,recipient_human_actor_id,team_id,kind,source_type,source_id,payload)
      VALUES($1,$2,$3,'ask','activity',$4,'{"summary":"C2 后端兼容私有提醒"}') RETURNING id`, [auth.actor.workspace_id, auth.actor.id, team.id, randomUUID()])).rows[0]!.id
    const id = `v1:inbox_item:${itemId}`, canonical = canonicalObjectHref({ kind: 'attention', id })!
    const content = wecomMarkdown(canonical, 'https://workmesh.example.test')
    const link = new URL(content.match(/\[打开 WorkMesh\]\(([^)]+)\)/)![1]!)
    expect(link.origin).toBe('https://workmesh.example.test')
    const href = link.pathname + link.search
    expect(href).toBe(canonical)
    expect(link.searchParams.get('attentionSelected')).toBe(id)
    const counters = async () => (await db.query(`SELECT
      (SELECT count(*)::int FROM domain_events WHERE event_type LIKE 'decision.%' OR event_type LIKE 'approval.decision.%') AS events,
      (SELECT count(*)::int FROM outbox_events o JOIN domain_events e ON e.id=o.domain_event_id WHERE e.event_type LIKE 'decision.%' OR e.event_type LIKE 'approval.decision.%') AS outbox`)).rows[0]
    const before = await counters()
    const detailPath = `/api/v1/human-attention/${encodeURIComponent(id)}`
    // main 优先从已授权列表取详情；只有列表外目标才单独 GET detail。
    const allowed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/human-attention' && response.request().method() === 'GET')
    await page.goto(href)
    expect((await allowed).status()).toBe(200)
    await expect(page.getByTestId('attention-center')).toContainText('C2 后端兼容私有提醒')
    await expect(page.locator('.attention-detail-heading h3')).toBeVisible()
    // 不启动提供方；渠道不可用时 main 的原读取接口/页面依然可见。
    expect((await context.request.get(api + detailPath)).status()).toBe(200)

    expect((await otherContext.request.post(api + '/api/v1/auth/login', {
      headers: { origin: baseURL, 'idempotency-key': randomUUID() },
      data: { email, password: 'password-acceptance' },
    })).ok()).toBe(true)
    const forwarded = await otherContext.newPage()
    const denied = forwarded.waitForResponse(response => new URL(response.url()).pathname === detailPath && response.request().method() === 'GET')
    await forwarded.goto(href)
    expect((await denied).status()).toBe(404)
    await expect(forwarded.getByTestId('attention-center')).toBeVisible()
    await expect(forwarded.locator('.attention-detail-heading h3')).toHaveCount(0)
    await expect(forwarded.getByTestId('attention-center')).not.toContainText('C2 后端兼容私有提醒')
    const current = await (await otherContext.request.get(api + '/api/v1/auth/me')).json() as { actor: { id: string } }
    expect(current.actor.id).toBe(bob.id)
    expect((await otherContext.request.get(api + detailPath)).status()).toBe(404)

    await context.clearCookies()
    await page.goto(href)
    await expect(page).toHaveURL(url => url.pathname === '/login' && url.search === '')
    const form = page.getByTestId('login-form')
    await form.locator('[name=email]').fill('alice@example.test')
    await form.locator('[name=password]').fill('password-acceptance')
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(url => url.pathname === '/' && url.search === '')
    // 当前 main 不保留登录前定位；这是已缩范围的消费者限制，不修新 UI、不冒完整闭环。
    await page.goto(href)
    await expect(page.locator('.attention-detail-heading h3')).toBeVisible()
    await expect(page.getByTestId('attention-center')).toContainText('C2 后端兼容私有提醒')
    expect(await counters()).toEqual(before)
  } finally {
    await otherContext.close().catch(() => undefined)
    if (itemId) await db.query('DELETE FROM inbox_items WHERE id=$1', [itemId])
    await db.query('UPDATE actors SET is_active=false WHERE email=$1', [email])
    await db.end()
  }
})
