export type CanonicalObject =
  | { kind: 'project'; id: string }
  | { kind: 'work_item'; id: string; projectId?: string }
  | { kind: 'run'; id: string }
  | { kind: 'plan_version'; id: string; sessionId: string }
  | { kind: 'plan_step'; id: string; sessionId: string; planVersionId?: string }
  | { kind: 'attention'; id: string; projectId?: string; workItemId?: string }
  | { kind: 'thread' | 'message' | 'decision' | 'handoff'; id: string }
  | { kind: 'approval'; id: string }
  | { kind: 'artifact'; id: string; source?: string }
  | { kind: 'lease'; id: string }
  | { kind: 'recovery'; id: string; projectId?: string }
  | { kind: 'graph'; id: string; enabled: boolean }

const root = (params: URLSearchParams): string => `/?${params.toString()}`

export function canonicalObjectHref(target: CanonicalObject): string | undefined {
  const params = new URLSearchParams()
  switch (target.kind) {
    case 'project': params.set('view', 'project'); params.set('projectId', target.id); return root(params)
    case 'work_item': params.set('view', 'issues'); params.set('workItem', target.id); if (target.projectId) params.set('projectId', target.projectId); return root(params)
    case 'run': return `/agent-sessions/${encodeURIComponent(target.id)}`
    case 'plan_version': return `/agent-sessions/${encodeURIComponent(target.sessionId)}?planId=${encodeURIComponent(target.id)}`
    case 'plan_step':
      params.set('stepId', target.id); if (target.planVersionId) params.set('planId', target.planVersionId)
      return `/agent-sessions/${encodeURIComponent(target.sessionId)}?${params}`
    case 'attention':
      params.set('view', 'inbox'); params.set('attentionSelected', target.id)
      if (target.projectId) params.set('attentionProject', target.projectId)
      if (target.workItemId) params.set('attentionWorkItem', target.workItemId)
      return root(params)
    case 'thread': params.set('view', 'inbox'); params.set('threadId', target.id); return root(params)
    case 'message': params.set('view', 'inbox'); params.set('messageId', target.id); return root(params)
    case 'decision': params.set('view', 'inbox'); params.set('decisionId', target.id); return root(params)
    case 'approval': params.set('view', 'inbox'); params.set('attentionSelected', `v1:approval:${target.id}`); return root(params)
    case 'handoff': params.set('view', 'inbox'); params.set('handoffId', target.id); return root(params)
    case 'artifact': params.set('evidenceId', target.id); if (target.source) params.set('evidenceSource', target.source); return root(params)
    case 'lease': params.set('view', 'recovery'); params.set('leaseId', target.id); return root(params)
    case 'recovery':
      params.set('view', 'recovery'); params.set('recoveryLifecycle', 'active'); params.set('recoveryItem', target.id)
      if (target.projectId) params.set('recoveryProject', target.projectId)
      return root(params)
    case 'graph': return target.enabled ? `/?view=graph&graphSubject=${encodeURIComponent(target.id)}` : undefined
  }
}

export function evidenceDrawerHref(currentHref: string, evidenceId?: string, source?: string, anchor?: string): string {
  const url = new URL(currentHref, 'http://workmesh.local')
  if (evidenceId) url.searchParams.set('evidenceId', evidenceId); else url.searchParams.delete('evidenceId')
  if (source) url.searchParams.set('evidenceSource', source); else url.searchParams.delete('evidenceSource')
  if (anchor) url.searchParams.set('evidenceAnchor', anchor); else url.searchParams.delete('evidenceAnchor')
  return `${url.pathname}${url.search}${url.hash}`
}

export function safeExternalHref(value?: string | null): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined
    return url.toString()
  } catch { return undefined }
}
