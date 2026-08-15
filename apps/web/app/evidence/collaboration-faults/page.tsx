import type { Metadata } from 'next'
import { CollaborationStatePanel } from '../../../features/collaboration/collaboration-hub'

export const metadata: Metadata = {
  title: 'Collaboration state evidence · WorkMesh',
  robots: { index: false, follow: false },
}

const supportedStates = ['conflict', 'expired'] as const
type EvidenceState = (typeof supportedStates)[number]

function evidenceState(value: string | string[] | undefined): EvidenceState {
  const candidate = Array.isArray(value) ? value[0] : value
  return supportedStates.includes(candidate as EvidenceState) ? candidate as EvidenceState : 'conflict'
}

export default async function CollaborationFaultEvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>
}) {
  const state = evidenceState((await searchParams).state)
  return <main className="shell-main" data-evidence-seam="collaboration-state" data-evidence-state={state}>
    <section aria-labelledby="evidence-title" className="content-panel">
      <header>
        <p className="eyebrow">Read-only evidence fixture</p>
        <h1 id="evidence-title">Collaboration state presentation</h1>
        <p role="status">
          This unlinked page simulates presentation only. It performs no server request or mutation and does not claim that a real server fault occurred.
        </p>
      </header>
      <CollaborationStatePanel state={state} />
      <nav aria-label="Collaboration evidence states">
        <a aria-current={state === 'conflict' ? 'page' : undefined} href="/evidence/collaboration-faults?state=conflict">Conflict</a>
        {' · '}
        <a aria-current={state === 'expired' ? 'page' : undefined} href="/evidence/collaboration-faults?state=expired">Expired</a>
      </nav>
      <p><a href="/">Return to WorkMesh</a></p>
    </section>
  </main>
}
