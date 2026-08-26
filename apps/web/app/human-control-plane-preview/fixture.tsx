'use client'

import { type MouseEvent, useMemo, useState } from 'react'
import {
  ActorAttribution,
  AffectedResourceList,
  AppShell,
  AttentionKindBadge,
  AttentionListItem,
  Button,
  CausalTimeline,
  ConsequencePreviewDialog,
  ControlCapabilityBar,
  ControlCenterSection,
  EvidenceDrawer,
  EvidenceReferenceList,
  FreshnessBadge,
  LifecycleBadge,
  PlanStepRail,
  ProjectControlNavigation,
  ReasonCodeList,
  RiskBadge,
  RunDigestCard,
  RunHealthBadge,
  RunStatusBar,
  TechnicalEventGroup,
  UrgencyBadge,
} from '@workmesh/ui'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { FolderOpenIcon } from '@phosphor-icons/react/dist/csr/FolderOpen'
import { PauseIcon } from '@phosphor-icons/react/dist/csr/Pause'
import { useLocale } from '../lib/i18n'
import { projectControlNavigation, type ProjectControlSurface } from '../lib/human-control-plane-navigation'
import { workspaceNavigation, workspaceUtilityNavigation } from '../lib/workspace-navigation'

const projectId = 'runtime-reliability'
const fixtureFacts = {
  acceptanceTitle: '#89 Control Center read-model acceptance',
  agentName: 'Codex Production Coordinator',
  foundationTitle: '#90 Human Control Plane foundation',
  productName: 'WorkMesh',
  runTitle: '#90 Establish shared UI primitives',
  staleTitle: 'Agent Session heartbeat projection',
  humanName: 'Xu Runxin',
} as const

