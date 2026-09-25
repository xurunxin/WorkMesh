'use client'

import { useId, useRef, type PropsWithChildren, type ReactNode } from 'react'
import { RobotIcon } from '@phosphor-icons/react/dist/csr/Robot'
import { UserCircleIcon } from '@phosphor-icons/react/dist/csr/UserCircle'
import { Badge } from '../primitives/badge.js'
import { Button } from '../primitives/button.js'
import { Dialog, Sheet } from '../primitives/overlay-surfaces.js'

export type AttentionKind = 'decision' | 'approval' | 'clarification' | 'conflict' | 'recovery' | 'completion_review'
export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical'
export type UrgencyLevel = 'normal' | 'soon' | 'urgent' | 'overdue'
export type FreshnessState = 'fresh' | 'partial' | 'stale' | 'offline'
export type RunHealth = 'healthy' | 'degraded' | 'stalled' | 'failed' | 'unknown'
export type LifecycleState = 'open' | 'seen' | 'applying' | 'decided' | 'verified' | 'failed' | 'expired' | 'superseded'

type SemanticBadgeProps<T extends string> = {
  categoryLabel: string
  label: string
  value: T
}

function SemanticBadge<T extends string>({ categoryLabel, label, value }: SemanticBadgeProps<T>) {
  return <Badge aria-label={`${categoryLabel}: ${label}`} className={`wm-semantic-badge wm-semantic-${value}`} data-semantic-value={value}>{label}</Badge>
}

export function AttentionKindBadge(props: SemanticBadgeProps<AttentionKind>) { return <SemanticBadge {...props} /> }
export function RiskBadge(props: SemanticBadgeProps<RiskLevel>) { return <SemanticBadge {...props} /> }
export function UrgencyBadge(props: SemanticBadgeProps<UrgencyLevel>) { return <SemanticBadge {...props} /> }
export function FreshnessBadge(props: SemanticBadgeProps<FreshnessState>) { return <SemanticBadge {...props} /> }
export function RunHealthBadge(props: SemanticBadgeProps<RunHealth>) { return <SemanticBadge {...props} /> }
export function LifecycleBadge(props: SemanticBadgeProps<LifecycleState>) { return <SemanticBadge {...props} /> }

export type ActorAttributionProps = {
  activeAgent?: { label: string; name: string } | null
  relationshipLabel?: string
  responsibleHuman: { label: string; name: string }
}

export function ActorAttribution({ activeAgent, relationshipLabel, responsibleHuman }: ActorAttributionProps) {
  return <dl className="wm-actor-attribution">
    <div className="wm-actor-human"><dt><UserCircleIcon aria-hidden="true" size={16} />{responsibleHuman.label}</dt><dd>{responsibleHuman.name}</dd></div>
    {activeAgent && <div className="wm-actor-agent"><dt><RobotIcon aria-hidden="true" size={16} />{activeAgent.label}</dt><dd>{activeAgent.name}</dd></div>}
    {activeAgent && relationshipLabel && <div className="wm-actor-relationship"><dt>{relationshipLabel}</dt><dd>{activeAgent.name} / {responsibleHuman.name}</dd></div>}
  </dl>
}

export type ControlCenterSectionProps = PropsWithChildren<{
  action?: ReactNode
  count: number
  description?: string
  title: string
  tone: 'attention' | 'running' | 'risk' | 'verified'
}>

export function ControlCenterSection({ action, children, count, description, title, tone }: ControlCenterSectionProps) {
  const headingId = useId()
  return <section aria-labelledby={headingId} className={`wm-control-section wm-control-section-${tone}`}>
    <header><div><span aria-hidden="true" className="wm-control-section-marker" /><h2 id={headingId}>{title}</h2><span className="wm-control-section-count">{count}</span></div>{action}</header>
    {description && <p className="wm-control-section-description">{description}</p>}
    <div className="wm-control-section-content">{children}</div>
  </section>
}

export type AttentionListItemProps = {
  actions?: ReactNode
  actor?: ReactNode
  badges?: ReactNode
  description: string
  metadata?: ReactNode
  title: string
}

export function AttentionListItem({ actions, actor, badges, description, metadata, title }: AttentionListItemProps) {
  return <article className="wm-attention-item">
    <div className="wm-attention-item-main"><div className="wm-attention-item-badges">{badges}</div><h3>{title}</h3><p>{description}</p>{actor}{metadata && <div className="wm-attention-item-meta">{metadata}</div>}</div>
    {actions && <div className="wm-attention-item-actions">{actions}</div>}
  </article>
}

export function AttentionCard(props: AttentionListItemProps) { return <div className="wm-attention-card"><AttentionListItem {...props} /></div> }

export type RunStatusBarProps = {
  completed: number
  label: string
  total: number
}

export function RunStatusBar({ completed, label, total }: RunStatusBarProps) {
  const safeTotal = Math.max(0, total)
  const safeCompleted = Math.min(Math.max(0, completed), safeTotal)
  return <div className="wm-run-status" aria-label={label} role="group">
    <div aria-hidden="true" className="wm-run-status-segments">{Array.from({ length: safeTotal }, (_, index) => <span className={index < safeCompleted ? 'is-complete' : ''} key={index} />)}</div>
    <span>{safeCompleted}/{safeTotal}</span>
  </div>
}

