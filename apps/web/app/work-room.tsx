'use client'

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest, json } from './lib/api'
import { type AgentSession, agentStateClass, agentStateLabel, canStopAgentSession, formatTime, optionalAgentRequest } from './lib/agents'
import { type Room, type RoomRecord, arrayValue, createRoomMessage, findWorkItemRoom, numberValue, optionalRoomRequest, roomMutation, roomTimeline, stringValue, value } from './lib/room'

type Tab = 'conversation' | 'plan' | 'activity' | 'artifacts' | 'decisions' | 'sessions'
type LegacyComment = { id: string; body: string; revision: number; parent_comment_id: string | null; reply_to_comment_id: string | null; author_name: string; is_resolved: boolean; created_at: string; mentions: string[] }
type LegacyHuman = { id: string; display_name: string }
type Props = { workItemId: string; legacyComments: LegacyComment[]; legacyHumans: LegacyHuman[]; onLegacyComment: (event: FormEvent<HTMLFormElement>, parentCommentId?: string) => Promise<void>; onLegacyUpdate: (comment: LegacyComment, patch: Record<string, string | boolean>) => Promise<void> }

const tabs: { id: Tab; label: string }[] = [
  { id: 'conversation', label: 'Conversation' }, { id: 'plan', label: 'Plan' }, { id: 'activity', label: 'Activity' },
  { id: 'artifacts', label: 'Artifacts' }, { id: 'decisions', label: 'Decisions' }, { id: 'sessions', label: 'Sessions' },
]
const messageIcon: Record<string, string> = {
  inform: '●', comment: '●', ask: '?', answer: '↳', propose: '◇', decide: '◆', decision: '◆',
  claim: '⌁', handoff: '⇄', blocker: '!', review_request: '✓', review_result: '✓', status: '◷',
}
const titleCase = (value: string): string => value.replaceAll('_', ' ') || 'message'
const itemKind = (item: RoomRecord): string => stringValue(item, 'intent', 'messageIntent', 'message_intent', 'kind', 'type') || 'comment'
const itemBody = (item: RoomRecord): string => stringValue(item, 'body', 'bodyMarkdown', 'body_markdown', 'summary', 'text')
const itemActor = (item: RoomRecord): string => stringValue(item, 'actorName', 'actor_name', 'authorName', 'author_name', 'senderName', 'sender_name', 'actorId', 'actor_id') || 'Unknown actor'
const itemTime = (item: RoomRecord): string => stringValue(item, 'createdAt', 'created_at', 'timestamp')
const itemPayload = (item: RoomRecord): RoomRecord => (value(item, 'payload', 'structuredPayload', 'structured_payload') as RoomRecord | undefined) ?? {}
const textList = (record: RoomRecord, ...keys: string[]): string[] => {
  const found = value(record, ...keys)
  if (!Array.isArray(found)) return []
  return found.map(item => typeof item === 'string' ? item : item && typeof item === 'object' ? stringValue(item as RoomRecord, 'label', 'title', 'value', 'summary', 'impact', 'id') : String(item)).filter(Boolean)
}

function AgentMessageControls({ sessionId, revision }: { sessionId: string; revision?: number }) {
  const control = async (signal: 'pause' | 'stop') => {
    await apiRequest(`/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/signals`, { method: 'POST', headers: { ...json({}), ...(revision === undefined ? {} : { 'If-Match': `"revision-${revision}"` }) }, body: JSON.stringify({ signal, reason: `Human ${signal === 'pause' ? 'interrupted' : 'stopped'} agent-to-agent communication from the Work Room.` }) })
  }
  const prompt = async () => {
    const body = window.prompt('Prompt this agent')?.trim(); if (!body) return
    await apiRequest(`/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/prompt`, { method: 'POST', headers: { ...json({}), ...(revision === undefined ? {} : { 'If-Match': `"revision-${revision}"` }) }, body: JSON.stringify({ bodyMarkdown: body }) })
  }
  return <span className="message-session-controls"><a href={`/agent-sessions/${encodeURIComponent(sessionId)}`}>View session</a><button type="button" onClick={() => void prompt()}>Prompt</button><button type="button" onClick={() => void control('pause')}>Pause</button><button className="danger" type="button" onClick={() => void control('stop')}>Stop</button></span>
}

