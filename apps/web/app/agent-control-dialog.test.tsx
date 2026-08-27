// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionPreview } from '@workmesh/contracts'
import { AgentControlDialog } from './agent-control-dialog'
import { LocaleProvider } from './lib/i18n'
import { ApiError } from './lib/api'

const mocks = vi.hoisted(() => ({ apiMutation: vi.fn(), apiRequest: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }))
vi.mock('./lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('./lib/api')>()
  return { ...actual, apiMutation: mocks.apiMutation, apiRequest: mocks.apiRequest }
})

const id = '00000000-0000-4000-8000-000000000001'
const preview = (revision = 7, stopMode: 'graceful' | 'immediate' = 'graceful'): ActionPreview => ({
  projectionVersion: 1, action: 'stop', allowed: true, reasonCode: 'control.allowed', sourceRevision: revision,
  currentState: 'executing', targetState: 'stopping', affectedResources: [{ type: 'agent_session', id, revision }],
  consequences: [{ code: 'session.transition.stopping', summary: 'Fence ordinary writes.' }], reversible: false,
  releaseLease: true, preserveArtifacts: true, preserveUncommittedWork: 'runtime_dependent', nextWorkItemState: null,
  invalidatedApprovals: [], requiredReason: true, requiredApproval: { required: false, approvalType: null },
  stopMode, supportedStopModes: [{ mode: 'graceful', available: true, summary: 'Safe boundary.' }, { mode: 'immediate', available: true, summary: 'Fence now.' }],
  steeringScope: null, supportedSteeringScopes: [], currentPlan: { id, revision: 2 }, currentStep: { id, title: 'Implement' },
  lastHeartbeatAt: '2026-08-27T00:00:00.000Z', leaseBehavior: 'release_now', recoveryPath: 'Retry creates a distinct Session.', resultResource: 'same_session',
  warnings: ['Final command revalidates state.'], expiresAt: '2026-08-27T00:00:30.000Z', freshness: { state: 'current', observedAt: '2026-08-27T00:00:00.000Z', sourceUpdatedAt: '2026-08-27T00:00:00.000Z', invalidAfter: '2026-08-27T00:00:30.000Z' }, advisory: true,
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AgentControlDialog', () => {
  it('binds the Human reason and selected stop mode to the preview revision', async () => {
    mocks.apiRequest.mockImplementation(async (_path: string, init: RequestInit) => preview(7, JSON.parse(String(init.body)).stopMode ?? 'graceful'))
    mocks.apiMutation.mockResolvedValue({ id, revision: 8 })
    render(<LocaleProvider><AgentControlDialog action="stop" onClose={vi.fn()} open sessionId={id} /></LocaleProvider>)
    await screen.findByText('session.transition.stopping')
    fireEvent.click(screen.getByRole('radio', { name: /立即|Immediate/ }))
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ body: JSON.stringify({ action: 'stop', stopMode: 'immediate' }) })))
    fireEvent.change(screen.getByRole('textbox', { name: '原因' }), { target: { value: 'Deployment must stop before the maintenance window.' } })
    fireEvent.click(screen.getByRole('button', { name: '确认并执行' }))
    await waitFor(() => expect(mocks.apiMutation).toHaveBeenCalledWith(
      `governed-control:${id}:stop`,
      `/api/v1/agent-sessions/${id}/signals`,
      expect.objectContaining({ headers: expect.objectContaining({ 'If-Match': '"revision-7"' }), body: JSON.stringify({ signal: 'stop', reason: 'Deployment must stop before the maintenance window.', stopMode: 'immediate' }) }),
    ))
  })

  it('preserves the draft and reloads consequences after a stale revision', async () => {
    mocks.apiRequest.mockResolvedValueOnce(preview(7)).mockResolvedValue(preview(8))
    mocks.apiMutation.mockRejectedValueOnce(new ApiError(409, 'Revision changed', 'STALE_REVISION'))
    render(<LocaleProvider><AgentControlDialog action="stop" onClose={vi.fn()} open sessionId={id} /></LocaleProvider>)
    await screen.findByText('session.transition.stopping')
    const reason = screen.getByRole('textbox', { name: '原因' })
    fireEvent.change(reason, { target: { value: 'Keep this exact Human draft.' } })
    fireEvent.click(screen.getByRole('button', { name: '确认并执行' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('草稿已保留')
    expect(reason).toHaveValue('Keep this exact Human draft.')
    expect(await screen.findByText(/revision 8/)).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: '确认并执行' })
    expect(submit).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '按最新状态重新预览' }))
    await waitFor(() => expect(submit).toBeEnabled())
    expect(reason).toHaveValue('Keep this exact Human draft.')
    fireEvent.click(submit)
    await waitFor(() => expect(mocks.apiMutation).toHaveBeenCalledTimes(2))
    expect(mocks.apiMutation).toHaveBeenLastCalledWith(
      `governed-control:${id}:stop`,
      `/api/v1/agent-sessions/${id}/signals`,
      expect.objectContaining({ headers: expect.objectContaining({ 'If-Match': '"revision-8"' }) }),
    )
  })
})
