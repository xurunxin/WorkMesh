import { expect, type BrowserContext } from '@playwright/test'
import { workItemResponseSchema } from '@workmesh/contracts'

// 冻结 preview 使用 work-101/project-1 等符号ID；其余标量沿用共享传输契约，
// 不声称这些符号ID是生产UUID，也不为测试更改产品校验。
const itemSchema = workItemResponseSchema.pick({
  revision: true, number: true, status_category: true, title: true, priority: true, labels: true,
}).passthrough()

export async function seedBoardDependencies(context: BrowserContext): Promise<void> {
  // 沿用D0已核验的09:30预算投影；final-tour explanation原响应缺此必需数组。
  await context.route('**/api/v1/agent-sessions/session-1/explanation', async route => {
    expect(route.request().method()).toBe('GET')
    const response = await route.fetch()
    const body: unknown = await response.json()
    if (!response.ok() || !body || typeof body !== 'object' || !('session' in body)
      || !body.session || typeof body.session !== 'object') throw new Error('预算只读投影缺失')
    await route.fulfill({ response, json: { ...body, session: { ...body.session,
      startedAt: '2026-08-22T09:00:00.000Z',
      budgetUtilization: [{ limit: 'runtimeSeconds', cap: 3600, used: 1800, ratio: 0.5, measurable: true, warning: false, exhausted: false }],
    } } })
  })
}

// 独立只读夹具；保留 final-tour work-101 和冻结 D0，不将运行中的工作改成 backlog。
export async function seedBoardBacklog(context: BrowserContext): Promise<void> {
  const response = await context.request.get('http://127.0.0.1:3201/api/v1/work-items/work-101')
  expect(response.ok()).toBe(true)
  const base = itemSchema.parse(await response.json())
  const item = itemSchema.parse({ ...base, id: 'work-d1b-backlog', number: 103, title: 'D1b backlog Issue',
    status_id: 'final-state-backlog', status_name: 'Final tour backlog', status_category: 'backlog',
    active_assignment: null, active_executor: null, parent_id: null,
  })
  await context.route('**/api/v1/work-items**', async route => {
    const request = route.request(), url = new URL(request.url())
    expect(request.method(), 'backlog夹具只允许GET').toBe('GET')
    if (url.pathname === '/api/v1/work-items') {
      await route.fulfill({ json: { items: [item], nextCursor: null } })
    } else if (url.pathname === '/api/v1/work-items/work-d1b-backlog') {
      await route.fulfill({ json: item })
    } else if (url.pathname.startsWith('/api/v1/work-items/work-d1b-backlog/')) {
      const response = await context.request.get(request.url().replace('work-d1b-backlog', 'work-101'))
      expect(response.ok()).toBe(true)
      const body: unknown = await response.json()
      // 空的执行事实仍为空；只读依赖中的资源身份必须与详情一致。
      await route.fulfill({ json: JSON.parse(JSON.stringify(body).replaceAll('work-101', 'work-d1b-backlog')) as unknown })
    } else await route.fallback()
  })
}