function TimelineCard({ item, onResolve }: { item: RoomRecord; onResolve: (item: RoomRecord) => void }) {
  const intent = itemKind(item); const payload = itemPayload(item); const status = stringValue(item, 'status', 'responseStatus', 'response_status')
  const sessionId = stringValue(item, 'sessionId', 'session_id'); const step = stringValue(item, 'planStepTitle', 'plan_step_title', 'stepTitle', 'step_title') || stringValue(payload, 'planStepTitle', 'plan_step_title', 'stepTitle', 'step_title')
  const context = arrayValue(payload, 'additions', 'contextDeltas', 'context_deltas', 'sources').concat(arrayValue(item, 'contextDeltas', 'context_deltas'))
  return <article className={`room-card intent-${intent}`} data-testid={`timeline-${stringValue(item, 'id')}`}>
    <header><span className="intent-icon" aria-label={`${titleCase(intent)} intent`}>{messageIcon[intent] ?? '●'}</span><strong>{itemActor(item)}</strong><span className="intent-badge">{titleCase(intent)}</span>{sessionId && <span className="agent-state">session {sessionId.slice(0, 8)}</span>}{step && <span className="plan-step">{step}</span>}<time>{formatTime(itemTime(item))}</time></header>
    <p>{itemBody(item) || 'No message body was recorded.'}</p>
    {sessionId && <AgentMessageControls sessionId={sessionId} revision={numberValue(itemPayload(item), 'sessionRevision', 'session_revision')} />}
    {intent === 'context_delta' && <p>Base snapshot: {stringValue(payload, 'baseSnapshotId', 'base_snapshot_id') || 'not reported'} · New snapshot: {stringValue(payload, 'sourceSnapshotId', 'source_snapshot_id') || 'not reported'} · Delta hash: {stringValue(payload, 'contentHash', 'content_hash') || 'not reported'} · Added by: {stringValue(payload, 'createdByActorId', 'created_by_actor_id') || 'not reported'}</p>}
    {context.length > 0 && <section className="context-delta" aria-label="Context delta"><strong>Context delta</strong>{context.map((source, index) => <span key={`${stringValue(source, 'hash', 'checksum')}:${index}`}>Added {stringValue(source, 'source', 'uri', 'title', 'sourceType', 'source_type', 'sourceId', 'source_id') || 'source'} · {stringValue(source, 'hash', 'checksum') || 'hash not reported'}</span>)}</section>}
    {status === 'open' && <button type="button" onClick={() => onResolve(item)}>Resolve request</button>}
  </article>
}

