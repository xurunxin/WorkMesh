'use client'

import { Sheet } from '@workmesh/ui'
import { type Agent, agentName } from '../lib/agents'
import { type AgentDetailLocaleCopy, type AgentsCopy, useLocale } from '../lib/i18n'
import { AgentDetailPanel } from './agent-detail-panel'

type AgentPeekCopy = AgentsCopy & AgentDetailLocaleCopy

export type AgentPeekProps = {
  agent: Agent | null
  copy?: AgentPeekCopy
  onClose: () => void
  open: boolean
}

export function AgentPeek({ agent, copy, onClose, open }: AgentPeekProps) {
  const { agentsCopy } = useLocale()
  const text = copy ?? agentsCopy
  if (!agent) return null
  return <Sheet
    className="agent-peek"
    closeLabel={text.closePeek}
    description={text.peekDescription}
    onClose={onClose}
    open={open}
    title={text.peekTitle(agentName(agent))}
  >
    <AgentDetailPanel agent={agent} copy={text} loadedTeamAccess={agent.team_access} />
  </Sheet>
}
