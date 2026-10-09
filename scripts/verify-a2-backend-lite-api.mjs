import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

// 真实 Web 私网代理、安装认证和部署 Worker；测试供应商仅提供固定 HTTPS 仓库原件。
const require = createRequire(resolve(import.meta.dirname, '../apps/web/package.json'))
const { chromium, request } = require('@playwright/test')
const origin = process.env.WEB_ORIGIN
const client = await request.newContext({ baseURL: origin })
let browser
let csrf
try {
  const installPage = await client.get('/install')
  assert.equal(installPage.status(), 200)
  assert.match(await installPage.text(), /WorkMesh/)
  const password = `a2-${randomUUID()}`
  const installed = await client.post('/api/v1/auth/install', { headers: { 'Idempotency-Key': randomUUID(), 'X-WorkMesh-Bootstrap-Token': process.env.WORKMESH_BOOTSTRAP_TOKEN },
    data: { name: 'A2 Backend Lite', slug: `a2-${randomUUID().slice(0, 8)}`, adminName: 'A2', email: 'a2@example.test', password } })
  assert.equal(installed.status(), 200, `安装失败：HTTP ${installed.status()}`)
  csrf = (await installed.json()).csrfToken
  assert.equal(typeof csrf, 'string')
  const api = async (path, data, key = randomUUID()) => {
    const response = data === undefined ? await client.get(path) : await client.post(path, { data, headers: { 'X-CSRF-Token': csrf, 'Idempotency-Key': key } })
    assert.equal(response.status(), 200, `${path} HTTP ${response.status()}`)
    return response.json()
  }
  const actor = (await api('/api/v1/auth/me')).actor
  const team = (await api('/api/v1/teams')).items[0]
  assert.ok(actor.id && team.id)
  const project = await api('/api/v1/projects', { teamId: team.id, name: 'A2 Backend Lite Project' })
  const connectionBody = { provider: 'gitea', externalAccountId: 'a2-fixture', displayName: 'A2 HTTPS fixture', baseUrl: process.env.WORKMESH_A2_GITEA_URL,
    accessToken: 'a2-provider-placeholder', webhookSecret: 'a2-webhook-placeholder' }
  const connectionKey = randomUUID()
  const connection = await api('/api/v1/provider-connections', connectionBody, connectionKey)
  assert.equal((await api('/api/v1/provider-connections', connectionBody, connectionKey)).id, connection.id)
  const repository = await api('/api/v1/repositories', { connectionId: connection.id, teamId: team.id, externalId: 'a2/fixture', fullName: 'a2/fixture', defaultBranch: 'main', requiredChecks: [] })
  const repositories = await api(`/api/v1/repositories?teamId=${team.id}&availableOnly=true&limit=1`)
  assert.equal(repositories.items[0].id, repository.id)
  assert.equal(repositories.items[0].can_configure_context, true)
  const body = { projectId: project.id, baseBranch: 'main', baseSha: 'a2-base-sha', branchPattern: 'workmesh/{workItemKey}-{slug}', allowedPaths: ['**'], permissions: ['read'] }
  const key = randomUUID()
  const action = await api(`/api/v1/repositories/${repository.id}/context`, body, key)
  assert.equal(action.kind, 'resolve_repository_context')
  assert.ok(action.id)
  assert.equal((await api(`/api/v1/repositories/${repository.id}/context`, body, key)).id, action.id)
  let context
  for (let attempt = 0; attempt < 45; attempt++) {
    const contexts = await api(`/api/v1/repositories/${repository.id}/context`)
    context = contexts.find(value => value.provider_action_id === action.id)
    if (context) break
    await new Promise(done => setTimeout(done, 2000))
  }
  assert.ok(context, '部署 Worker 未发布精确动作上下文')
  assert.equal(context.repository_id, repository.id)
  assert.equal(context.project_id, project.id)
  assert.equal(context.work_item_id, null)
  assert.equal(context.session_id, null)
  assert.equal(context.base_sha, body.baseSha)
  assert.deepEqual(context.permissions, ['read'])
  assert.equal(context.guidance[0].content, '# 固定测试仓库指导原件\n')
  browser = await chromium.launch()
  const browserContext = await browser.newContext({ storageState: await client.storageState() })
  const page = await browserContext.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/workbench`)
  await page.getByTestId('conversation-workbench').waitFor({ state: 'visible' })
  assert.match(await page.locator('body').innerText(), /WorkMesh/)
  assert.equal(await page.locator('[data-testid="configuration-readiness"]').count(), 0)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ installViaWebProxy: true, authenticatedRead: true, existingMainWeb: true, connectionReplay: true,
    contextAction: action.id, contextId: context.id, exactContextConfirmed: true, providerTls: true, newUiAcceptance: '延期，未验收' }))
} finally {
  if (browser) await browser.close()
  await client.dispose()
}
