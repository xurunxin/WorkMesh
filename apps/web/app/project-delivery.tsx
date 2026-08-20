'use client'

import { useEffect, useState } from 'react'
import { Button } from '@workmesh/ui'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { apiRequest } from './lib/api'
import { useLocale } from './lib/i18n'
import { projectMilestoneIssuesHref } from './lib/project-work'

type Delivery = {
  milestones: Array<{ id: string; name: string; total: number; completed: number; target_date: string | null }>
  updates: Array<{ id: string; health: string; body: string; status: string; created_at: string }>
  artifacts: Array<{ id: string; type: string; title: string; uri: string | null; checksum: string }>
  dependencies: Array<{
    depends_on_project_id: string
    depends_on_project_name: string
    depends_on_project_status: string
  }>
  completionSuggestions: Array<{ id: string; rationale: string; status: string; revision: number }>
  providerPullRequests: Array<{
    id: string
    provider: string
    number: number
    state: string
    headSha: string
    headBranch: string
    uri: string
    provenance: { source: string; sourceId: string | null }
    checks: Array<{
      name: string
      status: string
      required: boolean
      headSha: string
      detailsUrl: string | null
      provenance: { source: string; sourceId: string | null }
    }>
  }>
  providerReviews: Array<{ pullRequestId: string; state: string; headSha: string; author: { providerId: string; login: string | null }; uri: string | null; provenance: { source: string; sourceId: string }; authority: 'provider_observation' }>
  workMeshStructuredReviews: Array<{
    pullRequestId: string
    verdict: string
    headSha: string
    reviewerActorId: string
    artifactId: string
    summary: string
    authority: 'workmesh_structured_review'
    findings: Array<{
      severity: string
      file: string
      line: number
      summary: string
      evidence: string
      recommendation: string
    }>
  }>
  mergeApprovals: Array<{
    approvalId: string
    provider: string
    repository: string
    pullRequestId: string
    pullRequestNumber: number
    headSha: string
    method: string
    status: string
    invalidatedAt: string | null
    invalidationReason: string | null
  }>
}

function safeExternalHref(value: string | null): string | undefined {
  if (!value) return undefined
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.hostname
      ? parsed.href
      : undefined
  } catch {
    return undefined
  }
}

const healthTone: Record<string, string> = {
  on_track: 'health-positive',
  at_risk: 'health-warning',
  off_track: 'health-critical',
}

