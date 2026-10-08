import { randomUUID } from 'node:crypto'
import { expect, type Page } from '@playwright/test'
import { createDb } from '../../../../packages/db/src/index.js'
import { resolveReadinessContext } from './configuration-readiness-provider.js'

const apiUrl = process.env.WORKMESH_A2_LITE_URL ?? 'http://127.0.0.1:3101'
const lite = process.env.WORKMESH_A2_LITE === '1'
type RecordBody = Record<string, unknown>
export async function readinessFixture(page: Page) {
  const suffix = randomUUID().slice(0, 8)
  if (lite) {
    await page.goto('/install')
    for (const [name, value] of Object.entries({ bootstrapToken: process.env.WORKMESH_BOOTSTRAP_TOKEN!, workspace: 'A2 Lite', slug: `a2-${suffix}`, name: 'A2 Human', email: `a2-${suffix}@example.test`, password: 'a2-browser-password' })) await page.locator(`input[name="${name}"]`).fill(value)
    await page.getByTestId('install-submit').click()
    await expect(page).not.toHaveURL(/\/install/)
  }
  const meResponse = await page.request.get(`${apiUrl}/api/v1/auth/me`)
  expect(meResponse.ok()).toBe(true)
  let me = await meResponse.json() as { actor: { id: string; workspace_id: string }; csrfToken: string }
  let csrf = me.csrfToken
  const call = async <T>(method: string, path: string, body?: RecordBody, headers: Record<string, string> = {}): Promise<T> => {
    const response = await page.request.fetch(`${apiUrl}${path}`, { method, ...(body ? { data: body } : {}), headers: { 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), ...headers } })
    expect(response.ok(), `${path}: ${response.status()} ${await response.text()}`).toBe(true)
    return await response.json() as T
  }
  const team = await call<{ id: string }>('POST', '/api/v1/teams', { name: `A2 ${suffix}`, key: `A${suffix.replaceAll('-', '').slice(0, 6).toUpperCase()}` })
  if (!lite) {
    // Only Human identity is seeded. Every readiness/configuration fact uses its real command.
    const db = createDb()
    const email = `a2-${suffix}@example.test`
    try {
      const human = (await db.query<{ id: string }>(`INSERT INTO actors(workspace_id,kind,display_name,email,password_hash,workspace_role)
        SELECT workspace_id,'human','A2 Human',$2,password_hash,'admin' FROM actors WHERE id=$1 RETURNING id`, [me.actor.id, email])).rows[0]!
      await db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) SELECT workspace_id,$2,$3,'admin' FROM actors WHERE id=$1", [me.actor.id, team.id, human.id])
    } finally { await db.end() }
    const login = await page.request.post(`${apiUrl}/api/v1/auth/login`, { data: { email, password: 'password-acceptance' }, headers: { 'idempotency-key': randomUUID() } })
    expect(login.ok(), await login.text()).toBe(true)
    csrf = (await login.json() as { csrfToken: string }).csrfToken
    me = await call<typeof me>('GET', '/api/v1/auth/me')
  }
  const project = await call<{ id: string }>('POST', '/api/v1/projects', { teamId: team.id, name: `A2 project ${suffix}` })
  const sessionBaseline = await call<{ items: unknown[] }>('GET', '/api/v1/agent-sessions')
  const href = `/workbench?workKind=repository&teamId=${team.id}&projectId=${project.id}`
  const setModel = async () => {
    const connection = await call<{ id: string; revision: number }>('POST', '/api/v1/workbench/llm-connections', { scope: 'team', teamId: team.id, name: `A2 model ${suffix}`, apiType: 'openai-completions', baseUrl: 'https://models.example.test/v1', secretMaterial: 'a2-model-placeholder' })
    await call('POST', `/api/v1/workbench/llm-connections/${connection.id}/models`, { externalModelId: 'a2-test', displayName: 'A2 test model', enabled: true, capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: false, contextWindowTokens: 10000, maxOutputTokens: 1000 } }, { 'if-match': `"revision-${connection.revision}"` })
    return connection
  }
  const setAgent = async () => {
    const agent = await call<{ id: string }>('POST', '/api/v1/agents/register', { name: `A2 ${suffix}`, slug: `a2-${suffix}`, provider: 'fake', version: '1', supportedProtocols: ['native_http'], requestedCapabilities: ['work:read'], approvedCapabilities: ['work:read'], maxConcurrency: 1 })
    await call('PUT', `/api/v1/agents/${agent.id}/team-access/${team.id}`, { approvedCapabilities: ['work:read'] })
    return agent
  }
  const configureRepository = async (github = false, loseFirstResponse = false, existingConnectionId?: string) => {
    const connection = existingConnectionId ? { id: existingConnectionId } : await call<{ id: string }>('POST', '/api/v1/provider-connections', lite ? {
      provider: 'gitea', externalAccountId: suffix, displayName: 'A2 HTTPS Gitea', webhookSecret: 'a2-webhook-placeholder', baseUrl: process.env.WORKMESH_A2_GITEA_URL!, accessToken: 'a2-provider-placeholder',
    } : { provider: github ? 'github' : 'fake', externalAccountId: suffix, displayName: 'A2 deterministic provider', webhookSecret: 'a2-webhook-placeholder', ...(github ? { installationId: '42', appId: '42', privateKey: 'a2-fixture-key-'.repeat(6) } : {}) })
    const section = page.locator('#project-repository-configuration')
    await expect(section).toBeVisible()
    await section.locator('summary').filter({ hasText: /注册仓库|Register repository/ }).click()
    await section.getByLabel(/已有连接 ID|Existing connection ID/).fill(connection.id)
    await section.getByLabel(/提供商仓库 ID|Provider repository ID/).fill('42')
    await section.getByLabel(/仓库全名|Repository full name/).fill('a2/fixture')
    const registered = page.waitForResponse(response => response.url().endsWith('/api/v1/repositories') && response.request().method() === 'POST')
    await section.getByRole('button', { name: /注册仓库|Register repository/ }).click()
    const registeredResponse = await registered
    expect(registeredResponse.ok()).toBe(true)
    const repository = await registeredResponse.json() as { id: string }
    await expect(section.getByLabel(/仓库$|^Repository$/)).toBeVisible()
    await section.getByLabel(/仓库$|^Repository$/).selectOption(repository.id)
    await expect(section.getByLabel(/基线提交 SHA|Base commit SHA/)).toBeVisible()
    await section.getByLabel(/基线提交 SHA|Base commit SHA/).fill('a2-base-sha')
    let originalKey: string | undefined
    let originalAction: string | undefined
    if (loseFirstResponse) {
      let lost!: () => void
      const lostResponse = new Promise<void>(resolve => { lost = resolve })
      await page.route('**/api/v1/repositories/*/context', async route => {
        if (route.request().method() !== 'POST' || originalKey) { await route.continue(); return }
        originalKey = route.request().headers()['idempotency-key']
        const committed = await route.fetch(); expect(committed.ok()).toBe(true)
        originalAction = (await committed.json() as { id: string }).id
        await route.abort('failed'); lost()
      })
      await section.getByRole('button', { name: /提交上下文配置|Submit context configuration/ }).click()
      await lostResponse; await expect(section.getByRole('alert')).toBeVisible()
      if (!lite) await resolveReadinessContext(originalAction!)
      await expect.poll(async () => (await call<Array<{ provider_action_id: string | null }>>('GET', `/api/v1/repositories/${repository.id}/context`)).some(value => value.provider_action_id === originalAction), { timeout: 60000 }).toBe(true)
      // A real reload destroys component refs but retains apiMutation's session identity.
      await page.reload()
      await expect(section.getByLabel(/仓库$|^Repository$/)).toBeVisible()
      await section.getByLabel(/仓库$|^Repository$/).selectOption(repository.id)
      await expect(section.getByRole('button', { name: /提交上下文配置|Submit context configuration/ })).toBeEnabled()
      await expect(section.getByText('a2-base-sha', { exact: true })).toBeVisible()
      await section.getByLabel(/基线提交 SHA|Base commit SHA/).fill('a2-base-sha')
    }
    const resolution = page.waitForResponse(response => response.url().endsWith('/context') && response.request().method() === 'POST')
    await section.getByRole('button', { name: /提交上下文配置|Submit context configuration/ }).click()
    const response = await resolution; expect(response.ok()).toBe(true)
    const action = await response.json() as { id: string }
    if (loseFirstResponse) {
      expect(response.request().headers()['idempotency-key']).toBe(originalKey)
      expect(action.id).toBe(originalAction)
      await page.unroute('**/api/v1/repositories/*/context')
    }
    if (!loseFirstResponse) await expect(section).toContainText(/已提交，等待解析|Submitted; waiting/)
    if (!lite && !loseFirstResponse) await resolveReadinessContext(action.id)
    await expect(section).toContainText(/上下文已配置|Context configured/, { timeout: 60000 })
  }
  return { call, teamId: team.id, projectId: project.id, actorId: me.actor.id, href, setModel, setAgent, configureRepository, sessionBaseline: sessionBaseline.items }
}
