'use client'

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ActionPreview } from '@workmesh/contracts'
import { AffectedResourceList, Button, Dialog } from '@workmesh/ui'
import { ApiError, apiMutation, apiRequest, json } from './lib/api'
import { useLocale } from './lib/i18n'
import type { AgentSession } from './lib/agents'

export type AgentControlAction = ActionPreview['action']
type SteeringScope = NonNullable<ActionPreview['steeringScope']>
type StopMode = NonNullable<ActionPreview['stopMode']>
export type AgentControlResult = { href: string; label: string; session?: AgentSession } | null

const actionLabels: Record<'en' | 'zh-CN', Record<AgentControlAction, string>> = {
  'zh-CN': { pause: '暂停', resume: '恢复', stop: '停止', retry: '重试', handoff: '请求移交', replan: '请求重新规划', steer: '引导执行' },
  en: { pause: 'Pause', resume: 'Resume', stop: 'Stop', retry: 'Retry', handoff: 'Request handoff', replan: 'Request replan', steer: 'Steer execution' },
}

const scopeLabels: Record<'en' | 'zh-CN', Record<SteeringScope, string>> = {
  'zh-CN': { current_step: '当前步骤', remaining_plan: '剩余计划', session: '整个 Session', guidance_proposal: '项目/团队指南提案' },
  en: { current_step: 'Current step', remaining_plan: 'Remaining Plan', session: 'Whole Session', guidance_proposal: 'Project/Team Guidance proposal' },
}

type AgentControlDialogProps = {
  action: AgentControlAction | null
  onClose: () => void
  onCommitted?: (result: AgentControlResult) => void | Promise<void>
  open: boolean
  sessionId: string
}

export function AgentControlDialog(props: AgentControlDialogProps) {
  if (!props.open || !props.action) return null
  return <OpenAgentControlDialog {...props} action={props.action} />
}

