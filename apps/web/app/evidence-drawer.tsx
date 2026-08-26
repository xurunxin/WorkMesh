'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, FreshnessBadge } from '@workmesh/ui'
import { canonicalObjectHref, evidenceDrawerHref, safeExternalHref, type CanonicalObject } from './lib/canonical-route'

export type EvidenceDrawerItem = Readonly<{
  id: string
  type: string
  title?: string
  status?: string
  validationState?: 'not_verified' | 'pending' | 'verified' | 'failed' | 'stale' | 'superseded' | 'missing' | 'unknown'
  uri?: string
  checksum?: string | null
  sourceTool?: string | null
  createdAt?: string
  producer?: { id: string; label: string; kind: 'human' | 'agent' | 'service' }
  principalHuman?: { id: string; label: string }
  sessionId?: string
  workItem?: { id: string; label: string; projectId?: string }
  plan?: { versionId?: string; stepId?: string; stepLabel?: string }
  action?: { id?: string; label: string; correlationId?: string }
  validation?: { id?: string; label: string; exactHeadSha?: string; currentHeadSha?: string }
  repository?: { repository?: string | null; branch?: string | null; commit?: string | null; pullRequest?: string | null }
  freshness?: 'current' | 'refreshing' | 'stale' | 'offline' | 'partial' | 'resync_required'
  summary?: string
  related?: Array<{ id: string; label: string; relation: 'related' | 'supersedes' | 'superseded_by' }>
}>

const labelState = (item: EvidenceDrawerItem): NonNullable<EvidenceDrawerItem['validationState']> =>
  item.validationState ?? (item.status === 'validated' ? 'verified' : item.status === 'failed' ? 'failed' : item.status === 'superseded' ? 'superseded' : item.status === 'produced' ? 'pending' : 'unknown')