function SessionTree({ sessions, roomId, onError, reload }: { sessions: AgentSession[]; roomId: string | null; onError: (message: string) => void; reload: () => Promise<void> }) {
  const byParent = useMemo(() => sessions.reduce<Record<string, AgentSession[]>>((all, session) => {
    const parent = stringValue(session as unknown as RoomRecord, 'parent_session_id', 'parentSessionId') || 'root'; (all[parent] ??= []).push(session); return all
  }, {}), [sessions])
  const signal = async (session: AgentSession, signalName: 'pause' | 'stop') => {
    try {
      await apiRequest(`/api/v1/agent-sessions/${session.id}/signals`, { method: 'POST', headers: { ...json({}), 'If-Match': `"revision-${session.revision}"` }, body: JSON.stringify({ signal: signalName, reason: `Human ${signalName === 'pause' ? 'interrupted agent-to-agent communication' : 'stopped the session'} from the Work Room.` }) })
      if (roomId && signalName === 'pause') await createRoomMessage(roomId, { intent: 'blocker', body: `Human interrupted session ${session.id.slice(0, 8)}.`, payload: { sessionId: session.id, action: 'interrupt' } })
      await reload()
    } catch (reason) { onError(reason instanceof Error ? reason.message : 'Unable to control this agent session.') }
  }
  const branch = (parent: string): ReactNode => <ul className="session-tree">{(byParent[parent] ?? []).map(session => <li key={session.id} data-testid={`session-tree-${session.id}`}><div><span className={agentStateClass(session.state)}>{agentStateLabel(session.state)}</span><strong>{session.id.slice(0, 8)}</strong><span>{session.current_plan_version_id ? 'Plan attached' : 'No plan'}</span><span>Heartbeat: {formatTime(session.last_heartbeat_at)}</span><span>Budget: {session.budget.maxRuntimeSeconds ? `${session.budget.maxRuntimeSeconds}s` : 'policy default'}</span><button type="button" onClick={() => void signal(session, 'pause')}>Interrupt</button><button className="danger" type="button" disabled={!canStopAgentSession(session.state)} onClick={() => void signal(session, 'stop')}>Stop</button></div>{branch(session.id)}</li>)}</ul>
  return <section className="session-tree-panel" aria-label="Session tree"><h3>Session tree</h3>{sessions.length === 0 ? <p className="empty">No agent session is attached to this work item.</p> : branch('root')}</section>
}

function LeaseCard({ lease, onForceRelease, onRefresh }: { lease: RoomRecord; onForceRelease: (lease: RoomRecord) => void; onRefresh: () => void }) {
  const holder = stringValue(lease, 'holderName', 'holder_name', 'holderActorId', 'holder_actor_id') || 'Unknown holder'
  const resource = stringValue(lease, 'resourceId', 'resource_id', 'resourceType', 'resource_type') || 'Resource not reported'
  const conflict = stringValue(lease, 'status', 'errorCode', 'error_code') === 'conflict' || stringValue(lease, 'errorCode', 'error_code') === 'LEASE_CONFLICT'
  return <article className={`room-card lease-card${conflict ? ' lease-conflict' : ''}`} data-testid={`lease-${stringValue(lease, 'id')}`}><header><strong>{conflict ? 'Lease conflict' : 'Lease'}</strong><span className="intent-badge">{resource}</span></header><p>Holder agent: {holder} · Session: {stringValue(lease, 'holderSessionId', 'holder_session_id') || 'not reported'}</p><p>Plan step: {stringValue(lease, 'planStepId', 'plan_step_id', 'stepId', 'step_id') || 'not reported'} · Expires: {formatTime(stringValue(lease, 'expiresAt', 'expires_at'))}</p>{conflict && <p className="error">This resource is currently held by another active session. Refresh to retry the claim after expiry.</p>}<div className="session-actions"><button type="button" onClick={onRefresh}>Refresh / retry</button><button className="danger" type="button" onClick={() => onForceRelease(lease)}>Force release</button></div></article>
}

