// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../../app/lib/i18n'
import { ApiError, saveCsrfToken } from '../../app/lib/api'
import { ProjectRepositoryConfiguration } from './project-repository-configuration'

const mocks = vi.hoisted(() => ({ read: vi.fn(), realtime: vi.fn() }))
// Keep apiMutation and its lexical apiRequest real; only GET reads are controlled.
vi.mock('../../app/lib/api', async original => ({ ...await original<typeof import('../../app/lib/api')>(), apiRequest: mocks.read }))
vi.mock('../../app/lib/realtime', () => ({ useRealtimeSubscription: mocks.realtime }))
const id = '11111111-1111-4111-8111-111111111111'
const actions = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
const actor = { id, workspace_id: id, workspace_role: 'admin' as const, display_name: 'Human' }
const context = (action: string, sha: string) => ({ id: action, workspace_id: id, repository_id: id, project_id: id,
  work_item_id: null, session_id: null, base_branch: 'main', base_sha: sha, branch_pattern: 'workmesh/{workItemKey}-{slug}',
  allowed_paths: ['.'], permissions: ['read'], guidance_manifest_hash: 'sha256:test', created_by_actor_id: id,
  created_at: '2026-01-01T00:00:00Z', provider_action_id: action, guidance: [] })
beforeEach(() => { mocks.read.mockReset(); mocks.realtime.mockReset(); sessionStorage.clear(); saveCsrfToken('test-only-csrf') })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); sessionStorage.clear() })

describe('上下文读取代际隔离', () => {
  for (const source of ['焦点', '实时', '手动'] as const) {
    for (const outcome of ['成功', '失败'] as const) {
      it(`${source}旧读取迟到${outcome}不覆盖修改正文后的新动作，继续自动确认`, async () => {
        let values: unknown[] = []
        let blockNext = false
        let resolveOld!: (value: unknown[]) => void
        let rejectOld!: (reason: unknown) => void
        let oldSignal: AbortSignal | undefined
        const posts: Array<{ key: string | null; body: { baseSha: string } }> = []
        mocks.read.mockImplementation(async (path: string, init: RequestInit = {}) => {
          if (path === '/api/v1/features') return { features: [] }
          if (path.includes('/context')) {
            if (blockNext) {
              blockNext = false; oldSignal = init.signal ?? undefined
              // Deliberately ignore cancellation to test the late callback guard too.
              return new Promise<unknown[]>((resolve, reject) => { resolveOld = resolve; rejectOld = reject })
            }
            return values
          }
          return { items: [{ id, workspace_id: id, connection_id: id, team_id: id, external_id: '1',
            full_name: 'owner/repo', default_branch: 'main', required_checks: [], can_configure_context: true }], nextCursor: null }
        })
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
          expect(init.method).toBe('POST')
          expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('test-only-csrf')
          posts.push({ key: new Headers(init.headers).get('Idempotency-Key'), body: JSON.parse(String(init.body)) })
          return new Response(JSON.stringify({ id: actions[posts.length - 1], kind: 'resolve_repository_context', status: 'pending' }), { status: 202 })
        }))
        render(<LocaleProvider><ProjectRepositoryConfiguration actor={actor} teamId={id} projectId={id} onCreateProject={vi.fn()} /></LocaleProvider>)
        await screen.findByLabelText('基线提交 SHA')
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
        fireEvent.change(screen.getByLabelText('基线提交 SHA'), { target: { value: 'old-sha' } })
        fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' }))
        await screen.findByText('已提交，等待解析。')
        blockNext = true
        act(() => {
          if (source === '焦点') window.dispatchEvent(new Event('focus'))
          else if (source === '实时') mocks.realtime.mock.calls.at(-1)?.[1]()
          else fireEvent.click(screen.getByRole('button', { name: '刷新' }))
        })
        await waitFor(() => expect(resolveOld).toBeTypeOf('function'))
        await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
        await waitFor(() => expect(screen.getByLabelText('基线提交 SHA')).toBeEnabled())
        fireEvent.click(screen.getByRole('button', { name: '修改配置' }))
        fireEvent.change(screen.getByLabelText('基线提交 SHA'), { target: { value: 'new-sha' } })
        fireEvent.click(screen.getByRole('button', { name: '提交上下文配置' }))
        await screen.findByText('已提交，等待解析。')
        expect(posts).toHaveLength(2)
        expect(posts[0]?.key).toBeTruthy()
        expect(posts[1]?.key).not.toBe(posts[0]?.key)
        expect(posts.map(post => post.body.baseSha)).toEqual(['old-sha', 'new-sha'])
        await act(async () => {
          if (outcome === '失败') rejectOld(new ApiError(500, 'late read failure'))
          else resolveOld([context(actions[0]!, 'old-sha')])
        })
        expect(oldSignal?.aborted).toBe(true)
        expect(screen.queryByRole('alert')).toBeNull()
        expect(screen.getByLabelText('基线提交 SHA')).toBeDisabled()
        expect(screen.queryByText('old-sha', { selector: 'code' })).toBeNull()
        values = [context(actions[1]!, 'new-sha')]
        await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
        expect(await screen.findByText('上下文已配置。')).toBeVisible()
        expect(screen.getByLabelText('基线提交 SHA')).toBeEnabled()
        expect(posts).toHaveLength(2)
      })
    }
  }
})
