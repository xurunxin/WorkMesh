// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../../app/lib/i18n'
import { ApiError } from '../../app/lib/api'
import { ProjectRepositoryConfiguration } from './project-repository-configuration'

const mocks = vi.hoisted(() => ({ request: vi.fn(), mutate: vi.fn() }))
vi.mock('../../app/lib/api', async original => ({ ...await original<typeof import('../../app/lib/api')>(), apiRequest: mocks.request, apiMutation: mocks.mutate }))
vi.mock('../../app/lib/realtime', () => ({ useRealtimeSubscription: vi.fn() }))
const id = '11111111-1111-4111-8111-111111111111'
const actionId = '22222222-2222-4222-8222-222222222222'
const actor = { id, workspace_id: id, workspace_role: 'admin' as const, display_name: 'Human' }
let editable = true
let contexts: unknown[] = []
const context = (providerActionId: string) => ({ id: actionId, workspace_id: id, repository_id: id, project_id: id, work_item_id: null, session_id: null,
  base_branch: 'main', base_sha: 'chosen-sha', branch_pattern: 'workmesh/{workItemKey}-{slug}', allowed_paths: ['.'], permissions: ['read'],
  guidance_manifest_hash: 'sha256:test', created_by_actor_id: id, created_at: '2026-01-01T00:00:00Z', provider_action_id: providerActionId, guidance: [] })
beforeEach(() => {
  editable = true; contexts = []; mocks.request.mockReset(); mocks.mutate.mockReset()
  mocks.request.mockImplementation(async (path: string) => {
    if (path === '/api/v1/features') return { features: [] }
    if (path.includes('/context')) return contexts
    if (path.startsWith('/api/v1/repositories?')) return { items: [{ id, workspace_id: id, connection_id: id, team_id: id, external_id: '1', full_name: 'owner/repo', default_branch: 'main', required_checks: [], can_configure_context: editable }], nextCursor: null }
    throw Error(`Unexpected request: ${path}`)
  })
  mocks.mutate.mockResolvedValue({ id: actionId, kind: 'resolve_repository_context', status: 'pending' })
})
afterEach(cleanup)
function mount() { return render(<LocaleProvider><ProjectRepositoryConfiguration actor={actor} teamId={id} projectId={id} onCreateProject={vi.fn()} /></LocaleProvider>) }
describe('项目仓库配置', () => {
  it('只读成员不出现上下文写入口，服务端分页前筛选始终带 Team', async () => {
    editable = false; mount()
    expect(await screen.findByText(/配置上下文需要 Team 管理员或维护者权限/)).toBeVisible()
    expect(screen.queryByRole('button', { name: '提交上下文配置' })).toBeNull()
    expect(mocks.request).toHaveBeenCalledWith(expect.stringContaining(`teamId=${id}&availableOnly=true`), expect.anything())
  })
  it('POST 只进入等待状态，其他动作或旧上下文不能确认本次成功', async () => {
    mount(); const sha = await screen.findByLabelText('基线提交 SHA')
    fireEvent.change(sha, { target: { value: 'chosen-sha' } })
    fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' }))
    expect(await screen.findByText('已提交，等待解析。')).toBeVisible()
    expect(mocks.mutate).toHaveBeenCalledTimes(1)
    contexts = [context(id)]
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(screen.getByText('已提交，等待解析。')).toBeVisible())
    expect(screen.queryByText('上下文已配置。')).toBeNull()
    contexts = [context(actionId)]
    await waitFor(() => expect(screen.getByRole('button', { name: '刷新' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(await screen.findByText('上下文已配置。')).toBeVisible()
    expect(mocks.mutate).toHaveBeenCalledTimes(1)
  })
  it('失权刷新移除旧写入口并清空凭证，非秘密校验输入保留', async () => {
    mount(); await screen.findByLabelText('基线提交 SHA')
    fireEvent.change(screen.getByLabelText('Webhook 秘密'), { target: { value: 'test-secret-in-memory' } })
    fireEvent.change(screen.getByLabelText('基线提交 SHA'), { target: { value: 'keep-sha' } })
    mocks.request.mockRejectedValueOnce(new ApiError(403, 'revoked'))
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(screen.queryByRole('button', { name: '提交上下文配置' })).toBeNull()
    expect(screen.getByLabelText('Webhook 秘密')).toHaveValue('')
  })
  it('提交前发现并发新上下文，保留输入并要求核对后显式重提', async () => {
    mount(); const sha = await screen.findByLabelText('基线提交 SHA')
    fireEvent.change(sha, { target: { value: 'chosen-sha' } })
    contexts = [context(id)]
    fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' }))
    expect(await screen.findByText(/上下文已被更新/)).toBeVisible()
    expect(mocks.mutate).not.toHaveBeenCalled()
    expect(sha).toHaveValue('chosen-sha')
    fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' }))
    expect(await screen.findByText('已提交，等待解析。')).toBeVisible()
    expect(mocks.mutate).toHaveBeenCalledTimes(1)
  })
  it('无目标不会提交配置或伪造 Project，创建需用户显式操作', async () => {
    const create = vi.fn()
    render(<LocaleProvider><ProjectRepositoryConfiguration actor={actor} teamId={id} projectId={null} onCreateProject={create} /></LocaleProvider>)
    await screen.findByText('owner/repo')
    expect(screen.queryByRole('button', { name: '提交上下文配置' })).toBeNull()
    expect(mocks.mutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '新建配置目标项目' })); expect(create).toHaveBeenCalledTimes(1)
  })
})

