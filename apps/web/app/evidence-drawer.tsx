'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Eyebrow, FreshnessBadge } from '@workmesh/ui'
import { canonicalObjectHref, evidenceDrawerHref, safeExternalHref, type CanonicalObject } from './lib/canonical-route'
import { useLocale } from './lib/i18n'
import { productMetricSurface, recordProductMetric } from './lib/product-telemetry'

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
      if (shouldRestoreFocus) queueMicrotask(() => {
        returnFocus.current?.focus()
        recordProductMetric('navigation_restore', 0, { surface: productMetricSurface(source), actionClass: 'back' }, { outcome: document.activeElement === returnFocus.current ? 'success' : 'failure' })
      })
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
    recordProductMetric('evidence_navigation', 0, { surface: productMetricSurface(source), actionClass: 'open' }, { outcome: 'success' })
  }, [source])
  const close = useCallback(() => {
    if (openedHere.current) {
      openedHere.current = false
      window.history.back()
      return
    }
    window.history.replaceState(window.history.state, '', evidenceDrawerHref(window.location.href))
    selectedIdRef.current = ''
    setSelectedId('')
    queueMicrotask(() => {
      returnFocus.current?.focus()
      recordProductMetric('navigation_restore', 0, { surface: productMetricSurface(source), actionClass: 'back' }, { outcome: document.activeElement === returnFocus.current ? 'success' : 'failure' })
    })
  }, [source])
  return { selected, open, close }
}

const link = (target: CanonicalObject, label: string, unsupportedSuffix: string) => {
  const href = canonicalObjectHref(target)
  return href ? <a href={href}>{label}</a> : <span>{label}{unsupportedSuffix}</span>
}

export function EvidenceDrawer({ item, onClose }: { item: EvidenceDrawerItem | null; onClose: () => void }) {
  const { sessionDetailCopy: text } = useLocale()
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (item) closeRef.current?.focus() }, [item])
  if (!item) return null
  const state = labelState(item)
  const external = safeExternalHref(item.uri)
  const pullRequest = safeExternalHref(item.repository?.pullRequest)
  const freshness = item.freshness ?? 'partial'
  const headDrift = Boolean(item.validation?.exactHeadSha && item.validation.currentHeadSha && item.validation.exactHeadSha !== item.validation.currentHeadSha)
  return <aside aria-labelledby="evidence-drawer-title" aria-modal="true" className="evidence-drawer" role="dialog">
    <header><div><Eyebrow>{text.eyebrow} {item.type}</Eyebrow><h2 id="evidence-drawer-title">{item.title ?? text.untitledTitle}</h2><p>{item.summary ?? text.noPreview}</p></div><Button onClick={onClose} ref={closeRef} type="button" variant="secondary">{text.closeButton}</Button></header>
    <div className="evidence-drawer-status"><span className={`verification verification-${state === 'unknown' ? 'not_verified' : state}`}>{state}</span><FreshnessBadge categoryLabel={text.freshnessCategory} label={freshness} value={freshness === 'current' ? 'fresh' : freshness === 'offline' ? 'offline' : freshness === 'partial' ? 'partial' : 'stale'} />{headDrift && <strong className="error">{text.headDriftWarning}</strong>}</div>
    <section><h3>{text.provenanceTitle}</h3><dl>{item.producer && <div><dt>{text.producerLabel}</dt><dd>{item.producer.label} · {item.producer.kind}</dd></div>}{item.principalHuman && <div><dt>{text.principalHumanLabel}</dt><dd>{item.principalHuman.label}</dd></div>}<div><dt>{text.createdLabel}</dt><dd>{item.createdAt ? new Date(item.createdAt).toLocaleString() : text.unknownValue}</dd></div><div><dt>{text.sourceToolLabel}</dt><dd>{item.sourceTool ?? text.unknownValue}</dd></div><div><dt>{text.checksumLabel}</dt><dd>{item.checksum ?? text.unknownValue}</dd></div></dl></section>
    <section><h3>{text.contextTitle}</h3><ul className="evidence-context-links">{item.workItem && <li>{link({ kind: 'work_item', id: item.workItem.id, projectId: item.workItem.projectId }, item.workItem.label, text.linkUnsupportedSuffix)}</li>}{item.sessionId && <li>{link({ kind: 'run', id: item.sessionId }, text.producingRunLabel, text.linkUnsupportedSuffix)}</li>}{item.plan?.versionId && item.sessionId && <li>{link({ kind: 'plan_version', id: item.plan.versionId, sessionId: item.sessionId }, text.planVersionLabel, text.linkUnsupportedSuffix)}</li>}{item.plan?.stepId && item.sessionId && <li>{link({ kind: 'plan_step', id: item.plan.stepId, sessionId: item.sessionId, planVersionId: item.plan.versionId }, item.plan.stepLabel ?? text.planStepLabel, text.linkUnsupportedSuffix)}</li>}{item.action && <li>{item.action.label}{item.action.correlationId ? ` · ${item.action.correlationId}` : ''}</li>}</ul><dl>{item.validation && <div><dt>{text.validationLabel}</dt><dd>{item.validation.label}</dd></div>}{item.validation?.exactHeadSha && <div><dt>{text.validatedHeadLabel}</dt><dd><code>{item.validation.exactHeadSha}</code></dd></div>}{item.validation?.currentHeadSha && <div><dt>{text.currentHeadLabel}</dt><dd><code>{item.validation.currentHeadSha}</code></dd></div>}</dl></section>
    <section><h3>{text.providerFactsTitle}</h3><dl><div><dt>{text.repositoryLabel}</dt><dd>{item.repository?.repository ?? text.unsupportedUnknown}</dd></div><div><dt>{text.branchLabel}</dt><dd>{item.repository?.branch ?? text.unknownValue}</dd></div><div><dt>{text.commitLabel}</dt><dd>{item.repository?.commit ? <code>{item.repository.commit}</code> : text.unknownValue}</dd></div><div><dt>{text.pullRequestLabel}</dt><dd>{pullRequest ? <a href={pullRequest} rel="noopener noreferrer" target="_blank">{text.openProviderRecord}</a> : text.unsupportedUnknown}</dd></div></dl>{external ? <a className="wm-button wm-button-secondary" href={external} rel="noopener noreferrer" target="_blank">{text.openExternalEvidence}</a> : item.uri ? <p className="error">{text.unsafeExternalUri}</p> : null}</section>
    {item.related?.length ? <section><h3>{text.relatedTitle}</h3><ul>{item.related.map(related => <li key={`${related.relation}:${related.id}`}>{related.relation}: {related.label}</li>)}</ul></section> : null}
    <details><summary>{text.technicalDetailsSummary}</summary><dl><div><dt>{text.evidenceIdLabel}</dt><dd><code>{item.id}</code></dd></div><div><dt>{text.statusSourceLabel}</dt><dd>{item.status ?? text.unknownValue}</dd></div><div><dt>{text.sessionIdLabel}</dt><dd><code>{item.sessionId ?? text.unknownValue}</code></dd></div><div><dt>{text.actionIdLabel}</dt><dd><code>{item.action?.id ?? text.unknownValue}</code></dd></div><div><dt>{text.validationIdLabel}</dt><dd><code>{item.validation?.id ?? text.unknownValue}</code></dd></div></dl></details>
  </aside>
}
