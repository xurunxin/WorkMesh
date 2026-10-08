// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import builtin from '../../../api/src/data/model-presets.json'
import { LocaleProvider } from '../lib/i18n'
import { WorkbenchLlmSettings } from './workbench-llm-settings'

const api = vi.hoisted(() => ({ request: vi.fn(), publicRequest: vi.fn() }))
vi.mock('../lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return { ...actual, apiRequest: api.request, publicRequest: api.publicRequest }
})

afterEach(() => { cleanup(); vi.clearAllMocks() })
beforeEach(() => { api.publicRequest.mockResolvedValue(builtin) })

describe('Agent workbench model service settings', () => {
  const empty = () => api.request.mockResolvedValue({ items: [], nextCursor: null })
  const renderSettings = () => render(<LocaleProvider><WorkbenchLlmSettings canManageWorkspace teams={[]} /></LocaleProvider>)
  const field = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
  const mutations = () => api.request.mock.calls.filter(([, options]) => options?.method && options.method !== 'GET')

  it('选择预置只填草稿并显示出处', async () => {
    empty(); renderSettings()
    fireEvent.change(await screen.findByLabelText('模型预置'), { target: { value: 'minimax-cn' } })
    expect(field('baseUrl').value).toBe('https://api.minimax.cn/v1')
    expect(field('presetModelId').value).toBe('MiniMax-M3')
    expect(field('secretMaterial').value).toBe('')
    expect(screen.getByRole('link', { name: '官方出处' }).getAttribute('href')).toBe(builtin.entries[0]!.sourceUrl)
    expect(screen.getByText(/机器确认/)).toBeTruthy()
    expect(screen.getByText(/预置不验证凭据/)).toBeTruthy()
    expect(mutations()).toEqual([])
  })
  it('手工编辑不被刷新覆盖', async () => {
    empty(); renderSettings()
    fireEvent.change(await screen.findByLabelText('模型预置'), { target: { value: 'minimax-cn' } })
    fireEvent.change(field('baseUrl'), { target: { value: 'https://gateway.example/v1' } })
    api.publicRequest.mockResolvedValue({ ...builtin, version: 'refreshed' })
    fireEvent.click(screen.getByRole('button', { name: '刷新目录' }))
    await screen.findByText('目录版本: refreshed')
    expect(field('baseUrl').value).toBe('https://gateway.example/v1')
    expect(mutations()).toEqual([])
  })
  it('模型草稿绑定新连接且显式登记', async () => {
    let created = false, registered = false
    const connection = { id: 'created', name: 'MiniMax', scope: 'personal', scope_id: null,
      api_type: 'openai-completions', base_url: 'https://api.minimax.cn/v1', status: 'active', secret_status: 'configured', revision: 1, can_manage: true }
    api.request.mockImplementation(async (path: string, options?: RequestInit) => {
      if (options?.method === 'POST' && path.endsWith('/models')) { registered = true; return {} }
      if (options?.method === 'POST') { created = true; return connection }
      if (path.endsWith('/created')) return { ...connection, models: [] }
      return { items: created ? [connection] : [], nextCursor: null }
    })
    renderSettings()
    fireEvent.change(await screen.findByLabelText('模型预置'), { target: { value: 'minimax-cn' } })
    fireEvent.change(field('secretMaterial'), { target: { value: 'fixture-secret' } })
    fireEvent.submit(field('baseUrl').closest('form')!)
    await screen.findByRole('button', { name: '登记模型' })
    expect(registered).toBe(false)
    expect(field('modelId').value).toBe('MiniMax-M3')
    expect(field('contextWindowTokens').value).toBe('')
    expect(field('toolCalling').checked).toBe(false)
    fireEvent.change(field('contextWindowTokens'), { target: { value: '10000' } })
    fireEvent.change(field('maxOutputTokens'), { target: { value: '1000' } })
    fireEvent.submit(field('modelId').closest('form')!)
    await waitFor(() => expect(registered).toBe(true))
    expect(mutations().map(([path]) => path)).toEqual(['/api/v1/workbench/llm-connections', '/api/v1/workbench/llm-connections/created/models'])
  })
  it('目录失败仍可手工保存', async () => {
    api.publicRequest.mockRejectedValue(new Error('FEATURE_DISABLED'))
    const connection = { id: 'manual', can_manage: true, status: 'active', models: [] }
    api.request.mockImplementation(async (path: string, options?: RequestInit) => options?.method === 'POST' || path.endsWith('/manual') ? connection : { items: [], nextCursor: null })
    renderSettings()
    await screen.findByText(/预置目录未启用/)
    await screen.findByRole('button', { name: '保存服务' })
    fireEvent.change(field('name'), { target: { value: 'Manual' } })
    fireEvent.change(field('baseUrl'), { target: { value: 'https://gateway.example/v1' } })
    fireEvent.change(field('secretMaterial'), { target: { value: 'fixture-secret' } })
    fireEvent.submit(field('baseUrl').closest('form')!)
    await screen.findByText('连接已保存。请登记可用模型。')
    expect(mutations()).toHaveLength(1)
  })
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
        models: [{ id: 'model-1', external_model_id: 'MiniMax-M3', display_name: 'MiniMax M3', enabled: true, revision: 1,
          capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: false, contextWindowTokens: 204800, maxOutputTokens: 4096 } }],
      }
      throw new Error(`Unexpected path: ${path}`)
    })
    render(<LocaleProvider><WorkbenchLlmSettings canManageWorkspace={false} teams={[]} /></LocaleProvider>)
    expect(await screen.findByText(/MiniMax M3/)).toBeTruthy()
    expect(screen.getByText(/此服务由其他管理员维护/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '保存更改' })).toBeNull()
    expect(screen.queryByRole('button', { name: '吊销服务' })).toBeNull()
    expect(screen.queryByRole('button', { name: '停用模型' })).toBeNull()
    expect(screen.queryByText(/sk-[A-Za-z0-9]/)).toBeNull()
  })

  it('lets a manager disable a model with the current connection revision and preserves its capabilities', async () => {
    const capabilities = { inputModalities: ['text'], toolCalling: true, reasoning: false,
      contextWindowTokens: 204800, maxOutputTokens: 4096 }
    const connection = { id: 'connection-1', scope: 'workspace', scope_id: null, name: 'MiniMax',
      api_type: 'openai-completions', base_url: 'https://api.minimax.cn/v1',
      status: 'active', secret_status: 'configured', can_manage: true, revision: 2 }
    let enabled = true
    api.request.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === '/api/v1/workbench/llm-connections') return { items: [connection], nextCursor: null }
      if (path === '/api/v1/workbench/llm-connections/connection-1/models') {
        expect(options?.headers).toMatchObject({ 'If-Match': '"revision-2"' })
        const body = JSON.parse(String(options?.body))
        expect(body).toMatchObject({ externalModelId: 'MiniMax-M3', enabled: false, capabilities })
        expect(body).not.toHaveProperty('secretMaterial')
        enabled = false
        return {}
      }
      if (path === '/api/v1/workbench/llm-connections/connection-1') return {
        ...connection, revision: enabled ? 2 : 3,
        models: [{ id: 'model-1', external_model_id: 'MiniMax-M3', display_name: 'MiniMax M3',
          enabled, revision: enabled ? 1 : 2, capabilities }],
      }
      throw new Error(`Unexpected path: ${path}`)
    })
    render(<LocaleProvider><WorkbenchLlmSettings canManageWorkspace teams={[]} /></LocaleProvider>)
    fireEvent.click(await screen.findByRole('button', { name: '停用模型' }))
    await waitFor(() => expect(screen.getByText('模型已停用。')).toBeTruthy())
    expect(screen.getByRole('button', { name: '启用模型' })).toBeTruthy()
  })
})