export type RunDigestCardProps = PropsWithChildren<{
  actions?: ReactNode
  attribution: ReactNode
  badges?: ReactNode
  description?: string
  status: ReactNode
  title: string
}>

export function RunDigestCard({ actions, attribution, badges, children, description, status, title }: RunDigestCardProps) {
  return <article className="wm-run-digest">
    <header><div><div className="wm-run-digest-badges">{badges}</div><h3>{title}</h3>{description && <p>{description}</p>}</div><div className="wm-run-digest-status">{status}</div></header>
    {attribution}
    {children && <div className="wm-run-digest-details">{children}</div>}
    {actions && <footer>{actions}</footer>}
  </article>
}

export type PlanStep = {
  description?: string
  id: string
  label: string
  state: 'complete' | 'current' | 'pending' | 'blocked'
}

export function PlanStepRail({ label, steps }: { label: string; steps: readonly PlanStep[] }) {
  return <ol aria-label={label} className="wm-plan-step-rail">{steps.map(step => <li className={`state-${step.state}`} key={step.id}><span aria-hidden="true" className="wm-plan-step-marker" /><div><strong>{step.label}</strong>{step.description && <span>{step.description}</span>}</div></li>)}</ol>
}

export type TimelineEntry = {
  actor?: string
  description: string
  id: string
  label: string
  time: string
}

export function CausalTimeline({ entries, label }: { entries: readonly TimelineEntry[]; label: string }) {
  return <ol aria-label={label} className="wm-causal-timeline">{entries.map(entry => <li key={entry.id}><span aria-hidden="true" className="wm-causal-marker" /><div><header><strong>{entry.label}</strong><time dateTime={entry.time}>{entry.time}</time></header><p>{entry.description}</p>{entry.actor && <small>{entry.actor}</small>}</div></li>)}</ol>
}

export function TechnicalEventGroup({ children, count, label, open }: PropsWithChildren<{ count: number; label: string; open?: boolean }>) {
  return <details className="wm-technical-events" open={open}><summary>{label}<span>{count}</span></summary><div>{children}</div></details>
}

export type EvidenceReference = {
  description?: string
  href: string
  id: string
  label: string
  typeLabel: string
}

export function EvidenceReferenceList({ evidence, label }: { evidence: readonly EvidenceReference[]; label: string }) {
  return <ul aria-label={label} className="wm-evidence-list">{evidence.map(reference => <li key={reference.id}><a href={reference.href}><strong>{reference.label}</strong><span>{reference.typeLabel}</span>{reference.description && <small>{reference.description}</small>}</a></li>)}</ul>
}

export function EvidenceDrawer({ children, closeLabel, description, onClose, open, title }: PropsWithChildren<{ closeLabel: string; description?: string; onClose: () => void; open: boolean; title: string }>) {
  return <Sheet closeLabel={closeLabel} description={description} onClose={onClose} open={open} title={title}>{children}</Sheet>
}

export type ConsequencePreviewDialogProps = {
  cancelLabel: string
  confirmLabel: string
  consequences: readonly string[]
  description: string
  onCancel: () => void
  onConfirm: () => void
  open: boolean
  title: string
}

export function ConsequencePreviewDialog({ cancelLabel, confirmLabel, consequences, description, onCancel, onConfirm, open, title }: ConsequencePreviewDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  return <Dialog closeLabel={cancelLabel} description={description} initialFocusRef={cancelRef} onClose={onCancel} open={open} title={title}>
    <ul className="wm-consequence-list">{consequences.map(consequence => <li key={consequence}>{consequence}</li>)}</ul>
    <div className="wm-consequence-actions"><Button onClick={onConfirm} type="button" variant="danger">{confirmLabel}</Button><Button onClick={onCancel} ref={cancelRef} type="button">{cancelLabel}</Button></div>
  </Dialog>
}

export type AffectedResource = { href?: string; id: string; label: string; typeLabel: string }
export function AffectedResourceList({ label, resources }: { label: string; resources: readonly AffectedResource[] }) {
  return <ul aria-label={label} className="wm-resource-list">{resources.map(resource => <li key={resource.id}><span>{resource.typeLabel}</span>{resource.href ? <a href={resource.href}>{resource.label}</a> : <strong>{resource.label}</strong>}</li>)}</ul>
}

export function ReasonCodeList({ label, reasons }: { label: string; reasons: readonly Readonly<{ code: string; explanation: string }>[] }) {
  return <dl aria-label={label} className="wm-reason-list">{reasons.map(reason => <div key={reason.code}><dt><code>{reason.code}</code></dt><dd>{reason.explanation}</dd></div>)}</dl>
}

export type ControlCapability = { enabled: boolean; id: string; label: string; reason?: string }
export function ControlCapabilityBar({ capabilities, label, onSelect }: { capabilities: readonly ControlCapability[]; label: string; onSelect?: (id: string) => void }) {
  return <div aria-label={label} className="wm-capability-bar" role="toolbar">{capabilities.map(capability => <Button aria-describedby={capability.reason ? `wm-capability-${capability.id}-reason` : undefined} disabled={!capability.enabled} key={capability.id} onClick={() => onSelect?.(capability.id)} type="button" variant="ghost">{capability.label}{capability.reason && <span className="wm-visually-hidden" id={`wm-capability-${capability.id}-reason`}>{capability.reason}</span>}</Button>)}</div>
}
