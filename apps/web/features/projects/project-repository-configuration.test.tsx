// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../../app/lib/i18n'
import { ApiError } from '../../app/lib/api'
import { ProjectRepositoryConfiguration } from './project-repository-configuration'

const mocks = vi.hoisted(() => ({ request: vi.fn(), mutate: vi.fn(), realtime: vi.fn() }))
vi.mock('../../app/lib/api', async original => ({ ...await original<typeof import('../../app/lib/api')>(), apiRequest: mocks.request, apiMutation: mocks.mutate }))
vi.mock('../../app/lib/realtime', () => ({ useRealtimeSubscription: mocks.realtime }))
const id = '11111111-1111-4111-8111-111111111111'
const actionId = '22222222-2222-4222-8222-222222222222'
const actor = { id, workspace_id: id, workspace_role: 'admin' as const, display_name: 'Human' }
let editable = true
let contexts: unknown[] = []
const context = (providerActionId: string) => ({ id: actionId, workspace_id: id, repository_id: id, project_id: id, work_item_id: null, session_id: null,
  base_branch: 'main', base_sha: 'chosen-sha', branch_pattern: 'workmesh/{workItemKey}-{slug}', allowed_paths: ['.'], permissions: ['read'],
  guidance_manifest_hash: 'sha256:test', created_by_actor_id: id, created_at: '2026-01-01T00:00:00Z', provider_action_id: providerActionId, guidance: [] })
