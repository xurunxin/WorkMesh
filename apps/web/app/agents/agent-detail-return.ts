const returnFocusStateKey = 'workmeshAgentDetailReturnFocus'

type HistoryStateRecord = Record<string, unknown>

type AgentDetailReturnFocus = {
  agentId: string
  detailHref: string
  listUrl: string
}

export type ConsumedAgentDetailReturnFocus = {
  agentId: string | null
  hadMarker: boolean
  nextState: HistoryStateRecord
}

function historyStateRecord(value: unknown): HistoryStateRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as HistoryStateRecord
    : {}
}

function isAgentDetailReturnFocus(value: unknown): value is AgentDetailReturnFocus {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const marker = value as Record<string, unknown>
  return typeof marker.agentId === 'string'
    && marker.agentId.length > 0
    && typeof marker.detailHref === 'string'
    && marker.detailHref === agentDetailHref(marker.agentId)
    && typeof marker.listUrl === 'string'
    && marker.listUrl.length > 0
}

function withoutReturnFocusMarker(state: HistoryStateRecord): HistoryStateRecord {
  const { [returnFocusStateKey]: _discarded, ...rest } = state
  return rest
}

export function agentDetailHref(agentId: string): string {
  return `/agents/${encodeURIComponent(agentId)}`
}

export function rememberAgentDetailReturnFocus(
  currentState: unknown,
  listUrl: string,
  agentId: string,
): HistoryStateRecord {
  return {
    ...historyStateRecord(currentState),
    [returnFocusStateKey]: {
      agentId,
      detailHref: agentDetailHref(agentId),
      listUrl,
    } satisfies AgentDetailReturnFocus,
  }
}

export function consumeAgentDetailReturnFocus(
  currentState: unknown,
  currentListUrl: string,
  visibleAgentIds: readonly string[],
): ConsumedAgentDetailReturnFocus {
  const state = historyStateRecord(currentState)
  if (!(returnFocusStateKey in state)) {
    return { agentId: null, hadMarker: false, nextState: state }
  }

  const marker = state[returnFocusStateKey]
  const nextState = withoutReturnFocusMarker(state)
  if (!isAgentDetailReturnFocus(marker)) {
    return { agentId: null, hadMarker: true, nextState }
  }

  const agentId = marker.listUrl === currentListUrl && visibleAgentIds.includes(marker.agentId)
    ? marker.agentId
    : null
  return { agentId, hadMarker: true, nextState }
}
