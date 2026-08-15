'use client'

import { use } from 'react'
import { AppShell } from '@workmesh/ui'
import { AgentSessionDetail } from '../../agent-session-detail'
import { GlobalCommandCenter } from '../../../features/command-center'

export default function AgentSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <AppShell
    headerActions={<GlobalCommandCenter />}
    productName="WorkMesh"
    navigation={[
      { href: '/?view=inbox', label: 'Inbox' },
      { href: '/?view=my-work', label: 'My Work' },
      { href: '/?view=projects', label: 'Projects' },
      { href: '/agents', label: 'Agents', active: true },
    ]}
    utilityNavigation={[{ href: '/settings', label: 'Settings' }]}
    footer={<a className="app-navigation-link" href="/agents">Agent Control Center</a>}
  >
    <section className="session-page"><header className="page-header"><div><p className="eyebrow">Agent execution</p><h1>Session {id.slice(0, 8)}</h1><p>Human-visible control, evidence, plans, and durable execution facts.</p></div><a href="/agents">Back to Agents</a></header><AgentSessionDetail sessionId={id} /></section>
  </AppShell>
}