export function HumanControlPlaneFixture() {
  const { humanControlPlaneCopy: copy, t } = useLocale()
  const [activeSurface, setActiveSurface] = useState<ProjectControlSurface>('overview')
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [pauseOpen, setPauseOpen] = useState(false)
  const navigation = useMemo(() => projectControlNavigation({
    active: activeSurface,
    copy: {
      overview: copy.overview, work: copy.work, attention: copy.attention, runs: copy.runs,
      graph: copy.graph, activity: copy.activity, settings: copy.projectSettings, beta: copy.beta,
    },
    projectId,
  }).map(item => ({
    ...item,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); setActiveSurface(item.id) },
  })), [activeSurface, copy])

  const attribution = <ActorAttribution
    activeAgent={{ label: copy.activeAgent, name: fixtureFacts.agentName }}
    relationshipLabel={copy.agentRelationship}
    responsibleHuman={{ label: copy.responsibleHuman, name: fixtureFacts.humanName }}
  />

  return <AppShell
    actorName={fixtureFacts.humanName}
    contextLabel={copy.title}
    navigation={workspaceNavigation({ active: 'projects', t })}
    productName={fixtureFacts.productName}
    utilityNavigation={workspaceUtilityNavigation({ t })}
  >
    <div className="hcp-reference">
      <header className="hcp-project-header">
        <div className="hcp-breadcrumb">{fixtureFacts.productName} / {t('projects')} / <strong>{copy.title}</strong></div>
        <div className="hcp-project-heading">
          <div><div className="hcp-title-row"><h1>{copy.title}</h1><FreshnessBadge categoryLabel={copy.freshness} label={copy.freshNow} value="fresh" /></div><p>{copy.projectDescription}</p></div>
          <div className="hcp-project-actions"><Button icon={<FolderOpenIcon aria-hidden="true" size={16} />} onClick={() => setActiveSurface('work')} type="button">{copy.viewWork}</Button><Button onClick={() => setActiveSurface('settings')} type="button" variant="ghost">{copy.projectSettings}</Button></div>
        </div>
        {attribution}
      </header>

      <ProjectControlNavigation items={navigation} label={copy.projectNavigation} />

      <section aria-label={copy.summaryLabel} className="hcp-summary-strip">
        {[ [copy.needsYou, '2', 'attention'], [copy.running, '1', 'running'], [copy.atRisk, '1', 'risk'], [copy.recentlyVerified, '4', 'verified'], [copy.ready, '7', 'ready'], [copy.blocked, '2', 'blocked'] ].map(([label, value, tone]) => <article className={`tone-${tone}`} key={label}><strong>{value}</strong><span>{label}</span></article>)}
      </section>

      <div className="hcp-control-grid">
        <ControlCenterSection count={2} description={copy.needsYouDescription} title={copy.needsYou} tone="attention">
          <AttentionListItem
            actions={<Button icon={<ArrowRightIcon aria-hidden="true" size={16} />} iconPosition="end" type="button" variant="primary">{copy.continueReview}</Button>}
            actor={attribution}
            badges={<><AttentionKindBadge categoryLabel={copy.attentionKind} label={copy.decision} value="decision" /><LifecycleBadge categoryLabel={copy.lifecycle} label={copy.statusOpen} value="open" /><UrgencyBadge categoryLabel={copy.urgency} label={copy.urgencySoon} value="soon" /></>}
            description={copy.runDescription}
            title={fixtureFacts.foundationTitle}
          />
          <AttentionListItem
            actions={<Button type="button">{copy.continueReview}</Button>}
            badges={<><AttentionKindBadge categoryLabel={copy.attentionKind} label={copy.completionReview} value="completion_review" /><RiskBadge categoryLabel={copy.risk} label={copy.riskHigh} value="high" /></>}
            description={copy.verifiedDescription}
            title={fixtureFacts.acceptanceTitle}
          />
        </ControlCenterSection>

        <ControlCenterSection count={1} description={copy.runningDescription} title={copy.running} tone="running">
          <RunDigestCard
            actions={<><Button icon={<FolderOpenIcon aria-hidden="true" size={16} />} onClick={() => setEvidenceOpen(true)} type="button">{copy.viewEvidence}</Button><Button icon={<PauseIcon aria-hidden="true" size={16} />} onClick={() => setPauseOpen(true)} type="button" variant="ghost">{copy.pauseRun}</Button></>}
            attribution={attribution}
            badges={<><RunHealthBadge categoryLabel={copy.health} label={copy.runHealthy} value="healthy" /><FreshnessBadge categoryLabel={copy.freshness} label={copy.freshNow} value="fresh" /></>}
            description={copy.runDescription}
            status={<RunStatusBar completed={2} label={copy.planSteps} total={3} />}
            title={fixtureFacts.runTitle}
          >
            <PlanStepRail label={copy.planSteps} steps={[
              { id: 'implement', label: copy.stepImplement, state: 'complete' },
              { id: 'review', label: copy.stepReview, state: 'current' },
              { id: 'verify', label: copy.stepVerify, state: 'pending' },
            ]} />
          </RunDigestCard>
        </ControlCenterSection>

        <ControlCenterSection count={1} description={copy.atRiskDescription} title={copy.atRisk} tone="risk">
          <AttentionListItem
            actions={<Button type="button">{copy.resync}</Button>}
            actor={attribution}
            badges={<><RunHealthBadge categoryLabel={copy.health} label={copy.stale} value="stalled" /><FreshnessBadge categoryLabel={copy.freshness} label={copy.stale} value="stale" /><RiskBadge categoryLabel={copy.risk} label={copy.riskHigh} value="high" /></>}
            description={copy.staleDescription}
            title={fixtureFacts.staleTitle}
          />
        </ControlCenterSection>

        <ControlCenterSection count={4} description={copy.recentlyVerifiedDescription} title={copy.recentlyVerified} tone="verified">
          <AttentionListItem
            actions={<Button onClick={() => setEvidenceOpen(true)} type="button" variant="ghost">{copy.viewEvidence}</Button>}
            badges={<><LifecycleBadge categoryLabel={copy.lifecycle} label={copy.statusVerified} value="verified" /><FreshnessBadge categoryLabel={copy.freshness} label={copy.freshNow} value="fresh" /></>}
            description={copy.verifiedDescription}
            title={copy.verifiedTitle}
          />
        </ControlCenterSection>
      </div>
    </div>

    <EvidenceDrawer closeLabel={copy.close} description={copy.evidenceDescription} onClose={() => setEvidenceOpen(false)} open={evidenceOpen} title={copy.evidence}>
      <ControlCapabilityBar capabilities={[{ enabled: true, id: 'pause', label: copy.pauseRun }, { enabled: true, id: 'evidence', label: copy.viewEvidence }]} label={copy.running} onSelect={id => { if (id === 'pause') { setEvidenceOpen(false); setPauseOpen(true) } }} />
      <EvidenceReferenceList evidence={[{ id: 'local-ci', href: '#local-ci', label: 'local-ci-human-control-plane.txt', typeLabel: copy.evidenceType, description: copy.verifiedDescription }]} label={copy.evidenceLabel} />
      <CausalTimeline entries={[
        { id: '1', label: copy.stepImplement, description: copy.runDescription, actor: fixtureFacts.agentName, time: '2026-08-26T09:20:00Z' },
        { id: '2', label: copy.stepReview, description: copy.verifiedDescription, actor: fixtureFacts.humanName, time: '2026-08-26T09:45:00Z' },
      ]} label={copy.timeline} />
      <TechnicalEventGroup count={3} label={copy.technicalDetails}>
        <AffectedResourceList label={copy.affectedResources} resources={[{ id: projectId, label: copy.title, typeLabel: t('projects') }]} />
        <ReasonCodeList label={copy.reasonCodes} reasons={[{ code: 'SESSION_STALE', explanation: copy.staleDescription }]} />
      </TechnicalEventGroup>
    </EvidenceDrawer>

    <ConsequencePreviewDialog cancelLabel={copy.close} confirmLabel={copy.pauseRun} consequences={Object.values(copy.consequenceImpact)} description={copy.consequenceDescription} onCancel={() => setPauseOpen(false)} onConfirm={() => setPauseOpen(false)} open={pauseOpen} title={copy.consequenceTitle} />
  </AppShell>
}
