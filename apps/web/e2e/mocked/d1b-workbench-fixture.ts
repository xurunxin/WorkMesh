// 复用冻结 D0 的只读 seedWorkbench；原件不修改。
import { expect, type BrowserContext } from '@playwright/test'
export const fixedTime = '2026-08-22T09:30:00.000Z'
export async function seedWorkbench(context: BrowserContext): Promise<void> {
  const conversation = {
    id: 'conversation-d0', title: '改动前基线对话', status: 'active', revision: 1,
    team_id: 'team-2', agent_session_id: 'session-1', default_llm_connection_id: 'llm-d0',
    default_llm_model_id: 'model-d0', work_item_id: 'work-101', project_id: 'project-1',
    updated_at: fixedTime, context_pins: [],
  }
  const connection = {
    id: 'llm-d0', name: '基线模型服务', status: 'active', secret_status: 'configured',
    models: [{ id: 'model-d0', display_name: '基线模型', enabled: true }],
  }
  await context.route('**/api/v1/workbench/**', async route => {
    const request = route.request()
    expect(request.method(), '工作台基线只允许读取').toBe('GET')
    const pathname = new URL(request.url()).pathname
    const root = '/api/v1/workbench/conversations'
    let body: unknown
    switch (pathname) {
      case root: body = { items: [conversation], nextCursor: null }; break
      case `${root}/conversation-d0`: body = conversation; break
      case `${root}/conversation-d0/messages`: body = { items: [
        { id: 'message-d0-human', role: 'user', sequence: 1, content_markdown: '请核对工作项的改动前界面，并保留可评审的证据。', created_at: fixedTime },
        { id: 'message-d0-agent', role: 'assistant', sequence: 2, content_markdown: '已记录当前界面。人类负责人保留决策权，后续视觉变化需对照基线评审。', created_at: fixedTime },
      ], nextBefore: null }; break
      case `${root}/conversation-d0/turns`: body = { items: [
        { id: 'turn-d0', status: 'settled', sequence: 1, error_code: null, retry_of_turn_id: null, tool_invocations: [] },
      ], nextBefore: null }; break
      case '/api/v1/workbench/llm-connections': body = { items: [connection], nextCursor: null }; break
      case '/api/v1/workbench/llm-connections/llm-d0': body = connection; break
      default: throw new Error(`未登记的基线工作台请求：${pathname}`)
    }
    await route.fulfill({ status: 200, json: body })
  })
}
