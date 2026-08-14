'use client'

import { ApiError, apiListRequest, apiRequest, json } from '../../app/lib/api'
import { PRIORITIES, STATUS_CATEGORIES, WORK_SURFACE_LAYOUTS, type SavedViewController, type SavedViewPreference, type WorkSurfaceLayout, type WorkSurfaceQuery } from './contracts'

const own = (value: unknown, key: string): unknown => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
const optionalText = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined

function sanitizeFilters(value: unknown): WorkSurfaceQuery {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const filters: WorkSurfaceQuery = {}
  const search = optionalText(input.search); if (search) filters.search = search
  const statusId = optionalText(input.statusId ?? input.status_id); if (statusId) filters.statusId = statusId
  const priority = optionalText(input.priority); if (priority && (PRIORITIES as readonly string[]).includes(priority)) filters.priority = priority as WorkSurfaceQuery['priority']
  const responsible = optionalText(input.responsibleHumanActorId ?? input.responsible_human_actor_id ?? input.ownerId ?? input.owner_id); if (responsible) filters.responsibleHumanActorId = responsible
  const projectId = optionalText(input.projectId ?? input.project_id); if (projectId) filters.projectId = projectId
  const label = optionalText(input.label); if (label) filters.label = label
  const statusCategory = optionalText(input.statusCategory ?? input.status_category); if (statusCategory && (STATUS_CATEGORIES as readonly string[]).includes(statusCategory)) filters.statusCategory = statusCategory as WorkSurfaceQuery['statusCategory']
  if (input.mine === true) filters.mine = true
  return filters
}

/** Strip result rows, cursors, authority and credentials before a preference reaches state. */
export function sanitizeSavedViewPreference(value: unknown): SavedViewPreference | null {
  const name = optionalText(own(value, 'name'))
  if (!name) return null
  const rawLayout = optionalText(own(value, 'layout'))
  const layout: WorkSurfaceLayout = rawLayout && (WORK_SURFACE_LAYOUTS as readonly string[]).includes(rawLayout) ? rawLayout as WorkSurfaceLayout : 'list'
  const teamId = optionalText(own(value, 'teamId') ?? own(value, 'team_id')) ?? null
  return { id: optionalText(own(value, 'id')), name, teamId, filters: sanitizeFilters(own(value, 'filters')), layout }
}

function preferencePayload(preference: SavedViewPreference): Record<string, unknown> {
  const sanitized = sanitizeSavedViewPreference(preference)
  if (!sanitized) throw new Error('A saved view needs a name.')
  return { name: sanitized.name, teamId: sanitized.teamId, filters: sanitized.filters, layout: sanitized.layout }
}

export type SavedViewApi = {
  list?: (path: string) => Promise<unknown>
  create?: (path: string, init: RequestInit) => Promise<unknown>
}

export function createSavedViewController(api: SavedViewApi = {}): SavedViewController {
  const listRequest = api.list ?? (path => apiListRequest<unknown>(path))
  const createRequest = api.create ?? ((path, init) => apiRequest<unknown>(path, init))
  return {
    sanitize: sanitizeSavedViewPreference,
    list: async (teamId?: string) => {
      const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : ''
      try {
        const response = await listRequest(`/api/v1/views${query}`)
        const rows = Array.isArray(response) ? response : (response && typeof response === 'object' && Array.isArray((response as { items?: unknown }).items) ? (response as { items: unknown[] }).items : [])
        return rows.map(sanitizeSavedViewPreference).filter((view): view is SavedViewPreference => Boolean(view))
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 403) throw reason
        throw reason
      }
    },
    create: async preference => {
      const response = await createRequest('/api/v1/views', { method: 'POST', headers: { ...json(preferencePayload(preference)) }, body: JSON.stringify(preferencePayload(preference)) })
      return sanitizeSavedViewPreference(response) ?? preference
    },
  }
}

export const savedViewController = createSavedViewController()

