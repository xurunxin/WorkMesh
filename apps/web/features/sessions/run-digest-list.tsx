'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ControlCenterDigest } from '@workmesh/contracts'
import {
  ControlCenterSection,
  RunDigestRow,
  WorkSurfacePagination,
  type RunDigestRowCopy,
  type RunHealth,
} from '@workmesh/ui'
import { AgentControlDialog, type AgentControlAction } from '../../app/agent-control-dialog'
import { apiRequest } from '../../app/lib/api'

/**
 * The Session rows. The composed landing screen shows four of these as a
 * summary; the Session destination pages through all of them.
 *
 * Rows carry governed controls, so acting on one opens the same
 * preview-then-commit dialog the session detail uses. A row that merely looked
 * actionable would be worse than one that was read-only.
 */

const RUN_STATE_TONE: Record<string, 'info' | 'warning' | 'violet' | 'danger' | 'neutral'> = {
  executing: 'info',
  awaiting_input: 'warning',
  awaiting_approval: 'warning',
  awaiting_review: 'violet',
  planning: 'info',
  blocked: 'warning',
  paused: 'neutral',
  stale: 'danger',
  failed: 'danger',
}

const RUN_HEALTH: Record<string, RunHealth> = {
  healthy: 'healthy',
  degraded: 'degraded',
  stale: 'stalled',
}

export type RunCopy = RunDigestRowCopy & {
  empty: string
  noStep: string
  pause: string
  stop: string
  intervene: string
}

export function runCopy(locale: 'en' | 'zh-CN'): RunCopy {
  return locale === 'zh-CN'
    ? {
        budget: '预算',
        budgetLabel: (limit, used, cap) => `运行预算 ${limit}：${used ?? '未知'} / ${cap}`,
        budgetPercent: ratio => `${Math.round(ratio * 100)}%`,
        budgetUnknown: (limit, cap) => `${limit} 未知 / ${cap}`,
        empty: '当前没有运行中的智能体。',
        heartbeat: '心跳',
        intervene: '介入',
        noStep: '尚未开始步骤',
        pause: '暂停',
        stop: '停止',
      }
    : {
        budget: 'Budget',
        budgetLabel: (limit, used, cap) => `Run budget ${limit}: ${used ?? 'unknown'} of ${cap}`,
        budgetPercent: ratio => `${Math.round(ratio * 100)}%`,
        budgetUnknown: (limit, cap) => `${limit} unknown of ${cap}`,
        empty: 'No agent is running.',
        heartbeat: 'Heartbeat',
        intervene: 'Intervene',
        noStep: 'No step started',
        pause: 'Pause',
        stop: 'Stop',
      }
}

export function RunDigestList({ copy, limit, onCount }: Readonly<{
  copy: RunCopy
  /** Cap the rows to a summary. Omit to page through everything. */
  limit?: number
  onCount?: (count: number) => void
}>) {
  const [rows, setRows] = useState<ControlCenterDigest[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [control, setControl] = useState<{ action: AgentControlAction; sessionId: string } | null>(null)

  const load = useCallback(async (cursor?: string | null) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ collection: 'running', limit: '20' })
      if (cursor) params.set('cursor', cursor)
      const response = await apiRequest<{
        collections: { running: { items: ControlCenterDigest[]; nextCursor: string | null } }
      }>(`/api/v1/control-center?${params.toString()}`)
      setRows(current => cursor ? [...(current ?? []), ...response.collections.running.items] : response.collections.running.items)
      setNextCursor(response.collections.running.nextCursor)
      // The count is whatever the projection returned. It is never invented, and
      // a screen that has not loaded yet shows no pill rather than a zero.
      onCount?.(response.collections.running.items.length)
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : 'Unavailable')
    } finally {
      setLoading(false)
    }
  }, [onCount])

  useEffect(() => { void load() }, [load])

  const visible = limit === undefined ? rows ?? [] : (rows ?? []).slice(0, limit)

  return <div>
    {error
      ? <p className="wm-landing-note" role="alert">{error}</p>
      : visible.length === 0
        ? <p className="wm-landing-note">{loading ? '' : copy.empty}</p>
        : <div className="wm-run-list">
            {visible.map(({ sessionId, ...run }) => <RunDigestRow
              agentName={run.activeAgent?.displayName ?? run.title}
              budget={run.budgetUtilization}
              copy={copy}
              heartbeat={RUN_HEALTH[run.health?.heartbeat ?? ''] ?? 'unknown'}
              key={run.id}
              onIntervene={sessionId ? () => setControl({ action: 'steer', sessionId }) : undefined}
              onPause={sessionId ? () => setControl({ action: 'pause', sessionId }) : undefined}
              onStop={sessionId ? () => setControl({ action: 'stop', sessionId }) : undefined}
              sessionRef={run.id}
              stateLabel={run.state}
              stateTone={RUN_STATE_TONE[run.state] ?? 'neutral'}
              stepTitle={run.currentStep?.title}
              workItemRef={run.workItem?.id}
            />)}
          </div>}
    {limit === undefined && <WorkSurfacePagination loading={loading} nextCursor={nextCursor} onLoadMore={() => void load(nextCursor)} />}
    {control && <AgentControlDialog
      action={control.action}
      onClose={() => setControl(null)}
      onCommitted={() => { setControl(null); void load() }}
      open
      sessionId={control.sessionId}
    />}
  </div>
}

/** A titled running section whose count comes from the rows it actually loaded. */
export function RunSection({ locale, title }: Readonly<{ locale: 'en' | 'zh-CN'; title: string }>) {
  const copy = useMemo(() => runCopy(locale), [locale])
  const [count, setCount] = useState<number | null>(null)
  return <ControlCenterSection count={count ?? 0} title={title} tone="running">
    <RunDigestList copy={copy} onCount={setCount} />
  </ControlCenterSection>
}

/** The landing screen's bounded summary of the same rows. */
export function RunDigestSummary({ locale, onCount }: Readonly<{ locale: 'en' | 'zh-CN'; onCount?: (count: number) => void }>) {
  const copy = useMemo(() => runCopy(locale), [locale])
  return <RunDigestList copy={copy} limit={4} onCount={onCount} />
}
