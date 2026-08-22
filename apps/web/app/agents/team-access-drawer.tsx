'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { Button, Sheet } from '@workmesh/ui'
import { CheckCircleIcon, EyeIcon, XCircleIcon } from '@phosphor-icons/react'
import {
  type Agent,
  type AgentTeamAccess,
  agentName,
  formatTime,
} from '../lib/agents'
import type { AgentsCopy } from '../lib/i18n'
import { useLocale } from '../lib/i18n'

type Team = { id: string; name: string; key: string }

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
  copy?: AgentsCopy
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
  // No selection — render nothing (rather than a stale title from a previous agent).
  if (!agent) return null
  return <Sheet
    description={text.teamAccessAndCapabilities}
    onClose={onClose}
    open={open}
    title={agentName(agent)}
  >
    <section className="team-access-drawer" aria-label={`${agentName(agent)} team access`}>
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
  copy?: AgentsCopy
  onGrant: (approvedCapabilities: string[]) => void
  onRevoke: () => void
}

function TeamAccessCard({ access, agent, busy, canManage, copy, onGrant, onRevoke, team }: TeamAccessCardProps) {
  const { agentsCopy } = useLocale()
  const text = copy ?? agentsCopy
  const [view, setView] = useState<'requested' | 'approved'>('approved')
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
          <div className="team-access-toggle" role="tablist" aria-label={text.teamAccessViewLabel}>
            <button
              aria-pressed={view === 'requested'}
              className={view === 'requested' ? 'is-selected' : ''}
              onClick={() => setView('requested')}
              type="button"
              role="tab"
            >
              <EyeIcon aria-hidden size={14} weight="bold" />
              {text.teamAccessViewRequested}
              <span className="team-access-toggle-count">{requested.length}</span>
            </button>
            <button
              aria-pressed={view === 'approved'}
              className={view === 'approved' ? 'is-selected' : ''}
              onClick={() => setView('approved')}
              type="button"
              role="tab"
            >
              <CheckCircleIcon aria-hidden size={14} weight="bold" />
              {text.teamAccessViewApproved}
              <span className="team-access-toggle-count">{approved.length}</span>
            </button>
          </div>
          {view === 'requested' ? (
            <div className="team-access-chips" role="tabpanel" aria-label={text.teamAccessViewRequested}>
              {requested.length === 0
                ? <p className="empty">{text.teamAccessEmptyRequested}</p>
                : requested.map(capability => (
                  <span className="chip chip-outline" key={capability}>
                    {text.teamAccessRequestedChipLabel(capability)}
                  </span>
                ))}
            </div>
          ) : (
            <div className="team-access-chips" role="tabpanel" aria-label={text.teamAccessViewApproved}>
              {requested.length === 0
                ? <p className="empty">{text.teamAccessEmptyRequested}</p>
                : (
                  <>
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
                )}
            </div>
          )}
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
