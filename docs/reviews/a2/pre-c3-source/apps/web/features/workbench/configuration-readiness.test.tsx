// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConfigurationReadinessResponse } from '@workmesh/contracts'
import { LocaleProvider } from '../../app/lib/i18n'
import { ConfigurationReadiness, unmetReadiness, useConfigurationReadiness } from './configuration-readiness'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../app/lib/api', () => ({ apiRequest: request }))
vi.mock('../../app/lib/realtime', () => ({ useRealtimeSubscription: vi.fn() }))
const teamId = '11111111-1111-4111-8111-111111111111'
const actor = { id: teamId, workspace_id: teamId, workspace_role: 'admin' as const, display_name: 'Human' }
const context = { teamId, workKind: 'repository' as const }
const blocked = { applicability: 'applicable' as const, state: 'blocked' as const, reasonCode: 'unmet' as const }
const ready = { applicability: 'applicable' as const, state: 'ready' as const, reasonCode: 'configured' as const }
const unknown = { applicability: 'applicable' as const, state: 'unknown' as const, reasonCode: 'not_observable' as const }
const value: ConfigurationReadinessResponse = { checks: { repository: blocked, model: blocked, agent: blocked, runner: unknown } }
function Surface({ team = teamId }: { team?: string }) {
  const query = { ...context, teamId: team }
  const state = useConfigurationReadiness(actor, query)
  return <ConfigurationReadiness context={query} conversationId={null} state={state} />
}
afterEach(() => { cleanup(); request.mockReset(); window.history.replaceState({}, '') })
describe('配置投影', () => {
  it('列表按依赖深度排列，unknown 与 not_applicable 不成为缺口', () => {
    expect(unmetReadiness(value)).toEqual(['repository', 'model', 'agent'])
    expect(unmetReadiness({ checks: { repository: { applicability: 'not_applicable', state: null, reasonCode: 'non_repository_work' }, model: ready, agent: unknown, runner: unknown } })).toEqual([])
  })
  it('刷新期间清除旧动作，失败不冒称未配置', async () => {
    request.mockResolvedValueOnce(value).mockRejectedValueOnce(new Error('unavailable'))
    render(<LocaleProvider><Surface /></LocaleProvider>)
    expect(await screen.findByTestId('readiness-banner')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(screen.queryByTestId('readiness-banner')).toBeNull()
    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取')
  })
  it('换 Team 后丢弃乱序旧响应，全部满足移除横幅', async () => {
    let finish!: (value: unknown) => void
    request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValueOnce({ checks: { repository: ready, model: ready, agent: ready, runner: unknown } })
    const view = render(<LocaleProvider><Surface /></LocaleProvider>)
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    view.rerender(<LocaleProvider><Surface team="22222222-2222-4222-8222-222222222222" /></LocaleProvider>)
    expect(await screen.findByText('平台无法确认 Runner 是否在线。')).toBeVisible()
    await act(async () => finish(value))
    expect(screen.queryByTestId('readiness-banner')).toBeNull()
  })
})
