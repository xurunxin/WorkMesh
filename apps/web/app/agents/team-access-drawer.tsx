'use client'

import { type FormEvent, type KeyboardEvent as ReactKeyboardEvent, useEffect, useId, useState } from 'react'
import { Button, Sheet } from '@workmesh/ui'
import { CheckCircleIcon, EyeIcon, XCircleIcon } from '@phosphor-icons/react'
import {
  type Agent,
  type AgentTeamAccess,
  agentName,
  formatTime,
} from '../lib/agents'
import type { AgentDetailLocaleCopy, AgentsCopy } from '../lib/i18n'
import { useLocale } from '../lib/i18n'
import { useMediaQuery } from '../lib/use-media-query'

type Team = { id: string; name: string; key: string }
type TeamAccessDrawerCopy = Pick<AgentsCopy,
  | 'teamAccessAndCapabilities'
  | 'requestedLabel'
  | 'definitionApprovedLabel'
  | 'none'
  | 'noTeamsAvailable'
  | 'accessStatusNotGranted'
  | 'accessStatusActive'
  | 'accessStatusRevoked'
  | 'revokedAt'
  | 'teamAccessViewRequested'
  | 'teamAccessViewApproved'
  | 'teamAccessViewLabel'
  | 'teamAccessEmptyRequested'
  | 'teamAccessRequestedChipLabel'
  | 'teamAccessApprovedChipLabel'
  | 'teamAccessNoSelection'
  | 'teamAccessSelectedCount'
  | 'teamAccessToggleHint'
  | 'updateGrant'
  | 'grantAccess'
  | 'revoke'
> & Pick<AgentDetailLocaleCopy, 'closePeek' | 'manageTeamAccess'>

export type TeamAccessDrawerProps = {
  /** Selected agent, or `null` when the drawer should not render. */
  agent: Agent | null
  /** All teams known to the agents page; one card is rendered per team. */
  teams: Team[]
  /** Concatenation `${agent.id}:${team.id}` of the team access mutation in flight, or `''`. */
  busyAccess: string
  /** True when the connected Human can grant or revoke team access. */
  canManage: boolean
  /** Optional i18n override. Falls back to `useLocale().agentsCopy`. */
  copy?: TeamAccessDrawerCopy
  /** Whether the Sheet is open. */
  open: boolean
  /** Called when the user dismisses the Sheet (close button, overlay click, or Escape). */
  onClose: () => void
  /** Called when the user saves a team-grant. The drawer passes the team id + approved capabilities. */
  onGrant: (teamId: string, approvedCapabilities: string[]) => void
  /** Called when the user revokes an active team grant. */
  onRevoke: (teamId: string) => void
}

/**
 * Sheet that renders the team access list for a single agent.
 *
 * The component was extracted from `apps/web/app/agents/page.tsx` so the
 * registry list stays compact (one row per agent) and the per-team access
 * chips move into a focused overlay. The page tracks which agent is
 * selected and toggles `open`; the drawer looks the access up itself from
 * `agent.team_access`.
 */
export function TeamAccessDrawer({ agent, busyAccess, canManage, copy, onClose, onGrant, onRevoke, open, teams }: TeamAccessDrawerProps) {
  const { agentsCopy } = useLocale()
  const text = copy ?? agentsCopy
  const compact = useMediaQuery('(max-width: 720px)')
  // No selection — render nothing (rather than a stale title from a previous agent).
  if (!agent) return null
  return <Sheet
    closeLabel={text.closePeek}
    description={text.teamAccessAndCapabilities}
    onClose={onClose}
    open={open}
    title={agentName(agent)}
  >
    <section className="team-access-drawer" aria-label={text.manageTeamAccess(agentName(agent))}>
      <p><strong>{text.requestedLabel}</strong> {agent.requested_capabilities.join(', ') || text.none}</p>
      <p><strong>{text.definitionApprovedLabel}</strong> {agent.approved_capabilities.join(', ') || text.none}</p>
      {teams.length === 0
        ? <p className="empty">{text.noTeamsAvailable}</p>
        : <div className="team-access-list">{teams.map(team => {
          const access = agent.team_access?.find(candidate => candidate.team_id === team.id) ?? null
          const operation = `${agent.id}:${team.id}`
          return <TeamAccessCard
            access={access}
            agent={agent}
            busy={busyAccess === operation}
            canManage={canManage}
            compact={compact}
            copy={text}
            key={team.id}
            onGrant={next => onGrant(team.id, next)}
            onRevoke={() => onRevoke(team.id)}
            team={team}
          />
        })}</div>
      }
    </section>
  </Sheet>
}

