import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { createDb } from '../../../packages/db/src/index'

const api = process.env.C2_E2E_API_URL ?? 'http://127.0.0.1:3101'
const databaseUrl = process.env.DATABASE_URL!
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('C2 E2E requires a dedicated test database')

test('C2 登录 canonical 深链、当前 Human 重鉴权、转发无权及网页故障回退', async ({ page, context }, testInfo) => {
  const db = createDb(databaseUrl)
  const email = `c2-forward-${randomUUID()}@example.test`
  let itemId = ''
  try {
    const loginResponse = await context.request.post(api + '/api/v1/auth/login', { headers: { origin: String(testInfo.project.use.baseURL), 'idempotency-key': `c2-login-${randomUUID()}` }, data: { email: 'alice@example.test', password: 'password-acceptance' } })
    expect(loginResponse.ok()).toBe(true)
    const auth = await (await context.request.get(api + '/api/v1/auth/me')).json() as { actor: { id: string; workspace_id: string } }
    const team = (await db.query<{ id: string }>('SELECT id FROM teams WHERE workspace_id=$1 LIMIT 1', [auth.actor.workspace_id])).rows[0]!
    const bob = (await db.query<{ id: string }>(`INSERT INTO actors(workspace_id,kind,email,display_name,password_hash,workspace_role)
      SELECT workspace_id,'human',$2,'C2 forwarding Human',password_hash,'member' FROM actors WHERE id=$1 RETURNING id`, [auth.actor.id, email])).rows[0]!
    await db.query(`INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'member')`, [auth.actor.workspace_id, team.id, bob.id])
    const item = (await db.query<{ id: string }>(`INSERT INTO inbox_items(workspace_id,recipient_human_actor_id,team_id,kind,source_type,source_id,payload)
      VALUES($1,$2,$3,'ask','activity',$4,'{"summary":"C2 仅授权 Human 可见"}') RETURNING id`, [auth.actor.workspace_id, auth.actor.id, team.id, randomUUID()])).rows[0]!
    itemId = item.id
    const id = `v1:inbox_item:${item.id}`, href = `/?view=inbox&attentionSelected=${encodeURIComponent(id)}`
    const counters = async () => (await db.query(`SELECT (SELECT count(*)::int FROM domain_events WHERE event_type LIKE 'decision.%' OR event_type LIKE 'approval.decision.%') AS events,
      (SELECT count(*)::int FROM outbox_events o JOIN domain_events e ON e.id=o.domain_event_id WHERE e.event_type LIKE 'decision.%' OR e.event_type LIKE 'approval.decision.%') AS outbox`)).rows[0]
    const before = await counters()
    await context.clearCookies()
    await page.goto(href)
    await expect(page).toHaveURL(/\/login\?returnTo=/)
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe(href)
    await page.screenshot({ path: testInfo.outputPath('c2-before-login.png'), fullPage: true, animations: 'disabled' })
    const login = page.getByTestId('login-form')
    await login.locator('[name=email]').fill('alice@example.test')
    await login.locator('[name=password]').fill('password-acceptance')
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(url => url.searchParams.get('attentionSelected') === id)
    const center = page.getByTestId('attention-center')
    const heading = center.locator('.attention-detail-heading h3')
    await expect(heading).toBeVisible()
    await expect(heading).toBeFocused()
    await expect(center).toContainText('C2 仅授权 Human 可见')
    const title = await heading.innerText()
    await page.screenshot({ path: testInfo.outputPath('c2-after-authorized-login.png'), fullPage: true, animations: 'disabled' })
    // 没有启动提供方，渠道故障或关闭不影响普通网页可见。
    await page.reload(); await expect(heading).toBeVisible()
    await center.locator('.attention-detail-heading button').click()
    await expect(center.locator('.attention-select-prompt')).toBeFocused()
    await page.goto(href); await expect(heading).toBeFocused()
    await page.goto('/?view=inbox'); await expect(heading).toHaveCount(0)
    await page.goBack(); await expect(heading).toBeFocused()
    await page.goForward(); await expect(heading).toHaveCount(0)
    await context.clearCookies()
    await page.goto(href); await expect(page).toHaveURL(/\/login\?returnTo=/)
    await login.locator('[name=email]').fill(email)
    await login.locator('[name=password]').fill('password-acceptance')
    const deniedDetail = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/human-attention/${encodeURIComponent(id)}` && response.request().method() === 'GET')
    await page.getByTestId('login-submit').click()
    expect((await deniedDetail).status()).toBe(404)
    await expect(page).toHaveURL(url => url.searchParams.get('attentionSelected') === id)
    await expect(center).toBeVisible()
    await expect(heading).toHaveCount(0)
    await expect(center).not.toContainText('C2 仅授权 Human 可见')
    await expect(center).not.toContainText(title)
    await expect(center.locator('.attention-select-prompt')).toBeFocused()
    const current = await (await context.request.get(api + '/api/v1/auth/me')).json() as { actor: { id: string } }
    expect(current.actor.id).toBe(bob.id)
    await page.screenshot({ path: testInfo.outputPath('c2-forwarded-unauthorized.png'), fullPage: true, animations: 'disabled' })
    await db.query('UPDATE actors SET is_active=false WHERE id=$1', [bob.id])
    await page.reload()
    await expect(page).toHaveURL(/\/login\?returnTo=/)
    await expect(page.getByTestId('login-form')).toBeVisible()
    await expect(page.locator('.attention-detail-heading')).toHaveCount(0)
    expect(await counters()).toEqual(before)
  } finally {
    if (itemId) await db.query('DELETE FROM inbox_items WHERE id=$1', [itemId])
    // 登录审计引用 Human；保留追加事实，专用数据库由本轮容器清理回收。
    await db.query('UPDATE actors SET is_active=false WHERE email=$1', [email])
    await db.end()
  }
})

test('C2 登录返回拒绝外域、协议相对和编码路径，回到首页', async ({ page, context }) => {
  const loginHtml = await (await context.request.get('http://127.0.0.1:3100/login')).text()
  const ssrForm = await page.evaluate(html => {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return { method: doc.querySelector('form')?.getAttribute('method'), disabled: doc.querySelector('[data-testid="login-submit"]')?.hasAttribute('disabled') }
  }, loginHtml)
  expect(ssrForm).toEqual({ method: 'post', disabled: true })
  for (const returnTo of ['https://evil.example/', '//evil.example/', '/%2f%2fevil.example', '/login']) {
    await context.clearCookies()
    await page.goto(`/login?${new URLSearchParams({ returnTo })}`)
    const form = page.getByTestId('login-form')
    await form.locator('[name=email]').fill('alice@example.test')
    await form.locator('[name=password]').fill('password-acceptance')
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(url => url.pathname === '/' && url.search === '')
  }
})
