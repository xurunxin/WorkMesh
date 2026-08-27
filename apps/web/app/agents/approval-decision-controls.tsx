'use client'

import { useRef, useState, type MouseEvent } from 'react'
import { Button } from '@workmesh/ui'
import { CheckCircleIcon, ChatCenteredTextIcon, XCircleIcon } from '@phosphor-icons/react'
import {
  approvalActionability,
  type Approval,
  type ApprovalDecision,
  type ApprovalQuorum,
} from '../lib/agents'
import type { AgentsCopy } from '../lib/i18n'

export type ApprovalDecisionUiState = {
  status: 'idle' | 'busy' | 'success' | 'error'
  decision?: ApprovalDecision
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

const isElevatedRisk = (risk: string): boolean => risk === 'high' || risk === 'critical'

export function ApprovalDecisionControls({ approval, copy, onDecide, state = { status: 'idle' } }: ApprovalDecisionControlsProps) {
  const actionability = approvalActionability(approval)
  const [mode, setMode] = useState<'feedback' | 'confirmation' | null>(null)
  const [feedback, setFeedback] = useState('')
  const [validationError, setValidationError] = useState('')
  const [pendingInput, setPendingInput] = useState<DecisionInput | null>(null)
  const [retryInput, setRetryInput] = useState<DecisionInput | null>(null)
  const returnFocusRef = useRef<HTMLButtonElement | null>(null)
  const busy = state.status === 'busy'
  const completed = state.status === 'success'

  const closeComposer = () => {
    setMode(null)
    setPendingInput(null)
    setValidationError('')
    window.setTimeout(() => returnFocusRef.current?.focus(), 0)
  }

  const submit = async (input: DecisionInput) => {
    setRetryInput(input)
    const accepted = await onDecide(approval, input.decision, input.reason)
    if (accepted) closeComposer()
  }

  const requestDecision = (input: DecisionInput, trigger: HTMLButtonElement) => {
    returnFocusRef.current = trigger
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
    return <div className="approval-decision-blocked" role="status">
      <strong>{copy.approvalUnavailable}</strong>
      <span>{copy.approvalBlockedReason(actionability.reason)}</span>
    </div>
  }

  const allowed = (decision: ApprovalDecision): boolean => actionability.allowed_decisions.includes(decision)
  const buttonLabel = (decision: ApprovalDecision, fallback: string): string => busy && state.decision === decision
    ? copy.approvalDecisionWorking
    : fallback

  return <div className="approval-decision-controls">
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
      role={state.status === 'error' ? 'alert' : 'status'}
    >
      <span>{state.message}</span>
      {state.status === 'error' && state.retryable && retryInput && <Button disabled={busy} onClick={() => void submit(retryInput)} type="button" variant="secondary">{copy.approvalRetry}</Button>}
    </div>}
  </div>
}