type HandoffAction = 'request' | 'accept' | 'reject' | 'cancel' | 'complete'
function HandoffCard({ handoff, onAction }: { handoff: RoomRecord; onAction: (handoff: RoomRecord, action: HandoffAction) => void }) {
  const status = stringValue(handoff, 'status') || 'requested'
  const routingValue = value(handoff, 'routingSnapshot', 'routing_snapshot')
  const routing = routingValue && typeof routingValue === 'object' && !Array.isArray(routingValue) ? routingValue as RoomRecord : {}
  const sections: Array<[string, string[]]> = [
    ['Completed work', textList(handoff, 'completedWork', 'completed_work')],
    ['Remaining work', textList(handoff, 'remainingWork', 'remaining_work')],
    ['Open questions', textList(handoff, 'openQuestions', 'open_questions')],
    ['Risks', textList(handoff, 'risks')],
    ['Acceptance criteria', textList(handoff, 'acceptanceCriteria', 'acceptance_criteria')],
  ]
  return <article className="room-card handoff-card" data-testid={`handoff-${stringValue(handoff, 'id')}`}><header><strong>Handoff</strong><span className="intent-badge">{status}</span></header><p>{stringValue(handoff, 'summary') || 'No handoff summary reported.'}</p><p>Requested action: {stringValue(handoff, 'requestedAction', 'requested_action') || 'not reported'}</p><p>To: {stringValue(handoff, 'toAgentName', 'to_agent_name', 'targetSkill', 'target_skill', 'targetAgentId', 'target_agent_id') || 'not reported'} · Scope: {stringValue(handoff, 'scopeType', 'scope_type') || 'not reported'} {stringValue(handoff, 'scopeId', 'scope_id')}</p><p>Context snapshot: {stringValue(handoff, 'contextSnapshotId', 'context_snapshot_id') || 'not reported'} · Artifacts: {textList(handoff, 'artifactIds', 'artifact_ids').join(', ') || 'none'} · Lease policy: {stringValue(handoff, 'leaseTransferPolicy', 'lease_transfer_policy') || 'retain'}</p>{Object.keys(routing).length > 0 && <p>Routing: selected {stringValue(routing, 'selectedAgentId', 'selected_agent_id') || 'none'} from {textList(routing, 'candidateIds', 'candidate_ids').length || 0} eligible candidates.</p>}{stringValue(handoff, 'machineRejectReason', 'machine_reject_reason') && <p>Rejection reason: {stringValue(handoff, 'machineRejectReason', 'machine_reject_reason')}</p>}{sections.map(([label, entries]) => entries.length > 0 && <section key={label}><strong>{label}</strong><ul>{entries.map((entry, index) => <li key={`${label}-${index}`}>{entry}</li>)}</ul></section>)}<div className="session-actions">{status === 'draft' && <button onClick={() => onAction(handoff, 'request')}>Request handoff</button>}{status === 'requested' && <><button onClick={() => onAction(handoff, 'accept')}>Accept</button><button className="danger" onClick={() => onAction(handoff, 'reject')}>Reject</button></>}{['draft', 'requested'].includes(status) && <button className="danger" onClick={() => onAction(handoff, 'cancel')}>Cancel</button>}{status === 'accepted' && <button onClick={() => onAction(handoff, 'complete')}>Complete handoff</button>}</div></article>
}

function DecisionCard({ decision, onAction }: { decision: RoomRecord; onAction: (decision: RoomRecord, action: 'finalize' | 'supersede' | 'reverse') => void }) {
  const final = ['final', 'finalized', 'accepted'].includes(stringValue(decision, 'status')) || Boolean(value(decision, 'finalizedByActorId', 'finalized_by_actor_id'))
  const options = textList(decision, 'options'); const affected = arrayValue(decision, 'affectedResources', 'affected_resources'); const relations = arrayValue(decision, 'relations')
  return <article className="room-card decision-card" data-testid={`decision-${stringValue(decision, 'id')}`}><header><strong>Decision</strong><span className={final ? 'decision-final' : 'decision-proposal'}>{final ? 'Human final' : 'Agent proposal'}</span></header><p>{stringValue(decision, 'question', 'title', 'summary') || 'No question recorded.'}</p><p>Decision: {stringValue(decision, 'selectedOption', 'selected_option') || 'not selected'} · Rationale: {stringValue(decision, 'rationale') || 'not reported'}</p><p>Proposed by: {stringValue(decision, 'proposedByActorId', 'proposed_by_actor_id', 'actorId', 'actor_id') || 'agent not reported'} · Finalized by: {stringValue(decision, 'finalizedByActorId', 'finalized_by_actor_id') || 'not finalized'}</p>{options.length > 0 && <ul>{options.map((option, index) => <li key={index}>{option}</li>)}</ul>}{affected.length > 0 && <p>Affected resources: {affected.map(resource => `${stringValue(resource, 'resourceType', 'resource_type')}:${stringValue(resource, 'resourceId', 'resource_id')} (${stringValue(resource, 'impact')})`).join(', ')}</p>}{relations.length > 0 && <p>Decision lineage: {relations.map(relation => `${stringValue(relation, 'kind')} ${stringValue(relation, 'relatedDecisionId', 'related_decision_id')}`).join(', ')}</p>}<div className="session-actions">{!final && <button onClick={() => onAction(decision, 'finalize')}>Finalize as human</button>}{final && <><button onClick={() => onAction(decision, 'supersede')}>Supersede</button><button className="danger" onClick={() => onAction(decision, 'reverse')}>Reverse</button></>}</div></article>
}

