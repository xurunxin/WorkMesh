'use client'

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { Button } from '@workmesh/ui'
import { CheckCircleIcon, ChatCenteredTextIcon, XCircleIcon } from '@phosphor-icons/react'
import {
  approvalActionability,
  formatApprovalPayload,
  type Approval,
  type ApprovalDecision,
  type ApprovalQuorum,
} from '../lib/agents'
import type { AgentsCopy } from '../lib/i18n'

export type ApprovalDecisionUiState = {
  status: 'idle' | 'busy' | 'success' | 'error'
  decision?: ApprovalDecision
  /** The server-recorded immutable reason, including attached requirements. */
  reason?: string
  message?: string
  quorum?: ApprovalQuorum
  retryable?: boolean
}

export type ApprovalDecisionControlsProps = {
  approval: Approval
  copy: AgentsCopy
  state?: ApprovalDecisionUiState
  onDecide: (approval: Approval, decision: ApprovalDecision, reason?: string) => Promise<boolean>
}

type DecisionInput = { decision: ApprovalDecision; reason?: string }

type ApprovalFocusContext = {
  rowId: string | null
  followingRowId: string | null
  region: HTMLElement | null
  stableRegion: HTMLElement | null
}

const isElevatedRisk = (risk: string): boolean => risk === 'high' || risk === 'critical'

const approvalActionSelector = '.approval-row-actions button:not(:disabled)'
const approvalRegionSelector = '.approval-grid, .approval-table-region, .attention-approval-decision, .work-item-needs-you, .approval-inbox, section[aria-label], section[aria-labelledby], [role="region"]'
const stableApprovalRegionSelector = '.approval-table-region, .attention-approval-decision, .work-item-needs-you, .approval-inbox, section[aria-label], section[aria-labelledby], [role="region"]'

const focusElement = (element: HTMLElement | null): boolean => {
  if (!element?.isConnected || element === document.body) return false
  element.focus({ preventScroll: true })
  return document.activeElement === element
}

const focusApprovalContext = (context: ApprovalFocusContext): void => {
  const region = context.region?.isConnected
    ? context.region
    : null
  const stableRegion = context.stableRegion?.isConnected
    ? context.stableRegion
    : document.querySelector<HTMLElement>(stableApprovalRegionSelector) ?? document.querySelector<HTMLElement>('main')
  const searchRegion = region
    ?? stableRegion
    ?? document.querySelector<HTMLElement>(approvalRegionSelector)
    ?? document.querySelector<HTMLElement>('main')
  if (!searchRegion && !stableRegion) return

  const rows = Array.from(searchRegion?.querySelectorAll<HTMLElement>('.approval-grid-row') ?? [])
  const followingIndex = context.followingRowId === null
    ? -1
    : rows.findIndex(row => row.dataset.testid === context.followingRowId)
  const candidates = followingIndex >= 0 ? rows.slice(followingIndex) : rows
  const nextAction = candidates
    .filter(row => row.dataset.testid !== context.rowId)
    .map(row => row.querySelector<HTMLElement>(approvalActionSelector))
    .find((button): button is HTMLElement => button !== null)
  if (focusElement(nextAction ?? null)) return

  // A table or semantic approval section is the stable fallback when no
  // actionable row survives the refresh. Keep it out of the normal tab order,
  // but make it a meaningful programmatic focus target instead of <body>.
  const focusTarget = stableRegion ?? searchRegion
  if (focusTarget && !focusTarget.hasAttribute('tabindex')) focusTarget.tabIndex = -1
  focusElement(focusTarget)
}

