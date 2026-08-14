export type CollaborationState = 'loading' | 'empty' | 'ready' | 'forbidden' | 'error' | 'conflict' | 'expired' | 'reconnecting'

export type NotificationDelivery = {
  channel: 'in_app' | 'browser' | 'webhook'
  status: 'pending' | 'claimed' | 'delivered' | 'failed' | 'dead'
  attempt_count: number
  available_at: string
  claimed_at: string | null
  effect_completed_at: string | null
  delivered_at: string | null
  created_at: string
  last_error_present: boolean
}

export type NotificationFact = {
  id: string
  priority: 'input' | 'approval' | 'agent_failure' | 'mention' | 'handoff' | 'update'
  kind: string
  title: string
  body: string
  source_type: string
  source_id: string
  read_at: string | null
  created_at: string
  deliveries: NotificationDelivery[]
}

export type NotificationPreference = {
  channels: Array<'in_app' | 'browser' | 'webhook'>
  digest: 'immediate' | 'hourly' | 'daily'
  minimum_priority: NotificationFact['priority']
  muted_kinds: string[]
  webhook_configured: boolean
  revision: number
  updated_at: string | null
}
