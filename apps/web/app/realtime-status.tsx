'use client'

import React from 'react'
import { Badge } from '@workmesh/ui'
import { useRealtimeConnectionState } from './lib/realtime'

const statePresentation = {
  connected: { label: 'Live', tone: 'success' },
  connecting: { label: 'Connecting', tone: 'neutral' },
  reconnecting: { label: 'Reconnecting', tone: 'warning' },
  offline: { label: 'Offline', tone: 'danger' },
} as const

type RealtimeState = keyof typeof statePresentation

export function RealtimeStatus({ labels }: { labels?: Partial<Record<RealtimeState, string>> }) {
  const state = useRealtimeConnectionState()
  const presentation = statePresentation[state]
  return (
    <span aria-live="polite" data-realtime-state={state}>
      <Badge tone={presentation.tone}>{labels?.[state] ?? presentation.label}</Badge>
    </span>
  )
}