function OpenAgentControlDialog({ action, onClose, onCommitted, sessionId }: Omit<AgentControlDialogProps, 'action' | 'open'> & { action: AgentControlAction }) {
  const { locale } = useLocale()
  const router = useRouter()
  const reasonRef = useRef<HTMLTextAreaElement | null>(null)
  const [preview, setPreview] = useState<ActionPreview | null>(null)
  const [stopMode, setStopMode] = useState<StopMode>('graceful')
  const [scope, setScope] = useState<SteeringScope>('session')
  const [reason, setReason] = useState('')
  const [instruction, setInstruction] = useState('')
  const [reuseContext, setReuseContext] = useState(true)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const text = locale === 'zh-CN' ? {
    affected: '受影响资源', artifacts: '已发布产物', cancel: '取消', close: '关闭', consequences: '后果', current: '当前状态', expires: '预览过期时间', heartbeat: '最后心跳', instruction: '指令', instructionHint: '说明期望结果和不可越过的边界。', lease: '租约行为', loading: '正在计算当前后果…', mode: '停止模式', modeImmediate: '立即', modeGraceful: '优雅', noPreview: '无法加载权威预览。', plan: '当前计划', preserve: '保留', reason: '原因', recovery: '恢复路径', refresh: '按最新状态重新预览', scope: '作用范围', stale: 'Session 已变化。你的草稿已保留；请检查最新预览后重新提交。', submit: '确认并执行', unavailable: '当前不允许此操作', uncommitted: '未提交运行时工作', warning: '警告',
  } : {
    affected: 'Affected resources', artifacts: 'Published artifacts', cancel: 'Cancel', close: 'Close', consequences: 'Consequences', current: 'Current state', expires: 'Preview expires', heartbeat: 'Last heartbeat', instruction: 'Instruction', instructionHint: 'Describe the expected result and boundaries that must not be crossed.', lease: 'Lease behavior', loading: 'Computing current consequences…', mode: 'Stop mode', modeImmediate: 'Immediate', modeGraceful: 'Graceful', noPreview: 'The authoritative preview could not be loaded.', plan: 'Current Plan', preserve: 'Preserved', reason: 'Reason', recovery: 'Recovery path', refresh: 'Review latest state', scope: 'Scope', stale: 'The Session changed. Your draft is preserved; review the latest preview before reissuing.', submit: 'Confirm and execute', unavailable: 'This action is not currently allowed', uncommitted: 'Uncommitted runtime work', warning: 'Warning',
  }

  const loadPreview = useCallback(async () => {
    if (!action) return false
    setLoading(true); setError('')
    try {
      const next = await apiRequest<ActionPreview>(`/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/control-preview`, {
        method: 'POST', headers: json({}), body: JSON.stringify({ action, ...(action === 'stop' ? { stopMode } : {}), ...(['steer', 'replan', 'handoff'].includes(action) ? { steeringScope: action === 'replan' ? 'remaining_plan' : action === 'handoff' ? 'session' : scope } : {}) }),
      })
      setPreview(next)
      if (next.stopMode) setStopMode(next.stopMode)
      if (next.steeringScope) setScope(next.steeringScope)
      return true
    } catch (reason) { setError(reason instanceof Error ? reason.message : text.noPreview); return false }
    finally { setLoading(false) }
  }, [action, scope, sessionId, stopMode, text.noPreview])

  useEffect(() => { void loadPreview() }, [loadPreview])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!action || !preview || submitting || !preview.allowed) return
    setSubmitting(true); setError('')
    try {
      let result: AgentControlResult = null
      if (preview.resultResource === 'guidance') {
        result = { href: '/?view=guidance', label: scopeLabels[locale].guidance_proposal }
        router.push(result.href)
      } else if (action === 'retry') {
        const next = await apiMutation<AgentSession>(`governed-control:${sessionId}:retry`, `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/retry`, { method: 'POST', headers: { ...json({}), 'If-Match': `"revision-${preview.sourceRevision}"` }, body: JSON.stringify({ reason, ...(instruction.trim() ? { initialPrompt: instruction.trim() } : {}), reuseContext }) })
        result = { href: `/agent-sessions/${encodeURIComponent(next.id)}`, label: `${actionLabels[locale].retry} ${next.id.slice(0, 8)}`, session: next }
        router.push(result.href)
      } else if (action === 'pause' || action === 'resume' || action === 'stop') {
        await apiMutation(`governed-control:${sessionId}:${action}`, `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/signals`, { method: 'POST', headers: { ...json({}), 'If-Match': `"revision-${preview.sourceRevision}"` }, body: JSON.stringify({ signal: action, reason, ...(action === 'stop' ? { stopMode } : {}) }) })
        result = { href: `/agent-sessions/${encodeURIComponent(sessionId)}`, label: actionLabels[locale][action] }
      } else {
        const effectiveScope = action === 'replan' ? 'remaining_plan' : action === 'handoff' ? 'session' : scope
        const title = action === 'handoff' ? 'Handoff request' : effectiveScope === 'remaining_plan' ? 'Remaining Plan guidance' : effectiveScope === 'current_step' ? 'Current Step guidance' : 'Session instruction'
        await apiMutation(`governed-control:${sessionId}:${action}:${effectiveScope}`, `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/prompt`, { method: 'POST', headers: { ...json({}), 'If-Match': `"revision-${preview.sourceRevision}"` }, body: JSON.stringify({ bodyMarkdown: `## ${title}\n\nReason: ${reason}\n\n${instruction.trim()}`, ...(effectiveScope === 'remaining_plan' && preview.currentPlan ? { planRevision: preview.currentPlan.revision } : {}) }) })
        result = { href: `/agent-sessions/${encodeURIComponent(sessionId)}`, label: actionLabels[locale][action] }
      }
      setStale(false)
      await onCommitted?.(result)
      onClose()
    } catch (reason) {
      if (reason instanceof ApiError && (reason.status === 409 || reason.code === 'STALE_REVISION')) { setStale(true); await loadPreview() }
      else setError(reason instanceof Error ? reason.message : text.noPreview)
    } finally { setSubmitting(false) }
  }

  const needsInstruction = action === 'steer' || action === 'replan' || action === 'handoff'
  const title = action ? actionLabels[locale][action] : ''
  return <Dialog closeLabel={text.close} description={preview ? `${text.current}: ${preview.currentState} · revision ${preview.sourceRevision}` : undefined} initialFocusRef={reasonRef} onClose={onClose} open title={title}>
    {loading && !preview ? <p aria-live="polite">{text.loading}</p> : <form className="agent-control-form" onSubmit={event => void submit(event)}>
      {stale && <section className="control-conflict" role="alert"><p>{text.stale}</p><Button onClick={() => void loadPreview().then(refreshed => { if (refreshed) setStale(false) })} type="button" variant="secondary">{text.refresh}</Button></section>}
      {error && <p className="error" role="alert">{error}</p>}
      {preview && <>
        {action === 'stop' && <fieldset><legend>{text.mode}</legend>{preview.supportedStopModes.map(option => <label key={option.mode}><input checked={stopMode === option.mode} disabled={!option.available || submitting} name="stop-mode" onChange={() => setStopMode(option.mode)} type="radio" /> <strong>{option.mode === 'graceful' ? text.modeGraceful : text.modeImmediate}</strong><span>{option.summary}</span></label>)}</fieldset>}
        {action === 'steer' && <label>{text.scope}<select disabled={submitting} onChange={event => setScope(event.currentTarget.value as SteeringScope)} value={scope}>{preview.supportedSteeringScopes.map(option => <option disabled={!option.available} key={option.scope} value={option.scope}>{scopeLabels[locale][option.scope]}</option>)}</select></label>}
        <label>{text.reason}<textarea autoFocus name="reason" onChange={event => setReason(event.currentTarget.value)} ref={reasonRef} required={preview.requiredReason} value={reason} /></label>
        {needsInstruction && preview.resultResource !== 'guidance' && <label>{text.instruction}<textarea name="instruction" onChange={event => setInstruction(event.currentTarget.value)} placeholder={text.instructionHint} required value={instruction} /></label>}
        {action === 'retry' && <label className="run-check"><input checked={reuseContext} onChange={event => setReuseContext(event.currentTarget.checked)} type="checkbox" /> {text.preserve}</label>}
        <section aria-label={text.consequences} className="agent-control-preview"><h3>{text.consequences}</h3><ul>{preview.consequences.map(item => <li key={item.code}><strong>{item.code}</strong><span>{item.summary}</span></li>)}</ul><dl><div><dt>{text.lease}</dt><dd>{preview.leaseBehavior}</dd></div><div><dt>{text.artifacts}</dt><dd>{preview.preserveArtifacts ? text.preserve : '—'}</dd></div><div><dt>{text.uncommitted}</dt><dd>{preview.preserveUncommittedWork}</dd></div><div><dt>{text.heartbeat}</dt><dd>{preview.lastHeartbeatAt ? new Date(preview.lastHeartbeatAt).toLocaleString(locale) : '—'}</dd></div><div><dt>{text.plan}</dt><dd>{preview.currentPlan ? `v${preview.currentPlan.revision}` : '—'}</dd></div><div><dt>{text.recovery}</dt><dd>{preview.recoveryPath}</dd></div><div><dt>{text.expires}</dt><dd>{new Date(preview.expiresAt).toLocaleTimeString(locale)}</dd></div></dl><AffectedResourceList label={text.affected} resources={preview.affectedResources.map(resource => ({ id: resource.id, label: resource.id, typeLabel: resource.type }))} />{preview.invalidatedApprovals.length > 0 && <p>{text.warning}: {preview.invalidatedApprovals.length} Approval(s) will be invalidated.</p>}{preview.warnings.map(warning => <p className="control-warning" key={warning}>{warning}</p>)}</section>
        {!preview.allowed && <p className="error" role="alert">{text.unavailable}: {preview.reasonCode}</p>}
        <div className="agent-control-actions"><Button disabled={submitting || !preview.allowed || stale || (preview.requiredReason && !reason.trim()) || (needsInstruction && preview.resultResource !== 'guidance' && !instruction.trim())} type="submit" variant={action === 'stop' ? 'danger' : 'primary'}>{submitting ? text.loading : text.submit}</Button><Button disabled={submitting} onClick={onClose} type="button" variant="secondary">{text.cancel}</Button></div>
      </>}
    </form>}
  </Dialog>
}
