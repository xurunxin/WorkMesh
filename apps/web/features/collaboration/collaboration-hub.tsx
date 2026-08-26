'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, WorkSurfaceState } from '@workmesh/ui'
import { ApiError, apiRequest } from '../../app/lib/api'
import { LoadMoreButton, usePagedApiList } from '../../app/lib/pagination'
import { formatTime } from '../../app/lib/agents'
import { useLocale } from '../../app/lib/i18n'
import type { CollaborationState, NotificationFact, NotificationPreference } from './contracts'
import { collaborationState, groupNotifications, notificationHealth } from './view-model'

export function CollaborationStatePanel({
  onRetry,
  state,
}: {
  onRetry?: () => void
  state: Exclude<CollaborationState, 'ready'>
}) {
  const { inboxCopy: text } = useLocale()
  const actionable = ['error', 'forbidden', 'conflict', 'expired'].includes(state)
  const title = state === 'loading' ? text.stateLoadingTitle
    : state === 'empty' ? text.stateEmptyTitle
    : state === 'forbidden' ? text.stateForbiddenTitle
    : state === 'error' ? text.stateErrorTitle
    : state === 'conflict' ? text.stateConflictTitle
    : state === 'expired' ? text.stateExpiredTitle
    : text.stateReconnectingTitle
  const description = state === 'loading' ? text.stateLoadingBody
    : state === 'empty' ? text.stateEmptyBody
    : state === 'forbidden' ? text.stateForbiddenBody
    : state === 'error' ? text.stateErrorBody
    : state === 'conflict' ? text.stateConflictBody
    : state === 'expired' ? text.stateExpiredBody
    : text.stateReconnectingBody
  return <div data-collaboration-state={state}>
    <WorkSurfaceState
      state={state === 'expired' ? 'error' : state}
      title={title}
      description={description}
      {...(actionable && onRetry ? { actionLabel: text.refresh, onAction: onRetry } : {})}
    />
  </div>
}

export function CollaborationHub() {
  const { inboxCopy: text } = useLocale()
  const page = usePagedApiList<NotificationFact>('/api/v1/notifications', { optional: true })
  const [preference, setPreference] = useState<NotificationPreference | null>(null)
  const [preferenceError, setPreferenceError] = useState<Error | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const loadPreference = useCallback(async () => {
    try { setPreferenceError(null); setPreference(await apiRequest<NotificationPreference>('/api/v1/notification-preferences')) }
    catch (reason) { setPreferenceError(reason instanceof Error ? reason : new Error(text.preferencesLoadError)) }
  }, [text.preferencesLoadError])
  useEffect(() => { void loadPreference() }, [loadPreference])
  useEffect(() => {
    const offline = () => setReconnecting(true)
    const online = () => { setReconnecting(false); void Promise.all([page.refresh(), loadPreference()]) }
    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    window.addEventListener('workmesh:collaboration-reconnecting', offline)
    window.addEventListener('workmesh:collaboration-reconnected', online)
    return () => {
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', online)
      window.removeEventListener('workmesh:collaboration-reconnecting', offline)
      window.removeEventListener('workmesh:collaboration-reconnected', online)
    }
  }, [loadPreference, page.refresh])
  const failure = page.error ?? preferenceError
  const state = collaborationState({
    loading: page.loading || (!preference && !preferenceError),
    error: failure ? { ...(failure instanceof ApiError ? { status: failure.status, code: failure.code } : {}) } : null,
    count: page.items.length,
    reconnecting,
  })
  const refresh = () => void Promise.all([page.refresh(), loadPreference()])
  return <section className="collaboration-feedback" aria-labelledby="collaboration-feedback-title" data-testid="collaboration-feedback">
    <header><div><h3 id="collaboration-feedback-title">{text.feedbackTitle}</h3><p>{text.feedbackIntro}</p></div><Button onClick={refresh} type="button" variant="secondary">{text.refresh}</Button></header>
    {state !== 'ready' && <CollaborationStatePanel state={state} onRetry={refresh} />}
    {preference && <Card title={text.preferencesTitle} subtitle={text.preferencesRevision(preference.revision)}><dl className="collaboration-facts"><div><dt>{text.channels}</dt><dd>{preference.channels.join(', ')}</dd></div><div><dt>{text.digest}</dt><dd>{preference.digest}</dd></div><div><dt>{text.minimumPriority}</dt><dd>{preference.minimum_priority}</dd></div><div><dt>{text.webhook}</dt><dd>{preference.webhook_configured ? text.credentialPending ?? text.webhookConfigured : text.webhookUnavailable}</dd></div></dl></Card>}
    {groupNotifications(page.items).map(group => { const notification = group.notification; const health = notificationHealth(notification); return <Card key={group.key} title={notification.title} subtitle={`${notification.priority.replaceAll('_', ' ')} · ${formatTime(notification.created_at)}${group.count > 1 ? ` · ${group.count} equivalent updates` : ''}`}><p>{notification.body || notification.kind}</p><details><summary>{text.source}</summary><p>{notification.source_type} · {notification.source_id}</p><p>{notification.kind}{group.count > 1 ? ` · ${group.ids.length} durable notifications` : ''}</p></details><div className="delivery-health" aria-label={text.deliveryHealthLabel(notification.title)}>{notification.deliveries.length === 0 ? <Badge tone="neutral">{text.noDeliveryChannel}</Badge> : notification.deliveries.map(delivery => <Badge key={delivery.channel} tone={delivery.status === 'delivered' ? 'success' : delivery.status === 'failed' || delivery.status === 'dead' ? 'danger' : 'warning'}>{delivery.channel}: {delivery.status}{delivery.last_error_present ? ` · ${text.deliveryRecordedError}` : ''}</Badge>)}</div>{health === 'failed' && <p className="error" role="status">{text.deliveryFailed}</p>}</Card>})}
    <LoadMoreButton collection={page} label={text.feedbackTitle} />
  </section>
}
