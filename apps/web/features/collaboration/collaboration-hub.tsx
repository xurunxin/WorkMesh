'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, WorkSurfaceState } from '@workmesh/ui'
import { ApiError, apiRequest } from '../../app/lib/api'
import { LoadMoreButton, usePagedApiList } from '../../app/lib/pagination'
import { formatTime } from '../../app/lib/agents'
import type { CollaborationState, NotificationFact, NotificationPreference } from './contracts'
import { collaborationState, notificationHealth, sortNotifications } from './view-model'

const stateCopy = {
  loading: ['Loading collaboration signals', 'Reading durable notification and preference facts.'],
  empty: ['No delivery feedback yet', 'Collaboration requests still appear in the Inbox above.'],
  forbidden: ['Collaboration feedback is unavailable', 'This Human session is not authorized to read these facts.'],
  error: ['Unable to load collaboration feedback', 'Retry the canonical reads; no mutation will be replayed.'],
  conflict: ['Collaboration facts changed', 'Reload current server facts before making another decision.'],
  expired: ['The approval expired', 'Reload the Inbox to see its durable current status.'],
  reconnecting: ['Reconnecting to durable collaboration facts', 'Existing server facts remain visible while the connection recovers.'],
  ready: ['', ''],
} as const

export function CollaborationStatePanel({
  onRetry,
  state,
}: {
  onRetry?: () => void
  state: Exclude<CollaborationState, 'ready'>
}) {
  const actionable = ['error', 'forbidden', 'conflict', 'expired'].includes(state)
  return <div data-collaboration-state={state}>
    <WorkSurfaceState
      state={state === 'expired' ? 'error' : state}
      title={stateCopy[state][0]}
      description={stateCopy[state][1]}
      {...(actionable && onRetry ? { actionLabel: 'Retry canonical reads', onAction: onRetry } : {})}
    />
  </div>
}

export function CollaborationHub() {
  const page = usePagedApiList<NotificationFact>('/api/v1/notifications', { optional: true })
  const [preference, setPreference] = useState<NotificationPreference | null>(null)
  const [preferenceError, setPreferenceError] = useState<Error | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const loadPreference = useCallback(async () => {
    try { setPreferenceError(null); setPreference(await apiRequest<NotificationPreference>('/api/v1/notification-preferences')) }
    catch (reason) { setPreferenceError(reason instanceof Error ? reason : new Error('Unable to load notification preferences.')) }
  }, [])
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
    <header><div><h3 id="collaboration-feedback-title">Notification feedback</h3><p>Preferences and delivery outcomes are separate server facts.</p></div><Button onClick={refresh}>Refresh</Button></header>
    {state !== 'ready' && <CollaborationStatePanel state={state} onRetry={refresh} />}
    {preference && <Card title="Delivery preferences" subtitle={`Revision ${preference.revision}`}><dl className="collaboration-facts"><div><dt>Channels</dt><dd>{preference.channels.join(', ')}</dd></div><div><dt>Digest</dt><dd>{preference.digest}</dd></div><div><dt>Minimum priority</dt><dd>{preference.minimum_priority}</dd></div><div><dt>Webhook</dt><dd>{preference.webhook_configured ? 'Configured (secret hidden)' : 'Unavailable / disabled'}</dd></div></dl></Card>}
    {sortNotifications(page.items).map(notification => { const health = notificationHealth(notification); return <Card key={notification.id} title={notification.title} subtitle={`${notification.priority.replaceAll('_', ' ')} · ${formatTime(notification.created_at)}`}><p>{notification.body || notification.kind}</p><p>Source: {notification.source_type} · {notification.source_id.slice(0, 8)}</p><div className="delivery-health" aria-label={`Delivery health for ${notification.title}`}>{notification.deliveries.length === 0 ? <Badge tone="neutral">No delivery channel</Badge> : notification.deliveries.map(delivery => <Badge key={delivery.channel} tone={delivery.status === 'delivered' ? 'success' : delivery.status === 'failed' || delivery.status === 'dead' ? 'danger' : 'warning'}>{delivery.channel}: {delivery.status}{delivery.last_error_present ? ' · error recorded' : ''}</Badge>)}</div>{health === 'failed' && <p className="error" role="status">Delivery failed. Saving preferences did not make this delivery successful; retry remains server-owned.</p>}</Card> })}
    <LoadMoreButton collection={page} label="notifications" />
  </section>
}
