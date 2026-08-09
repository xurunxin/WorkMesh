'use client'

import { ApiError, apiRequest, json } from './api'

export type RoomRecord = Record<string, unknown>

export type Room = {
  id: string
  participants: RoomRecord[]
}

export type RoomTimeline = {
  items: RoomRecord[]
  nextCursor: string | null
}

export const value = (record: RoomRecord, ...keys: string[]): unknown => {
  for (const key of keys) if (record[key] !== undefined) return record[key]
  return undefined
}

export const stringValue = (record: RoomRecord, ...keys: string[]): string => {
  const found = value(record, ...keys)
  return typeof found === 'string' ? found : found === undefined || found === null ? '' : String(found)
}

export const arrayValue = (record: RoomRecord, ...keys: string[]): RoomRecord[] => {
  const found = value(record, ...keys)
  return Array.isArray(found) ? found.filter((item): item is RoomRecord => Boolean(item) && typeof item === 'object') : []
}

export const numberValue = (record: RoomRecord, ...keys: string[]): number | undefined => {
  const found = value(record, ...keys)
  const parsed = typeof found === 'number' ? found : Number(found)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Stage 2 routes are optional during a rolling Stage 1 -> Stage 2 upgrade. */
export async function optionalRoomRequest<T>(path: string, init?: RequestInit): Promise<T | null> {
  try { return await apiRequest<T>(path, init) } catch (reason) { if (reason instanceof ApiError && reason.status === 404) return null; throw reason }
}

export async function findWorkItemRoom(workItemId: string): Promise<Room | null> {
  const response = await optionalRoomRequest<unknown>(`/api/v1/rooms?workItemId=${encodeURIComponent(workItemId)}`)
  const record = Array.isArray(response) ? response[0] : response && typeof response === 'object' ? (() => { const source = response as RoomRecord; return arrayValue(source, 'rooms', 'items', 'data')[0] ?? source })() : undefined
  if (!record) return null
  return { id: stringValue(record, 'id'), participants: arrayValue(record, 'participants', 'activeParticipants', 'active_participants') }
}

export function normalizeRoomTimelineItem(item: RoomRecord): RoomRecord {
  const payload = value(item, 'payload', 'structuredPayload', 'structured_payload')
  const details = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as RoomRecord : {}
  const structured = value(details, 'payload', 'structuredPayload', 'structured_payload')
  const structuredDetails = structured && typeof structured === 'object' && !Array.isArray(structured) ? structured as RoomRecord : {}
  const kind = stringValue(item, 'kind', 'type')
  return {
    ...item,
    // Current Stage 2 projection keeps typed-message facts in payload/subtype.
    intent: kind === 'message' ? stringValue(item, 'subtype') : stringValue(item, 'intent', 'kind', 'type', 'subtype'),
    body: stringValue(item, 'body', 'summary') || stringValue(details, 'body', 'summary', 'title', 'rationale'),
    title: stringValue(item, 'title') || stringValue(details, 'title'),
    actorId: stringValue(item, 'actorId', 'actor_id') || stringValue(details, 'authorActorId', 'author_actor_id', 'actorId', 'actor_id'),
    actorName: stringValue(item, 'actorName', 'actor_name') || stringValue(details, 'authorDisplayName', 'author_display_name'),
    sessionId: stringValue(item, 'sessionId', 'session_id') || stringValue(details, 'sessionId', 'session_id', 'fromSessionId', 'from_session_id'),
    createdAt: stringValue(item, 'createdAt', 'created_at', 'occurredAt', 'occurred_at'),
    payload: { ...details, ...structuredDetails },
    status: kind === 'message' ? ((value(details, 'resolvedAt', 'resolved_at') || value(details, 'resolution')) ? 'resolved' : 'open') : stringValue(item, 'status', 'subtype'),
  }
}

export const mergeRoomTimelines = (
  roomTimeline: readonly RoomRecord[],
  legacyTimeline: readonly RoomRecord[],
): RoomRecord[] => {
  const seenIds = new Set<string>()
  return [...roomTimeline, ...legacyTimeline].filter(item => {
    const id = stringValue(item, 'id')
    if (!id) return true
    if (seenIds.has(id)) return false
    seenIds.add(id)
    return true
  })
}

export async function roomTimeline(roomId: string): Promise<RoomTimeline | null> {
  const response = await optionalRoomRequest<unknown>(`/api/v1/rooms/${encodeURIComponent(roomId)}/timeline?limit=100`)
  if (response === null) return null
  if (Array.isArray(response)) return { items: response.filter((item): item is RoomRecord => Boolean(item) && typeof item === 'object').map(normalizeRoomTimelineItem), nextCursor: null }
  const record = response as RoomRecord
  return { items: arrayValue(record, 'items', 'timeline', 'data').map(normalizeRoomTimelineItem), nextCursor: stringValue(record, 'nextCursor', 'next_cursor') || null }
}

export async function createRoomMessage(roomId: string, payload: RoomRecord): Promise<RoomRecord> {
  return apiRequest<RoomRecord>(`/api/v1/rooms/${encodeURIComponent(roomId)}/messages`, { method: 'POST', headers: json({}), body: JSON.stringify(payload) })
}

export async function roomMutation<T>(path: string, body: RoomRecord = {}, revision?: number): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    headers: { ...json({}), ...(revision === undefined ? {} : { 'If-Match': `"revision-${revision}"` }) },
    body: JSON.stringify(body),
  })
}
