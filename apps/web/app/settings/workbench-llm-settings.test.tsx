// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../lib/i18n'
import { WorkbenchLlmSettings } from './workbench-llm-settings'

const api = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, apiRequest: api.request }
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Agent workbench model service settings', () => {
  it('keeps shared connections read-only for members and never renders the stored credential', async () => {
    const connection = {
      id: 'connection-1', scope: 'team', scope_id: 'team-1', name: 'Shared MiniMax',
      api_type: 'openai-responses', base_url: 'https://api.minimax.cn/v1',
      status: 'active', secret_status: 'configured', can_manage: false, revision: 2,
    }
    api.request.mockImplementation(async (path: string) => {
      if (path === '/api/v1/workbench/llm-connections') return { items: [connection], nextCursor: null }
      if (path === '/api/v1/workbench/llm-connections/connection-1') return {
        ...connection,
        models: [{ id: 'model-1', external_model_id: 'MiniMax-M3', display_name: 'MiniMax M3', enabled: true, revision: 1 }],
      }
      throw new Error(`Unexpected path: ${path}`)
    })
    render(<LocaleProvider><WorkbenchLlmSettings canManageWorkspace={false} teams={[]} /></LocaleProvider>)
    expect(await screen.findByText('MiniMax M3')).toBeTruthy()
    expect(screen.getByText(/此服务由其他管理员维护/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '保存更改' })).toBeNull()
    expect(screen.queryByRole('button', { name: '吊销服务' })).toBeNull()
    expect(screen.queryByText(/sk-[A-Za-z0-9]/)).toBeNull()
  })
})
