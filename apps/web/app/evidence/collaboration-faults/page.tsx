import type { Metadata } from 'next'
import { CollaborationStatePanel } from '../../../features/collaboration/collaboration-hub'

const supportedStates = ['conflict', 'expired'] as const
type EvidenceState = (typeof supportedStates)[number]

function evidenceState(value: string | string[] | undefined): EvidenceState {
  const candidate = Array.isArray(value) ? value[0] : value
  return supportedStates.includes(candidate as EvidenceState) ? candidate as EvidenceState : 'conflict'
}

export async function generateMetadata(): Promise<Metadata> {
  // The metadata title is hard-coded in English to satisfy Next's static
  // metadata API; the visible page below uses the i18n copy set.
  return {
    title: 'Collaboration state evidence · WorkMesh',
    robots: { index: false, follow: false },
  }
}

export default async function CollaborationFaultEvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>
}) {
  const state = evidenceState((await searchParams).state)
  const copy = {
    eyebrow: '只读证据夹具',
    title: '协作状态展示',
    intro: '此未链接页面仅用于模拟展示。它不会发送任何服务端请求或写入，也不代表真实的服务端故障。',
    nav: '协作证据状态',
    conflict: '冲突',
    expired: '过期',
    returnHome: '返回 WorkMesh',
  }
  return <main className="shell-main" data-evidence-seam="collaboration-state" data-evidence-state={state}>
    <section aria-labelledby="evidence-title" className="content-panel">
      <header>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 id="evidence-title">{copy.title}</h1>
        <p role="status">{copy.intro}</p>
      </header>
      <CollaborationStatePanel state={state} />
      <nav aria-label={copy.nav}>
        <a aria-current={state === 'conflict' ? 'page' : undefined} href="/evidence/collaboration-faults?state=conflict">{copy.conflict}</a>
        {' · '}
        <a aria-current={state === 'expired' ? 'page' : undefined} href="/evidence/collaboration-faults?state=expired">{copy.expired}</a>
      </nav>
      <p><a href="/">{copy.returnHome}</a></p>
    </section>
  </main>
}