beforeEach(() => {
  editable = true; contexts = []; mocks.request.mockReset(); mocks.mutate.mockReset(); mocks.realtime.mockReset()
  mocks.request.mockImplementation(async (path: string) => {
    if (path === '/api/v1/features') return { features: [] }
    if (path.includes('/context')) return contexts
    if (path.startsWith('/api/v1/repositories?')) return { items: [{ id, workspace_id: id, connection_id: id, team_id: id, external_id: '1', full_name: 'owner/repo', default_branch: 'main', required_checks: [], can_configure_context: editable }], nextCursor: null }
    throw Error(`Unexpected request: ${path}`)
  })
  mocks.mutate.mockResolvedValue({ id: actionId, kind: 'resolve_repository_context', status: 'pending' })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
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
  it('丢响应动作已落地时，同文重试仍关联原动作并确认精确结果', async () => {
    mount(); const sha = await screen.findByLabelText('基线提交 SHA')
    fireEvent.change(sha, { target: { value: 'chosen-sha' } })
    mocks.mutate.mockRejectedValueOnce(new Error('response lost'))
    fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' }))
    await screen.findByRole('alert')
    contexts = [context(actionId)]
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    const retry = await screen.findByRole('button', { name: '提交上下文配置' })
    fireEvent.click(retry)
    expect(await screen.findByText('上下文已配置。')).toBeVisible()
    expect(mocks.mutate).toHaveBeenCalledTimes(2)
    expect(mocks.mutate.mock.calls[1]?.[0]).toBe(mocks.mutate.mock.calls[0]?.[0])
  })
  it('无目标不会提交配置或伪造 Project，创建需用户显式操作', async () => {
    const create = vi.fn()
    render(<LocaleProvider><ProjectRepositoryConfiguration actor={actor} teamId={id} projectId={null} onCreateProject={create} /></LocaleProvider>)
    await screen.findByText('owner/repo')
    expect(screen.queryByRole('button', { name: '提交上下文配置' })).toBeNull()
    expect(mocks.mutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '新建配置目标项目' })); expect(create).toHaveBeenCalledTimes(1)
  })
  it('重新挂载同文重放确认已存在结果，只接受精确动作、仓库、目标及正文', async () => {
    mount(); fireEvent.change(await screen.findByLabelText('基线提交 SHA'), { target: { value: 'chosen-sha' } })
    mocks.mutate.mockRejectedValueOnce(new Error('response lost'))
    fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' })); await screen.findByRole('alert')
    cleanup(); contexts = [context(actionId)]
    mount(); await screen.findByText('chosen-sha')
    fireEvent.change(await screen.findByLabelText('基线提交 SHA'), { target: { value: 'chosen-sha' } })
    fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' }))
    expect(await screen.findByText('上下文已配置。')).toBeVisible()
    expect(mocks.mutate).toHaveBeenCalledTimes(2)
    expect(mocks.mutate.mock.calls[1]?.[0]).toBe(mocks.mutate.mock.calls[0]?.[0])
  })
  it.each([
    { repository_id: actionId }, { project_id: actionId }, { work_item_id: actionId },
    { session_id: actionId }, { base_sha: 'other-sha' }, { base_branch: 'other-branch' },
    { branch_pattern: 'other/{slug}' }, { allowed_paths: ['other'] }, { permissions: ['ci'] },
  ])('同动作 ID 但结果字段不匹配不能确认成功：%j', async mismatch => {
    mount(); fireEvent.change(await screen.findByLabelText('基线提交 SHA'), { target: { value: 'chosen-sha' } })
    fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' })); await screen.findByText('已提交，等待解析。')
    contexts = [{ ...context(actionId), ...mismatch }]
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '刷新' })).toBeEnabled())
    expect(screen.queryByText('上下文已配置。')).toBeNull()
    expect(screen.getByLabelText('基线提交 SHA')).toBeDisabled()
  })
  it.each(['focus', 'realtime'])('非首屏第23个仓库在%s刷新和解析完成后保留选择与待确认动作', async source => {
    const repos = Array.from({ length: 23 }, (_, index) => ({ id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`, workspace_id: id, connection_id: id, team_id: id, external_id: String(index), full_name: `owner/repo-${index + 1}`, default_branch: 'main', required_checks: [], can_configure_context: true }))
    mocks.request.mockImplementation(async (path: string) => {
      if (path === '/api/v1/features') return { features: [] }
      if (path.includes('/context')) return contexts
      const next = new URL(path, 'http://test').searchParams.has('cursor')
      return { items: next ? repos.slice(20) : repos.slice(0, 20), nextCursor: next ? null : 'page-2' }
    })
    mount(); await screen.findByLabelText('基线提交 SHA')
    fireEvent.click(screen.getByRole('button', { name: '加载更多仓库' }))
    await screen.findByText('owner/repo-23')
    fireEvent.change(screen.getByLabelText('仓库'), { target: { value: repos[22]!.id } })
    fireEvent.change(await screen.findByLabelText('基线提交 SHA'), { target: { value: 'chosen-sha' } })
    fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' })); await screen.findByText('已提交，等待解析。')
    const refresh = () => { if (source === 'focus') fireEvent(window, new Event('focus')); else act(() => mocks.realtime.mock.calls.at(-1)![1]()) }
    refresh()
    await waitFor(() => expect(screen.getByLabelText('仓库')).toHaveValue(repos[22]!.id))
    expect(screen.getByLabelText('基线提交 SHA')).toBeDisabled()
    contexts = [{ ...context(actionId), repository_id: repos[22]!.id }]
    refresh(); expect(await screen.findByText('上下文已配置。')).toBeVisible()
    await waitFor(() => expect(screen.getByLabelText('仓库')).toHaveValue(repos[22]!.id))
    expect(mocks.mutate).toHaveBeenCalledTimes(1)
    expect(mocks.mutate.mock.calls[0]![1]).toBe(`/api/v1/repositories/${repos[22]!.id}/context`)
  })
  it('等待超时可重试原动作确认且不会追加命令，迟到结果可确认', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    mount(); fireEvent.change(await screen.findByLabelText('基线提交 SHA'), { target: { value: 'chosen-sha' } })
    fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' })); await screen.findByText('已提交，等待解析。')
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(screen.getByLabelText('基线提交 SHA')).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '重试确认' }))
    await screen.findByText('已提交，等待解析。')
    expect(mocks.mutate).toHaveBeenCalledTimes(1)
    contexts = [context(actionId)]
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(await screen.findByText('上下文已配置。')).toBeVisible()
  })
  it('读取一直挂起仍按期限释放表单，重试原动作确认并取消旧读取', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    mount(); fireEvent.change(await screen.findByLabelText('基线提交 SHA'), { target: { value: 'chosen-sha' } })
    fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' })); await screen.findByText('已提交，等待解析。')
    const observed: AbortSignal[] = []
    mocks.request.mockImplementationOnce((_path: string, options: { signal: AbortSignal }) => {
      observed.push(options.signal)
      return new Promise(() => {})
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(observed).toHaveLength(1)
    expect(observed[0]!.aborted).toBe(true)
    expect(screen.getByLabelText('基线提交 SHA')).toBeEnabled()
    contexts = [context(actionId)]
    fireEvent.click(screen.getByRole('button', { name: '重试确认' }))
    expect(await screen.findByText('上下文已配置。')).toBeVisible()
    expect(mocks.mutate).toHaveBeenCalledTimes(1)
  })
  it('等待超时后可修改错误 SHA 并显式提交新正文，未确认记录不锁死表单', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    mount(); fireEvent.change(await screen.findByLabelText('基线提交 SHA'), { target: { value: 'chosen-sha' } })
    fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' })); await screen.findByText('已提交，等待解析。')
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    fireEvent.click(screen.getByRole('button', { name: '修改配置' }))
    fireEvent.change(screen.getByLabelText('基线提交 SHA'), { target: { value: 'fixed-sha' } })
    fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2))
    expect(JSON.parse(mocks.mutate.mock.calls[1]![2].body).baseSha).toBe('fixed-sha')
  })
  it('暂时读取失败后可显式修改 SHA，迟到原结果不冒称当前草稿已提交', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    mount(); fireEvent.change(await screen.findByLabelText('基线提交 SHA'), { target: { value: 'chosen-sha' } })
    fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' })); await screen.findByText('已提交，等待解析。')
    mocks.request.mockRejectedValueOnce(new Error('temporary read failure'))
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    await screen.findByRole('alert'); expect(screen.getByRole('button', { name: '重试确认' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '修改配置' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '修改配置' }))
    expect(screen.getByLabelText('基线提交 SHA')).toHaveFocus()
    fireEvent.change(screen.getByLabelText('基线提交 SHA'), { target: { value: 'fixed-sha' } })
    contexts = [context(actionId)]
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(await screen.findByText('上次提交的上下文已配置；当前修改尚未提交。')).toBeVisible()
    expect(screen.getByLabelText('基线提交 SHA')).toHaveValue('fixed-sha')
    fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2))
    expect(JSON.parse(mocks.mutate.mock.calls[1]![2].body).baseSha).toBe('fixed-sha')
  })
})