export function ApprovalDecisionControls({ approval, copy, onDecide, state = { status: 'idle' } }: ApprovalDecisionControlsProps) {
  const actionability = approvalActionability(approval)
  const [mode, setMode] = useState<'feedback' | 'confirmation' | null>(null)
  const [feedback, setFeedback] = useState('')
  const [validationError, setValidationError] = useState('')
  const [pendingInput, setPendingInput] = useState<DecisionInput | null>(null)
  const [retryInput, setRetryInput] = useState<DecisionInput | null>(null)
  const returnFocusRef = useRef<HTMLButtonElement | null>(null)
  const controlsRootRef = useRef<HTMLDivElement | null>(null)
  const focusContextRef = useRef<ApprovalFocusContext | null>(null)
  const resultStatusRef = useRef<HTMLDivElement | null>(null)
  const focusOwnedByApprovalRef = useRef(false)
  const previousActionabilityStatusRef = useRef(actionability.status)
  const busy = state.status === 'busy'
  const completed = state.status === 'success'
  const humanDecisions = approval.decisions?.filter(decision => decision.source === 'human') ?? []
  const recordedReason = state.reason ?? humanDecisions.at(-1)?.reason
  const quorum = state.quorum ?? approval.quorum
  const waitingForQuorum = actionability.status === 'blocked'
    && actionability.reason === 'viewer_already_decided'
    && quorum !== undefined
    && !quorum.reached

  useLayoutEffect(() => {
    const root = controlsRootRef.current
    const row = root?.closest<HTMLElement>('.approval-grid-row') ?? null
    const followingRow = row?.nextElementSibling instanceof HTMLElement ? row.nextElementSibling : null
    const context: ApprovalFocusContext = {
      rowId: row?.dataset.testid ?? null,
      followingRowId: followingRow?.dataset.testid ?? null,
      region: root?.closest<HTMLElement>(approvalRegionSelector) ?? null,
      stableRegion: root?.closest<HTMLElement>(stableApprovalRegionSelector) ?? null,
    }
    focusContextRef.current = context

    return () => {
      // React removes a refreshed approval row after layout-effect cleanup. At
      // cleanup time the success status is still focused, so defer the search
      // until the next microtask and focus a surviving peer or region.
      if (!root || !root.contains(document.activeElement)) return
      queueMicrotask(() => focusApprovalContext(context))
    }
  }, [])

  useEffect(() => {
    const becameBlocked = previousActionabilityStatusRef.current !== 'blocked'
      && actionability.status === 'blocked'
    previousActionabilityStatusRef.current = actionability.status
    const focusOwnedByApproval = focusOwnedByApprovalRef.current
    focusOwnedByApprovalRef.current = false
    if (becameBlocked && focusOwnedByApproval) queueMicrotask(() => resultStatusRef.current?.focus({ preventScroll: true }))
  }, [actionability.status])

  useLayoutEffect(() => {
    // Capture ownership before an actionability refresh swaps the success
    // status for a blocked/quorum status. An unrelated active control must
    // keep its focus when the approval changes elsewhere.
    return () => {
      const active = document.activeElement
      if (resultStatusRef.current?.contains(active) || controlsRootRef.current?.contains(active)) {
        focusOwnedByApprovalRef.current = true
      }
    }
  }, [actionability.status])

  useEffect(() => {
    if (completed && state.message) resultStatusRef.current?.focus()
  }, [completed, state.message])

  const resetComposer = () => {
    setMode(null)
    setPendingInput(null)
    setValidationError('')
  }

  const closeComposer = () => {
    resetComposer()
    window.setTimeout(() => {
      const trigger = returnFocusRef.current
      if (trigger?.isConnected && focusElement(trigger)) return
      const context = focusContextRef.current
      if (context) focusApprovalContext(context)
    }, 0)
  }

  const submit = async (input: DecisionInput) => {
    setRetryInput(input)
    const accepted = await onDecide(approval, input.decision, input.reason)
    if (accepted) resetComposer()
  }

  const requestDecision = (input: DecisionInput, trigger: HTMLButtonElement) => {
    // The feedback submit button is replaced by the high-risk confirmation
    // view. Preserve the still-mounted "Other feedback" opener for Cancel;
    // otherwise a stale ref would try to focus an unmounted composer button.
    if (!(mode === 'feedback' && isElevatedRisk(approval.risk_level))) returnFocusRef.current = trigger
    setValidationError('')
    if (isElevatedRisk(approval.risk_level)) {
      setPendingInput(input)
      setMode('confirmation')
      return
    }
    void submit(input)
  }

  const requestFeedbackDecision = (decision: ApprovalDecision, trigger: HTMLButtonElement) => {
    const reason = feedback.trim()
    if (!reason) {
      setValidationError(copy.approvalFeedbackRequired)
      return
    }
    requestDecision({ decision, reason }, trigger)
  }

  if (actionability.status === 'blocked') {
    if (waitingForQuorum && quorum) {
      return <div className="approval-decision-blocked approval-decision-waiting" ref={resultStatusRef} role="status" tabIndex={-1}>
        <strong>{copy.approvalUnavailable}</strong>
        <span>{copy.approvalDecisionQuorum(quorum.approved, quorum.required)}</span>
        {recordedReason && <span className="approval-decision-reason" data-testid={`approval-decision-reason-${approval.id}`}>{recordedReason}</span>}
      </div>
    }
    return <div className="approval-decision-blocked" ref={resultStatusRef} role="status" tabIndex={-1}>
      <strong>{copy.approvalUnavailable}</strong>
      <span>{copy.approvalBlockedReason(actionability.reason)}</span>
      {recordedReason && <span className="approval-decision-reason" data-testid={`approval-decision-reason-${approval.id}`}>{recordedReason}</span>}
    </div>
  }

  const allowed = (decision: ApprovalDecision): boolean => actionability.allowed_decisions.includes(decision)
  const buttonLabel = (decision: ApprovalDecision, fallback: string): string => busy && state.decision === decision
    ? copy.approvalDecisionWorking
    : fallback

  return <div
    className="approval-decision-controls"
    onBlurCapture={event => {
      // A row replacement can blur with a null relatedTarget; retain ownership
      // long enough for the actionability transition to focus its waiting
      // status. A real external target clears ownership immediately.
      const next = event.relatedTarget
      if (next !== null && (!controlsRootRef.current || !controlsRootRef.current.contains(next as Node))) {
        focusOwnedByApprovalRef.current = false
      }
    }}
    onFocusCapture={() => { focusOwnedByApprovalRef.current = true }}
    ref={controlsRootRef}
  >
    {!completed && <div aria-label={copy.approvalDecisionActions(approval.action_name)} className="approval-row-actions" role="group">
      {allowed('approved') && <Button
        disabled={busy}
        icon={<CheckCircleIcon aria-hidden size={15} weight="bold" />}
        onClick={(event: MouseEvent<HTMLButtonElement>) => requestDecision({ decision: 'approved' }, event.currentTarget)}
        type="button"
        variant="primary"
      >{buttonLabel('approved', copy.approvalApprove)}</Button>}
      {allowed('rejected') && <Button
        disabled={busy}
        icon={<XCircleIcon aria-hidden size={15} weight="bold" />}
        onClick={(event: MouseEvent<HTMLButtonElement>) => requestDecision({ decision: 'rejected' }, event.currentTarget)}
        type="button"
        variant="danger"
      >{buttonLabel('rejected', copy.approvalReject)}</Button>}
      <Button
        aria-expanded={mode === 'feedback'}
        disabled={busy}
        icon={<ChatCenteredTextIcon aria-hidden size={15} />}
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          returnFocusRef.current = event.currentTarget
          setValidationError('')
          setMode(current => current === 'feedback' ? null : 'feedback')
        }}
        type="button"
        variant="secondary"
      >{copy.approvalOtherFeedback}</Button>
    </div>}

    {mode === 'feedback' && !completed && <div className="approval-feedback-composer">
      <label htmlFor={`approval-feedback-${approval.id}`}>{copy.approvalFeedbackLabel}</label>
      <textarea
        aria-describedby={validationError ? `approval-feedback-error-${approval.id}` : undefined}
        autoFocus
        disabled={busy}
        id={`approval-feedback-${approval.id}`}
        onChange={event => {
          setFeedback(event.currentTarget.value)
          if (event.currentTarget.value.trim()) setValidationError('')
        }}
        placeholder={copy.approvalFeedbackPlaceholder}
        rows={3}
        value={feedback}
      />
      {validationError && <p className="approval-feedback-error" id={`approval-feedback-error-${approval.id}`} role="alert">{validationError}</p>}
      <div className="approval-feedback-actions">
        {allowed('approved') && <Button disabled={busy} onClick={event => requestFeedbackDecision('approved', event.currentTarget)} type="button" variant="primary">
          {buttonLabel('approved', copy.approvalApproveWithRequirements)}
        </Button>}
        {allowed('rejected') && <Button disabled={busy} onClick={event => requestFeedbackDecision('rejected', event.currentTarget)} type="button" variant="danger">
          {buttonLabel('rejected', copy.approvalRejectWithFeedback)}
        </Button>}
        <Button disabled={busy} onClick={closeComposer} type="button" variant="ghost">{copy.approvalCancel}</Button>
      </div>
    </div>}

    {mode === 'confirmation' && pendingInput && !completed && <div aria-labelledby={`approval-confirm-title-${approval.id}`} className="approval-scope-confirmation" role="group">
      <strong id={`approval-confirm-title-${approval.id}`}>{copy.approvalConfirmDecisionTitle}</strong>
      <p>{copy.approvalConfirmScope(approval.action_name, copy.riskLabel(approval.risk_level))}</p>
      <p className="approval-confirm-rationale">{approval.rationale_summary}</p>
      <div className="approval-confirm-payload">
        <span>{copy.approvalPayloadLabel}</span>
        <pre className="approval-payload" data-testid={`approval-confirm-payload-${approval.id}`}>{formatApprovalPayload(approval.action_payload_sanitized)}</pre>
        {approval.action_payload_hash && <code className="approval-payload-hash">{approval.action_payload_hash}</code>}
      </div>
      <div className="approval-feedback-actions">
        <Button
          autoFocus
          disabled={busy}
          onClick={() => void submit(pendingInput)}
          type="button"
          variant={pendingInput.decision === 'approved' ? 'primary' : 'danger'}
        >{buttonLabel(pendingInput.decision, pendingInput.decision === 'approved' ? copy.approvalConfirmApprove : copy.approvalConfirmReject)}</Button>
        <Button disabled={busy} onClick={closeComposer} type="button" variant="ghost">{copy.approvalCancel}</Button>
      </div>
    </div>}

    {state.status !== 'idle' && state.message && <div
      aria-live={state.status === 'error' ? 'assertive' : 'polite'}
      className={`approval-decision-status is-${state.status}`}
      data-testid={`approval-decision-status-${approval.id}`}
      ref={resultStatusRef}
      role={state.status === 'error' ? 'alert' : 'status'}
      tabIndex={state.status === 'success' ? -1 : undefined}
    >
      <span>{state.message}</span>
      {state.reason && <span className="approval-decision-reason" data-testid={`approval-decision-reason-${approval.id}`}>{state.reason}</span>}
      {state.status === 'error' && state.retryable && retryInput && <Button disabled={busy} onClick={() => void submit(retryInput)} type="button" variant="secondary">{copy.approvalRetry}</Button>}
    </div>}
  </div>
}