type TeamAccessCardProps = {
  agent: Agent
  team: Team
  access: AgentTeamAccess | null
  canManage: boolean
  busy: boolean
  compact: boolean
  copy?: TeamAccessDrawerCopy
  onGrant: (approvedCapabilities: string[]) => void
  onRevoke: () => void
}

type TeamAccessView = 'requested' | 'approved'

function TeamAccessCard({ access, agent, busy, canManage, compact, copy, onGrant, onRevoke, team }: TeamAccessCardProps) {
  const { agentsCopy } = useLocale()
  const text = copy ?? agentsCopy
  const [view, setView] = useState<TeamAccessView>('approved')
  const viewBaseId = useId()
  const requested = agent.requested_capabilities
  const initialApproved = access?.status === 'active' ? access.approved_capabilities : []
  const [approved, setApproved] = useState<string[]>(initialApproved)
  useEffect(() => { setApproved(initialApproved) }, [initialApproved.join('|')])
  const isActive = access?.status === 'active'
  const status = !access ? text.accessStatusNotGranted : access.status === 'active' ? text.accessStatusActive : text.accessStatusRevoked
  const toggle = (capability: string) => {
    setApproved(current => current.includes(capability) ? current.filter(value => value !== capability) : [...current, capability])
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onGrant(approved)
  }
  const views = [
    { count: requested.length, id: 'requested', label: text.teamAccessViewRequested },
    { count: approved.length, id: 'approved', label: text.teamAccessViewApproved },
  ] as const
  const selectedView = views.find(candidate => candidate.id === view) ?? views[0]
  const moveView = (event: ReactKeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let targetIndex: number | null = null
    if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % views.length
    if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + views.length) % views.length
    if (event.key === 'Home') targetIndex = 0
    if (event.key === 'End') targetIndex = views.length - 1
    if (targetIndex === null) return
    event.preventDefault()
    const target = views[targetIndex]
    if (!target) return
    setView(target.id)
    document.getElementById(`${viewBaseId}-tab-${target.id}`)?.focus()
  }
  const requestedPanel = requested.length === 0
    ? <p className="empty">{text.teamAccessEmptyRequested}</p>
    : requested.map(capability => (
      <span className="chip chip-outline" key={capability}>
        {text.teamAccessRequestedChipLabel(capability)}
      </span>
    ))
  const approvedPanel = requested.length === 0
    ? <p className="empty">{text.teamAccessEmptyRequested}</p>
    : <>
      {requested.map(capability => {
        const isSelected = approved.includes(capability)
        return (
          <button
            aria-pressed={isSelected}
            className={`chip ${isSelected ? 'chip-solid' : 'chip-outline'}`}
            disabled={busy}
            key={capability}
            onClick={() => toggle(capability)}
            type="button"
          >
            {isSelected
              ? <CheckCircleIcon aria-hidden size={12} weight="bold" />
              : null}
            {text.teamAccessApprovedChipLabel(capability)}
          </button>
        )
      })}
      {approved.length === 0 && <p className="empty team-access-hint">{text.teamAccessNoSelection}</p>}
    </>
  const panelFor = (target: TeamAccessView) => target === 'requested' ? requestedPanel : approvedPanel
  return (
    <article className="team-access-card" data-testid={`team-access-${agent.id}-${team.id}`}>
      <header>
        <div>
          <strong>{team.name} <small>({team.key})</small></strong>
          {access?.revoked_at && <small>{text.revokedAt(formatTime(access.revoked_at))}</small>}
        </div>
        <span className={isActive ? 'pill is-active' : 'pill is-inactive'}>{status}</span>
      </header>
      {canManage ? (
        <form className="team-access-form" key={`${access?.revision ?? 0}:${isActive}`} onSubmit={submit}>
          {compact ? <>
            <label className="team-access-toggle-compact">
              <span className="sr-only" id={`${viewBaseId}-compact-label`}>{text.teamAccessViewLabel}: {selectedView.label}</span>
              <select
                aria-label={text.teamAccessViewLabel}
                className="team-access-toggle-select"
                onChange={event => {
                  const next = event.currentTarget.value
                  if (next === 'requested' || next === 'approved') setView(next)
                }}
                value={view}
              >
                {views.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label} ({candidate.count})</option>)}
              </select>
            </label>
            <div aria-labelledby={`${viewBaseId}-compact-label`} className="team-access-chips" id={`${viewBaseId}-panel-${view}`} role="tabpanel">
              {panelFor(view)}
            </div>
          </> : <>
            <div aria-label={text.teamAccessViewLabel} className="team-access-toggle" role="tablist">
              {views.map((candidate, index) => <button
                aria-controls={`${viewBaseId}-panel-${candidate.id}`}
                aria-selected={view === candidate.id}
                className={view === candidate.id ? 'is-selected' : ''}
                id={`${viewBaseId}-tab-${candidate.id}`}
                key={candidate.id}
                onClick={() => setView(candidate.id)}
                onKeyDown={event => moveView(event, index)}
                role="tab"
                tabIndex={view === candidate.id ? 0 : -1}
                type="button"
              >
                {candidate.id === 'requested'
                  ? <EyeIcon aria-hidden size={14} weight="bold" />
                  : <CheckCircleIcon aria-hidden size={14} weight="bold" />}
                {candidate.label}
                <span className="team-access-toggle-count">{candidate.count}</span>
              </button>)}
            </div>
            {views.map(candidate => {
              const active = view === candidate.id
              return <div
                aria-labelledby={`${viewBaseId}-tab-${candidate.id}`}
                className="team-access-chips"
                hidden={!active}
                id={`${viewBaseId}-panel-${candidate.id}`}
                key={candidate.id}
                role="tabpanel"
              >{active ? panelFor(candidate.id) : null}</div>
            })}
          </>}
          <div className="team-access-actions">
            <small className="team-access-meta">{text.teamAccessSelectedCount(approved.length)} · {text.teamAccessToggleHint}</small>
            <div className="team-access-buttons">
              <Button
                disabled={busy || approved.length === 0}
                icon={<CheckCircleIcon aria-hidden size={16} weight="bold" />}
                type="submit"
                variant="primary"
              >
                {isActive ? text.updateGrant : text.grantAccess}
              </Button>
              {isActive && (
                <Button
                  className="danger"
                  disabled={busy}
                  icon={<XCircleIcon aria-hidden size={16} weight="bold" />}
                  onClick={onRevoke}
                  type="button"
                  variant="danger"
                >
                  {text.revoke}
                </Button>
              )}
            </div>
          </div>
        </form>
      ) : (
        <div className="team-access-chips" aria-label={text.teamAccessViewApproved}>
          {(isActive && approved.length > 0
            ? approved
            : requested
          ).map(capability => (
            <span className={isActive && approved.includes(capability) ? 'chip chip-solid' : 'chip chip-outline'} key={capability}>
              {isActive && approved.includes(capability)
                ? text.teamAccessApprovedChipLabel(capability)
                : text.teamAccessRequestedChipLabel(capability)}
            </span>
          ))}
          {!isActive && requested.length === 0 && <p className="empty">{text.teamAccessEmptyRequested}</p>}
        </div>
      )}
    </article>
  )
}
