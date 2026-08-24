'use client'

import { memo, useCallback, type KeyboardEvent, type MouseEvent } from 'react'
import { Button } from '@workmesh/ui'
import { ArrowRightIcon, EyeIcon, UsersThreeIcon } from '@phosphor-icons/react'
import {
  type Agent,
  agentHeartbeat,
  agentName,
  agentProvider,
  agentVersion,
} from '../lib/agents'
import { type AgentDetailLocaleCopy, type AgentsCopy, useLocale } from '../lib/i18n'
import { listIntent } from '../lib/list-interactions'
import { agentDetailHref } from './agent-detail-return'

type AgentRegistryCardCopy = AgentsCopy & AgentDetailLocaleCopy

export type AgentRegistryCardProps = {
  agent: Agent
  copy?: AgentRegistryCardCopy
  focused: boolean
  linkRef?: (agentId: string, node: HTMLAnchorElement | null) => void
  onFocus: (agentId: string) => void
  onManageTeamAccess: (agentId: string) => void
  onNavigateToDetails?: (agentId: string) => void
  onPeek: (agentId: string) => void
}

export const AgentRegistryCard = memo(function AgentRegistryCard({ agent, copy, focused, linkRef, onFocus, onManageTeamAccess, onNavigateToDetails, onPeek }: AgentRegistryCardProps) {
  const { agentsCopy } = useLocale()
  const text = copy ?? agentsCopy
  const name = agentName(agent)
  const detailHref = agentDetailHref(agent.id)
  const registerLink = useCallback((node: HTMLAnchorElement | null): void => {
    linkRef?.(agent.id, node)
  }, [agent.id, linkRef])
  const rememberReturnTarget = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    onNavigateToDetails?.(agent.id)
  }
  const openPeek = (event: KeyboardEvent<HTMLAnchorElement>): void => {
    if (listIntent(event.nativeEvent) !== 'peek') return
    event.preventDefault()
    onPeek(agent.id)
  }

  return <article
    className="agent-summary-card agent-registry-card"
    data-focused={focused ? 'true' : 'false'}
    data-testid={`agent-registry-${agent.id}`}
    id={`agent-${encodeURIComponent(agent.id)}`}
  >
    <a
      aria-label={text.openAgentDetails(name)}
      className="agent-summary-card-link"
      data-agent-id={agent.id}
      data-agent-roving-link="true"
      href={detailHref}
      onClick={rememberReturnTarget}
      onFocus={() => onFocus(agent.id)}
      onKeyDown={openPeek}
      ref={registerLink}
      tabIndex={focused ? 0 : -1}
    >
      <header>
        <div><h3>{name}</h3><small>{agent.slug} · {agentProvider(agent)} {agentVersion(agent)}</small></div>
        <span className={agent.is_active ? 'registry-active' : 'registry-inactive'}>{agent.is_active ? text.registryStatusActive : text.registryStatusInactive}</span>
      </header>
      <p>{agent.description || text.noRegistryDescription}</p>
      <dl className="agent-key-facts">
        <div><dt>{text.approvedLabel}</dt><dd>{text.capabilitiesLabel(agent.approved_capabilities.length)}</dd></div>
        <div><dt>{text.concurrency}</dt><dd>{agent.max_concurrency}</dd></div>
        <div><dt>{text.heartbeat}</dt><dd>{agentHeartbeat(agent)}s</dd></div>
      </dl>
      <div className="agent-summary-card-affordance">
        <span><EyeIcon aria-hidden size={14} weight="bold" />{text.peekShortcutHint}</span>
        <span>{text.openAgentDetailsLabel}<ArrowRightIcon aria-hidden size={14} weight="bold" /></span>
      </div>
    </a>
    <div className="agent-summary-card-actions">
      <Button
        aria-label={text.manageTeamAccess(name)}
        icon={<UsersThreeIcon aria-hidden size={16} weight="bold" />}
        onClick={() => onManageTeamAccess(agent.id)}
        onFocus={() => onFocus(agent.id)}
        type="button"
        variant="ghost"
      >
        {text.manageTeamAccessLabel}
      </Button>
    </div>
  </article>
})
