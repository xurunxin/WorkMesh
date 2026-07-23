'use client'

import { use } from 'react'
import { AgentSessionDetail } from '../../agent-session-detail'

export default function AgentSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <main className="session-page"><a href="/agents">← Agent Control Center</a><AgentSessionDetail sessionId={id} /></main>
}