export function ProjectDelivery({ projectId }: { projectId: string }) {
  const { locale, projectDeliveryHealthLabel: healthLabel } = useLocale()
  const text = locale === 'zh-CN' ? {
    loadError: '无法加载交付数据', decideError: '无法处理完成建议', loading: '正在加载交付数据…', delivery: '交付', humanControlled: '由人类控制完成状态', milestones: '里程碑', viewIssues: '查看 Issues', viewMilestoneIssues: (name: string) => `查看 ${name} Issues`, noMilestones: '暂无里程碑。', agentEvidence: '智能体证据', noAgentEvidence: '暂无智能体证据。', providerState: '提供方确认状态', source: '来源', unavailable: '不可用', required: '必需', optional: '可选', check: '检查', providerReview: '提供方审阅观察', notAuthority: '不代表 WorkMesh 合并权限。', structuredReview: 'WorkMesh 结构化审阅权限', evidence: '证据', recommendation: '建议', noFindings: '无结构化发现。', noPullRequests: '暂无提供方确认的拉取请求。', mergeApprovals: '精确合并审批', head: '提交', method: '方式', status: '状态', invalidated: '已失效', noApprovals: '暂无精确合并审批。', dependencies: '项目依赖', dependsOn: '依赖', state: '状态', noDependencies: '暂无项目依赖。', healthUpdates: '健康度更新', noHealthUpdates: '暂无健康度更新。', completionSuggestions: '完成建议', decisionHelp: '这里只记录决策；在人类执行工作流转换前，Issue 不会变化。', accept: '接受建议', dismiss: '忽略建议', noSuggestions: '暂无建议。',
  } : {
    loadError: 'Unable to load delivery data', decideError: 'Unable to decide completion suggestion', loading: 'Loading delivery…', delivery: 'Delivery', humanControlled: 'Human-controlled completion', milestones: 'Milestones', viewIssues: 'View Issues', viewMilestoneIssues: (name: string) => `View ${name} Issues`, noMilestones: 'No milestones.', agentEvidence: 'Agent evidence', noAgentEvidence: 'No agent evidence.', providerState: 'Provider-confirmed state', source: 'Source', unavailable: 'unavailable', required: 'required', optional: 'optional', check: 'check', providerReview: 'Provider review observation', notAuthority: 'not WorkMesh merge authority.', structuredReview: 'WorkMesh structured review authority', evidence: 'Evidence', recommendation: 'Recommendation', noFindings: 'No structured findings.', noPullRequests: 'No provider-confirmed pull requests.', mergeApprovals: 'Exact merge approvals', head: 'Head', method: 'Method', status: 'Status', invalidated: 'Invalidated', noApprovals: 'No exact merge approvals.', dependencies: 'Project dependencies', dependsOn: 'Depends on', state: 'State', noDependencies: 'No project dependencies.', healthUpdates: 'Health updates', noHealthUpdates: 'No health updates.', completionSuggestions: 'Completion suggestions', decisionHelp: 'Decision only; the work item remains unchanged until a human workflow transition.', accept: 'Accept suggestion', dismiss: 'Dismiss suggestion', noSuggestions: 'No suggestions.',
  }
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [error, setError] = useState('')
  const [decidingId, setDecidingId] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void apiRequest<Delivery>(`/api/v1/projects/${encodeURIComponent(projectId)}/delivery`)
      .then(value => { if (active) setDelivery(value) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : text.loadError) })
    return () => { active = false }
  }, [projectId, text.loadError])
  const decideSuggestion = async (suggestion: Delivery['completionSuggestions'][number], decision: 'accepted' | 'dismissed') => {
    setError('')
    setDecidingId(suggestion.id)
    try {
      const decided = await apiRequest<Delivery['completionSuggestions'][number]>(
        `/api/v1/completion-suggestions/${encodeURIComponent(suggestion.id)}/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'If-Match': `"revision-${suggestion.revision}"` },
          body: JSON.stringify({ decision }),
        },
      )
      setDelivery(current => current ? {
        ...current,
        completionSuggestions: current.completionSuggestions.map(value => value.id === decided.id ? { ...value, ...decided } : value),
      } : current)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.decideError)
    } finally {
      setDecidingId(null)
    }
  }
  if (error) return <p className="error" role="alert">{error}</p>
  if (!delivery) return <section className="project-delivery" data-testid="project-delivery"><header><h3>{text.delivery}</h3><span>{text.loading}</span></header></section>
  return <section className="project-delivery" data-testid="project-delivery">
    <header><h3>{text.delivery}</h3><span>{text.humanControlled}</span></header>
    <div className="delivery-grid">
      <article><h4>{text.milestones}</h4>{delivery.milestones.map(milestone => {
        const percent = milestone.total ? Math.round((milestone.completed / milestone.total) * 100) : 0
        return <div key={milestone.id} className="delivery-row"><strong>{milestone.name}</strong><span>{milestone.completed}/{milestone.total} · {percent}%</span><progress max={100} value={percent} /><a aria-label={text.viewMilestoneIssues(milestone.name)} href={projectMilestoneIssuesHref(projectId, milestone.id)}>{text.viewIssues}</a></div>
      })}{delivery.milestones.length === 0 && <small>{text.noMilestones}</small>}</article>
      <article><h4>{text.agentEvidence}</h4>{delivery.artifacts.map(artifact => {
        const href = safeExternalHref(artifact.uri)
        return <div key={artifact.id} className="delivery-row"><strong>{artifact.type}</strong>{href ? <a href={href} rel="noopener noreferrer">{artifact.title}</a> : <span>{artifact.title}</span>}<code>{artifact.checksum}</code></div>
      })}{delivery.artifacts.length === 0 && <small>{text.noAgentEvidence}</small>}</article>
      <article className="delivery-priority-wide"><h4>{text.providerState}</h4>{delivery.providerPullRequests.map(pullRequest => {
        const href = safeExternalHref(pullRequest.uri)
        return <div key={pullRequest.id} className="delivery-row">
          <strong>{pullRequest.provider} PR #{pullRequest.number} · {pullRequest.state}</strong>
          {href ? <a href={href} rel="noopener noreferrer">{pullRequest.headBranch}</a> : <span>{pullRequest.headBranch}</span>}
          <code>{pullRequest.headSha}</code>
          <small>{text.source}: {pullRequest.provenance.source} · {pullRequest.provenance.sourceId ?? text.unavailable}</small>
          {pullRequest.checks.map(check => {
            const checkHref = safeExternalHref(check.detailsUrl)
            return <span key={`${pullRequest.id}:${check.name}:${check.headSha}`}>{check.required ? text.required : text.optional} {text.check} {check.name}: {checkHref ? <a href={checkHref} rel="noopener noreferrer">{check.status}</a> : check.status}</span>
          })}
          {delivery.providerReviews.filter(review => review.pullRequestId === pullRequest.id).map(review =>
            <small key={`provider-review:${review.provenance.sourceId}`}>{text.providerReview}: {review.state} by {review.author.login ?? review.author.providerId} at {review.headSha}; {text.notAuthority}</small>)}
          {delivery.workMeshStructuredReviews.filter(review => review.pullRequestId === pullRequest.id).map(review =>
            <div key={`workmesh-review:${review.artifactId}`} className="delivery-row">
              <strong>{text.structuredReview}: {review.verdict} at {review.headSha}</strong>
              <span>{review.summary}</span>
              {review.findings.map((finding, index) =>
                <div key={`${review.artifactId}:${finding.file}:${finding.line}:${index}`} className="delivery-finding">
                  <strong>{finding.severity}: {finding.file}:{finding.line}</strong>
                  <span>{finding.summary}</span>
                  <small>{text.evidence}: {finding.evidence}</small>
                  <small>{text.recommendation}: {finding.recommendation}</small>
                </div>)}
              {review.findings.length === 0 && <small>{text.noFindings}</small>}
            </div>)}
        </div>
      })}{delivery.providerPullRequests.length === 0 && <small>{text.noPullRequests}</small>}</article>
      <article><h4>{text.mergeApprovals}</h4>{delivery.mergeApprovals.map(approval =>
        <div key={approval.approvalId} className="delivery-row" data-testid="merge-approval-card">
          <strong>{approval.provider} · {approval.repository} · PR #{approval.pullRequestNumber}</strong>
          <span>{text.head}: <code>{approval.headSha}</code></span>
          <span>{text.method}: {approval.method}</span>
          <span>{text.status}: {approval.status}</span>
          {approval.invalidationReason && <small>{text.invalidated}: {approval.invalidationReason}</small>}
        </div>)}
        {delivery.mergeApprovals.length === 0 && <small>{text.noApprovals}</small>}
      </article>
      <article><h4>{text.dependencies}</h4>{delivery.dependencies.map(dependency =>
        <div key={dependency.depends_on_project_id} className="delivery-row">
          <strong>{text.dependsOn}: {dependency.depends_on_project_name}</strong>
          <span>{text.state}: {dependency.depends_on_project_status}</span>
        </div>,
      )}{delivery.dependencies.length === 0 && <small>{text.noDependencies}</small>}</article>
      <article><h4>{text.healthUpdates}</h4>{delivery.updates.map(update => {
        const tone = healthTone[update.health] ?? 'health-neutral'
        const label = healthLabel(update.health)
        return <div key={update.id} className="delivery-row">
          <strong><span className={`health-pill ${tone}`}>{label}</span> · {update.status}</strong>
          <span>{update.body}</span>
        </div>
      })}{delivery.updates.length === 0 && <small>{text.noHealthUpdates}</small>}</article>
      <article className="delivery-priority-wide"><h4>{text.completionSuggestions}</h4>{delivery.completionSuggestions.map(suggestion => <div key={suggestion.id} className="delivery-row"><strong>{suggestion.status}</strong><span>{suggestion.rationale}</span><small>{text.decisionHelp}</small>{suggestion.status === 'open' && <span style={{ display: 'flex', gap: '.4rem' }}><Button disabled={decidingId === suggestion.id} icon={<CheckIcon aria-hidden="true" size={15} weight="bold" />} onClick={() => void decideSuggestion(suggestion, 'accepted')} type="button">{text.accept}</Button><Button disabled={decidingId === suggestion.id} icon={<XIcon aria-hidden="true" size={15} />} onClick={() => void decideSuggestion(suggestion, 'dismissed')} type="button" variant="ghost">{text.dismiss}</Button></span>}</div>)}{delivery.completionSuggestions.length === 0 && <small>{text.noSuggestions}</small>}</article>
    </div>
  </section>
}