export function useEvidenceDrawer(items: readonly EvidenceDrawerItem[], source: string) {
  const [selectedId, setSelectedId] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('evidenceId') ?? '')
  const selectedIdRef = useRef(selectedId)
  const returnFocus = useRef<HTMLElement | null>(null)
  const openedHere = useRef(false)
  useEffect(() => {
    const restore = () => {
      const nextSelectedId = new URLSearchParams(window.location.search).get('evidenceId') ?? ''
      const shouldRestoreFocus = Boolean(selectedIdRef.current) && !nextSelectedId
      selectedIdRef.current = nextSelectedId
      setSelectedId(nextSelectedId)
      if (shouldRestoreFocus) queueMicrotask(() => returnFocus.current?.focus())
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  const selected = useMemo(() => items.find(item => item.id === selectedId) ?? null, [items, selectedId])
  const open = useCallback((item: EvidenceDrawerItem, trigger?: HTMLElement | null) => {
    returnFocus.current = trigger ?? document.activeElement as HTMLElement | null
    openedHere.current = true
    window.history.pushState(window.history.state, '', evidenceDrawerHref(window.location.href, item.id, source, trigger?.id))
    selectedIdRef.current = item.id
    setSelectedId(item.id)
  }, [source])
  const close = useCallback(() => {
    if (openedHere.current) { openedHere.current = false; window.history.back() }
    else { window.history.replaceState(window.history.state, '', evidenceDrawerHref(window.location.href)); selectedIdRef.current = ''; setSelectedId('') }
    queueMicrotask(() => returnFocus.current?.focus())
  }, [])
  return { selected, open, close }
}

const link = (target: CanonicalObject, label: string) => {
  const href = canonicalObjectHref(target)
  return href ? <a href={href}>{label}</a> : <span>{label} · unsupported</span>
}

export function EvidenceDrawer({ item, onClose }: { item: EvidenceDrawerItem | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (item) closeRef.current?.focus() }, [item])
  if (!item) return null
  const state = labelState(item)
  const external = safeExternalHref(item.uri)
  const pullRequest = safeExternalHref(item.repository?.pullRequest)
  const freshness = item.freshness ?? 'partial'
  const headDrift = Boolean(item.validation?.exactHeadSha && item.validation.currentHeadSha && item.validation.exactHeadSha !== item.validation.currentHeadSha)
  return <aside aria-labelledby="evidence-drawer-title" aria-modal="true" className="evidence-drawer" role="dialog">
    <header><div><p className="eyebrow">Evidence · {item.type}</p><h2 id="evidence-drawer-title">{item.title ?? 'Untitled evidence'}</h2><p>{item.summary ?? 'No sanitized preview was published.'}</p></div><Button onClick={onClose} ref={closeRef} type="button" variant="secondary">Close evidence</Button></header>
    <div className="evidence-drawer-status"><span className={`verification verification-${state === 'unknown' ? 'not_verified' : state}`}>{state}</span><FreshnessBadge categoryLabel="Evidence freshness" label={freshness} value={freshness === 'current' ? 'fresh' : freshness === 'offline' ? 'offline' : freshness === 'partial' ? 'partial' : 'stale'} />{headDrift && <strong className="error">Head drift invalidates this validation</strong>}</div>
    <section><h3>Provenance and responsibility</h3><dl>{item.producer && <div><dt>Producer</dt><dd>{item.producer.label} · {item.producer.kind}</dd></div>}{item.principalHuman && <div><dt>Principal Human</dt><dd>{item.principalHuman.label}</dd></div>}<div><dt>Created / published</dt><dd>{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown'}</dd></div><div><dt>Source tool</dt><dd>{item.sourceTool ?? 'Unknown'}</dd></div><div><dt>Checksum / content hash</dt><dd>{item.checksum ?? 'Unknown'}</dd></div></dl></section>
    <section><h3>Work and validation context</h3><ul className="evidence-context-links">{item.workItem && <li>{link({ kind: 'work_item', id: item.workItem.id, projectId: item.workItem.projectId }, item.workItem.label)}</li>}{item.sessionId && <li>{link({ kind: 'run', id: item.sessionId }, 'Producing Run')}</li>}{item.plan?.versionId && item.sessionId && <li>{link({ kind: 'plan_version', id: item.plan.versionId, sessionId: item.sessionId }, 'Plan version')}</li>}{item.plan?.stepId && item.sessionId && <li>{link({ kind: 'plan_step', id: item.plan.stepId, sessionId: item.sessionId, planVersionId: item.plan.versionId }, item.plan.stepLabel ?? 'Plan step')}</li>}{item.action && <li>{item.action.label}{item.action.correlationId ? ` · ${item.action.correlationId}` : ''}</li>}</ul><dl>{item.validation && <div><dt>Validation</dt><dd>{item.validation.label}</dd></div>}{item.validation?.exactHeadSha && <div><dt>Validated head</dt><dd><code>{item.validation.exactHeadSha}</code></dd></div>}{item.validation?.currentHeadSha && <div><dt>Current head</dt><dd><code>{item.validation.currentHeadSha}</code></dd></div>}</dl></section>
    <section><h3>Provider facts</h3><dl><div><dt>Repository</dt><dd>{item.repository?.repository ?? 'Unsupported / unknown'}</dd></div><div><dt>Branch</dt><dd>{item.repository?.branch ?? 'Unknown'}</dd></div><div><dt>Commit / head SHA</dt><dd>{item.repository?.commit ? <code>{item.repository.commit}</code> : 'Unknown'}</dd></div><div><dt>Pull request</dt><dd>{pullRequest ? <a href={pullRequest} rel="noopener noreferrer" target="_blank">Open provider record</a> : 'Unsupported / unknown'}</dd></div></dl>{external ? <a className="wm-button wm-button-secondary" href={external} rel="noopener noreferrer" target="_blank">Open external evidence</a> : item.uri ? <p className="error">External URI is not safe to open.</p> : null}</section>
    {item.related?.length ? <section><h3>Related and superseded evidence</h3><ul>{item.related.map(related => <li key={`${related.relation}:${related.id}`}>{related.relation}: {related.label}</li>)}</ul></section> : null}
    <details><summary>Technical Details</summary><dl><div><dt>Evidence ID</dt><dd><code>{item.id}</code></dd></div><div><dt>Status source</dt><dd>{item.status ?? 'Unknown'}</dd></div><div><dt>Session ID</dt><dd><code>{item.sessionId ?? 'Unknown'}</code></dd></div><div><dt>Action ID</dt><dd><code>{item.action?.id ?? 'Unknown'}</code></dd></div><div><dt>Validation ID</dt><dd><code>{item.validation?.id ?? 'Unknown'}</code></dd></div></dl></details>
  </aside>
}
