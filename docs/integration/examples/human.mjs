import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

// 示例只在内存中保存登录 Cookie；不保存密码或响应原文。
export async function runHuman({ origin, email, password }) {
  const url = new URL(origin)
  assert.ok(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/')
  assert.ok(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  let cookie = '', csrf = ''
  const request = async (method, path, body) => {
    const response = await fetch(new URL(path, url), {
      method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { accept: 'application/json', origin: url.origin,
        ...(cookie ? { cookie } : {}),
        ...(method === 'GET' ? {} : { 'content-type': 'application/json', 'idempotency-key': randomUUID(), 'x-csrf-token': csrf }),
      }, body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`Human request failed: ${method} ${path} HTTP ${response.status}`)
    if (path === '/api/v1/auth/login') {
      const cookies = response.headers.getSetCookie()
      cookie = cookies.map(value => value.split(';')[0]).join('; ')
      assert.ok(cookie)
    }
    return response.status === 204 ? undefined : response.json()
  }
  const login = await request('POST', '/api/v1/auth/login', { email, password })
  csrf = login.csrfToken
  assert.equal(typeof csrf, 'string')
  try {
    const me = await request('GET', '/api/v1/auth/me')
    const teams = await request('GET', '/api/v1/teams')
    assert.equal(typeof me.actor?.id, 'string')
    assert.ok(Array.isArray(teams.items))
    return { actorId: me.actor.id, teamIds: teams.items.map(team => team.id), logout: true }
  } finally {
    await request('POST', '/api/v1/auth/logout', {})
    cookie = ''; csrf = ''
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origin = process.env.WORKMESH_API_URL
  const email = process.env.WORKMESH_HUMAN_EMAIL
  const password = process.env.WORKMESH_HUMAN_PASSWORD
  if (!origin || !email || !password) throw new Error('需要 API 地址与进程注入的 Human 凭据')
  console.log(JSON.stringify(await runHuman({ origin, email, password })))
}