export function WorkRoom({ workItemId, legacyComments, legacyHumans, onLegacyComment, onLegacyUpdate }: Props) {
  const [tab, setTab] = useState<Tab>('conversation'); const [room, setRoom] = useState<Room | null>(null); const [timeline, setTimeline] = useState<RoomRecord[]>([])
  const [sessions, setSessions] = useState<AgentSession[]>([]); const [leases, setLeases] = useState<RoomRecord[]>([]); const [handoffs, setHandoffs] = useState<RoomRecord[]>([]); const [decisions, setDecisions] = useState<RoomRecord[]>([])
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [activitySessionId, setActivitySessionId] = useState(''); const [showHeartbeats, setShowHeartbeats] = useState(false)
  const load = useCallback(async () => {
    try {
      setError('')
      const nextRoom = await findWorkItemRoom(workItemId); setRoom(nextRoom)
      const [nextTimeline, nextSessions, nextHandoffs] = await Promise.all([
        nextRoom ? roomTimeline(nextRoom.id) : Promise.resolve(null), optionalAgentRequest<AgentSession[]>(`/api/v1/agent-sessions?workItemId=${encodeURIComponent(workItemId)}`),
        optionalRoomRequest<unknown>('/api/v1/handoffs'),
      ])
      setTimeline(nextTimeline?.items ?? []); setSessions(nextSessions ?? [])
      const asRecords = (input: unknown): RoomRecord[] => Array.isArray(input) ? input.filter((item): item is RoomRecord => Boolean(item) && typeof item === 'object') : input && typeof input === 'object' ? arrayValue(input as RoomRecord, 'items', 'data', 'leases', 'handoffs', 'decisions') : []
      const sessionIds = new Set((nextSessions ?? []).map(session => session.id))
      const leaseGroups = await Promise.all((nextSessions ?? []).map(session => optionalRoomRequest<unknown>(`/api/v1/leases?sessionId=${encodeURIComponent(session.id)}`)))
      const uniqueLeases = new Map<string, RoomRecord>(); for (const lease of leaseGroups.flatMap(asRecords)) uniqueLeases.set(stringValue(lease, 'id'), lease)
      setLeases([...uniqueLeases.values()]); setHandoffs(asRecords(nextHandoffs).filter(handoff => !stringValue(handoff, 'fromSessionId', 'from_session_id') || sessionIds.has(stringValue(handoff, 'fromSessionId', 'from_session_id'))))
      const timelineDecisions = (nextTimeline?.items ?? []).filter(item => itemKind(item) === 'decision')
      const decisionDetails = await Promise.all(timelineDecisions.map(decision => optionalRoomRequest<unknown>(`/api/v1/decisions/${encodeURIComponent(stringValue(decision, 'id'))}`)))
      setDecisions(timelineDecisions.map((decision, index) => decisionDetails[index] && typeof decisionDetails[index] === 'object' ? { ...decision, ...(decisionDetails[index] as RoomRecord) } : decision))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load the Work Room.') }
  }, [workItemId])
  useEffect(() => { void load() }, [load])
  const legacyTimeline = legacyComments.map(comment => ({ id: `comment-${comment.id}`, type: 'comment', intent: 'comment', body: comment.body, author_name: comment.author_name, created_at: comment.created_at, status: comment.is_resolved ? 'resolved' : 'open' }))
  const visibleTimeline = timeline.length ? timeline : legacyTimeline
  const participants = room?.participants.length ? room.participants : sessions.map(session => ({ id: session.agent_actor_id, name: session.agent_id, sessionId: session.id, state: session.state }))
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const intent = String(form.get('intent') ?? 'comment'); const body = String(form.get('body') ?? '').trim(); if (!body) return
    if (!room) { await onLegacyComment(event); return }
    try { setBusy(true); await createRoomMessage(room.id, { intent, body, requiresResponse: ['ask', 'review_request', 'blocker'].includes(intent) }); event.currentTarget.reset(); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to send message.') } finally { setBusy(false) }
  }
  const resolve = async (message: RoomRecord) => { try { setBusy(true); await roomMutation(`/api/v1/messages/${encodeURIComponent(stringValue(message, 'id'))}/resolve`); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to resolve the message.') } finally { setBusy(false) } }
  const forceRelease = async (lease: RoomRecord) => { if (!window.confirm('Force release this lease? This may interrupt another agent session.')) return; try { setBusy(true); await roomMutation(`/api/v1/leases/${encodeURIComponent(stringValue(lease, 'id'))}/force-release`, { reason: 'Human force released from Work Room.' }, numberValue(lease, 'revision')); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to force release lease.') } finally { setBusy(false) } }
  const handoffAction = async (handoff: RoomRecord, action: HandoffAction) => { try { setBusy(true); const body = action === 'accept' ? {} : { reason: `Human ${action} action from Work Room.` }; await roomMutation(`/api/v1/handoffs/${encodeURIComponent(stringValue(handoff, 'id'))}/${action}`, body, numberValue(handoff, 'revision')); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update handoff.') } finally { setBusy(false) } }
  const decisionAction = async (decision: RoomRecord, action: 'finalize' | 'supersede' | 'reverse') => { try { setBusy(true); await roomMutation(`/api/v1/decisions/${encodeURIComponent(stringValue(decision, 'id'))}/${action}`, action === 'supersede' ? { reason: 'Human superseded this decision from the Work Room.' } : {}, numberValue(decision, 'revision')); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update decision.') } finally { setBusy(false) } }
  const activityItems = timeline.filter(item => {
    const kind = itemKind(item); const sessionId = stringValue(item, 'sessionId', 'session_id')
    return (showHeartbeats || kind !== 'heartbeat') && (!activitySessionId || sessionId === activitySessionId) && !['comment', 'ask', 'answer', 'review_request'].includes(kind)
  })
  const planItems = timeline.filter(item => ['plan', 'plan_step', 'assignment', 'claim', 'step_comment'].includes(itemKind(item)))
  const artifactItems = timeline.filter(item => ['artifact', 'artifact_published', 'context_delta'].includes(itemKind(item)) || arrayValue(itemPayload(item), 'additions', 'contextDeltas', 'context_deltas', 'sources').length > 0 || arrayValue(item, 'contextDeltas', 'context_deltas').length > 0)
  return <section className="work-room" aria-label="Work Room" data-testid="work-room"><header><div><h3>Work Room</h3><p>Durable, human-visible collaboration state. Agent-to-agent messages are never hidden.</p></div><button disabled={busy} onClick={() => void load()}>Refresh</button></header>{error && <p className="error" role="alert">{error}</p>}
    <div className="participant-strip" aria-label="Active participants"><strong>Active participants</strong>{participants.length === 0 ? <span>None reported</span> : participants.map((participant, index) => <span key={stringValue(participant, 'id', 'actorId', 'actor_id') || index} className="participant">{stringValue(participant, 'displayName', 'display_name', 'name', 'actorId', 'actor_id') || 'Unknown'} {stringValue(participant, 'state') && `· ${stringValue(participant, 'state')}`}</span>)}</div>
    <div role="tablist" aria-label="Work Room tabs">{tabs.map(item => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'selected' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    {tab === 'conversation' && <section>
      {room && <form className="room-message-form" onSubmit={event => void send(event)}><label>Message intent<select name="intent" defaultValue="inform"><option value="inform">Comment</option><option value="ask">Ask</option><option value="answer">Answer</option><option value="review_request">Review request</option><option value="blocker">Blocker</option><option value="handoff">Handoff</option></select></label><label>Message<textarea name="body" placeholder="Write a human-visible collaboration message" required /></label><button disabled={busy}>Send typed message</button></form>}
      <form className="legacy-comment-form" onSubmit={event => void onLegacyComment(event)}><label>Work item comment<textarea name="body" placeholder="Write a comment" required /></label><label className="mentions">Mention people<select name="mentions" multiple aria-label="Mention people">{legacyHumans.map(human => <option key={human.id} value={human.id}>{human.display_name}</option>)}</select></label><button data-testid="create-comment">Post comment</button></form>
      {!room && <p className="empty">The Work Room API is unavailable on this server; showing the REST v1 compatible Work Item comments fallback.</p>}
      <div className="combined-timeline" aria-label="Combined timeline">{visibleTimeline.length === 0 ? <p className="empty">No human or agent messages yet.</p> : visibleTimeline.map(item => <TimelineCard key={stringValue(item, 'id')} item={item} onResolve={message => void resolve(message)} />)}</div>
      {legacyComments.length > 0 && <section className="legacy-comment-controls" aria-label="Legacy comment controls">{legacyComments.map(comment => {
        const mentioned = legacyHumans.filter(human => comment.mentions.includes(human.id)).map(human => `@${human.display_name}`)
        return <article className="room-card" key={comment.id}><header><strong>{comment.author_name}</strong><span>{comment.is_resolved ? 'Resolved' : 'Open'}</span></header><p>{comment.body}</p>{mentioned.length > 0 && <p>Mentioned: {mentioned.join(', ')}</p>}<div className="session-actions"><button type="button" onClick={() => { const body = window.prompt('Edit comment', comment.body); if (body?.trim()) void onLegacyUpdate(comment, { body: body.trim() }) }}>Edit</button><button type="button" onClick={() => void onLegacyUpdate(comment, { isResolved: !comment.is_resolved })}>{comment.is_resolved ? 'Reopen' : 'Resolve'}</button><button className="danger" type="button" onClick={() => { if (window.confirm('Soft-delete this comment?')) void onLegacyUpdate(comment, { deleted: true }) }}>Delete</button></div><form className="reply-form" onSubmit={event => void onLegacyComment(event, comment.parent_comment_id ?? comment.id)}><textarea name="body" placeholder="Reply" required /><button>Reply</button></form></article>
      })}</section>}
    </section>}
    {tab === 'plan' && <section className="combined-timeline" aria-label="Plan ownership and dependencies">{planItems.length === 0 ? <p className="empty">No published plan-step assignments or claims yet.</p> : planItems.map(item => { const payload = itemPayload(item); return <article className="room-card" key={stringValue(item, 'id')}><header><strong>{stringValue(payload, 'title', 'stepTitle', 'step_title') || itemBody(item) || 'Plan step'}</strong><span className="plan-step">{stringValue(payload, 'status') || itemKind(item)}</span></header><p>Owner: {stringValue(payload, 'ownerName', 'owner_name', 'ownerActorId', 'owner_actor_id') || 'unassigned'} · Dependencies: {arrayValue(payload, 'dependsOn', 'depends_on').map(value => stringValue(value, 'id', 'title')).filter(Boolean).join(', ') || 'none'}</p><p>Required: {stringValue(payload, 'required', 'requiredApproval', 'required_approval') || 'not reported'} · Assignment: {stringValue(payload, 'assignmentId', 'assignment_id') || 'not reported'} · Claim: {stringValue(payload, 'leaseId', 'lease_id') || 'not claimed'}</p>{stringValue(payload, 'comment', 'stepComment', 'step_comment') && <p>Step comment: {stringValue(payload, 'comment', 'stepComment', 'step_comment')}</p>}</article>})}<SessionTree sessions={sessions} roomId={room?.id ?? null} onError={setError} reload={load} /></section>}
    {tab === 'activity' && <section className="combined-timeline" aria-label="Collaboration activity"><div className="activity-filters"><label>Session<select value={activitySessionId} onChange={event => setActivitySessionId(event.currentTarget.value)}><option value="">All sessions</option>{sessions.map(session => <option key={session.id} value={session.id}>{session.id.slice(0, 8)}</option>)}</select></label><label className="heartbeat-toggle"><input type="checkbox" checked={showHeartbeats} onChange={event => setShowHeartbeats(event.currentTarget.checked)} /> Show heartbeats</label></div>{activityItems.map(item => <TimelineCard key={stringValue(item, 'id')} item={item} onResolve={message => void resolve(message)} />)}{activityItems.length === 0 && <p className="empty">No matching activity. Heartbeats are collapsed by default.</p>}{leases.map(lease => <LeaseCard key={stringValue(lease, 'id')} lease={lease} onForceRelease={lease => void forceRelease(lease)} onRefresh={() => void load()} />)}</section>}
    {tab === 'artifacts' && <section className="combined-timeline" aria-label="Artifacts and context deltas">{artifactItems.map(item => <TimelineCard key={stringValue(item, 'id')} item={item} onResolve={message => void resolve(message)} />)}{artifactItems.length === 0 && <p className="empty">No artifacts or context deltas recorded yet.</p>}<p className="empty">Artifacts are attributed to the session and plan-step badges; context changes retain their source and content hash.</p></section>}
    {tab === 'decisions' && <section className="decision-list">{decisions.length === 0 ? <p className="empty">No decisions recorded yet.</p> : decisions.map(decision => <DecisionCard key={stringValue(decision, 'id')} decision={decision} onAction={(item, action) => void decisionAction(item, action)} />)}{handoffs.map(handoff => <HandoffCard key={stringValue(handoff, 'id')} handoff={handoff} onAction={(item, action) => void handoffAction(item, action)} />)}</section>}
    {tab === 'sessions' && <section><SessionTree sessions={sessions} roomId={room?.id ?? null} onError={setError} reload={load} /><section className="lease-list">{leases.length === 0 ? <p className="empty">No active or conflicting leases.</p> : leases.map(lease => <LeaseCard key={stringValue(lease, 'id')} lease={lease} onForceRelease={item => void forceRelease(item)} onRefresh={() => void load()} />)}</section></section>}
  </section>
}

type InboxItem = RoomRecord
export function InboxPanel() {
  const [items, setItems] = useState<InboxItem[]>([]); const [error, setError] = useState(''); const [status, setStatus] = useState('open')
  const load = useCallback(async () => { try { setError(''); const response = await optionalRoomRequest<unknown>(`/api/v1/inbox?status=${encodeURIComponent(status)}`); setItems(Array.isArray(response) ? response.filter((item): item is InboxItem => Boolean(item) && typeof item === 'object') : response && typeof response === 'object' ? arrayValue(response as RoomRecord, 'items', 'data') : []) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load inbox.') } }, [status])
  useEffect(() => { void load() }, [load])
  return <section className="inbox-panel" data-testid="stage2-inbox"><header><div><h3>Inbox</h3><p>Requests that require a human response or review.</p></div><label>Status<select value={status} onChange={event => setStatus(event.currentTarget.value)}><option value="open">Open</option><option value="resolved">Resolved</option></select></label></header>{error && <p className="error" role="alert">{error}</p>}{items.length === 0 ? <p className="empty">No open asks, review requests, blockers, or handoffs.</p> : items.map(item => <article className="room-card" key={stringValue(item, 'id')}><header><span className="intent-icon">{messageIcon[itemKind(item)] ?? '●'}</span><strong>{titleCase(itemKind(item))}</strong><span>{itemActor(item)}</span></header><p>{itemBody(item)}</p>{stringValue(item, 'workItemId', 'work_item_id') && <a href={`/?workItemId=${encodeURIComponent(stringValue(item, 'workItemId', 'work_item_id'))}`}>Open Work Room</a>}</article>)}</section>
}
