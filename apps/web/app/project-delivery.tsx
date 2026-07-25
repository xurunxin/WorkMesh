'use client'

import { useEffect, useState } from 'react'
import { apiRequest } from './lib/api'

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

export function ProjectDelivery({ projectId }: { projectId: string }) {
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [error, setError] = useState('')
  const [decidingId, setDecidingId] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void apiRequest<Delivery>(`/api/v1/projects/${encodeURIComponent(projectId)}/delivery`)
      .then(value => { if (active) setDelivery(value) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load delivery data') })
    return () => { active = false }
  }, [projectId])
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
      setError(reason instanceof Error ? reason.message : 'Unable to decide completion suggestion')
    } finally {
      setDecidingId(null)
    }
  }
  if (error) return <p className="error" role="alert">{error}</p>
  if (!delivery) return <section className="project-delivery" data-testid="project-delivery">Loading delivery...</section>
  return <section className="project-delivery" data-testid="project-delivery">
    <header><h3>Delivery</h3><span>Human-controlled completion</span></header>
    <div className="delivery-grid">
      <article><h4>Milestones</h4>{delivery.milestones.map(milestone => {
        const percent = milestone.total ? Math.round((milestone.completed / milestone.total) * 100) : 0
        return <div key={milestone.id} className="delivery-row"><strong>{milestone.name}</strong><span>{milestone.completed}/{milestone.total} · {percent}%</span><progress max={100} value={percent} /></div>
      })}{delivery.milestones.length === 0 && <small>No milestones.</small>}</article>
      <article><h4>Agent evidence</h4>{delivery.artifacts.map(artifact => {
        const href = safeExternalHref(artifact.uri)
        return <div key={artifact.id} className="delivery-row"><strong>{artifact.type}</strong>{href ? <a href={href} rel="noopener noreferrer">{artifact.title}</a> : <span>{artifact.title}</span>}<code>{artifact.checksum}</code></div>
      })}{delivery.artifacts.length === 0 && <small>No agent evidence.</small>}</article>
      <article><h4>Provider-confirmed state</h4>{delivery.providerPullRequests.map(pullRequest => {
        const href = safeExternalHref(pullRequest.uri)
        return <div key={pullRequest.id} className="delivery-row">
          <strong>{pullRequest.provider} PR #{pullRequest.number} · {pullRequest.state}</strong>
          {href ? <a href={href} rel="noopener noreferrer">{pullRequest.headBranch}</a> : <span>{pullRequest.headBranch}</span>}
          <code>{pullRequest.headSha}</code>
          <small>Source: {pullRequest.provenance.source} · {pullRequest.provenance.sourceId ?? 'unavailable'}</small>
          {pullRequest.checks.map(check => {
            const checkHref = safeExternalHref(check.detailsUrl)
            return <span key={`${pullRequest.id}:${check.name}:${check.headSha}`}>{check.required ? 'required' : 'optional'} check {check.name}: {checkHref ? <a href={checkHref} rel="noopener noreferrer">{check.status}</a> : check.status}</span>
          })}
          {delivery.providerReviews.filter(review => review.pullRequestId === pullRequest.id).map(review =>
            <small key={`provider-review:${review.provenance.sourceId}`}>Provider review observation: {review.state} by {review.author.login ?? review.author.providerId} at {review.headSha}; not WorkMesh merge authority.</small>)}
          {delivery.workMeshStructuredReviews.filter(review => review.pullRequestId === pullRequest.id).map(review =>
            <div key={`workmesh-review:${review.artifactId}`} className="delivery-row">
              <strong>WorkMesh structured review authority: {review.verdict} at {review.headSha}</strong>
              <span>{review.summary}</span>
              {review.findings.map((finding, index) =>
                <div key={`${review.artifactId}:${finding.file}:${finding.line}:${index}`} className="delivery-finding">
                  <strong>{finding.severity}: {finding.file}:{finding.line}</strong>
                  <span>{finding.summary}</span>
                  <small>Evidence: {finding.evidence}</small>
                  <small>Recommendation: {finding.recommendation}</small>
                </div>)}
              {review.findings.length === 0 && <small>No structured findings.</small>}
            </div>)}
        </div>
      })}{delivery.providerPullRequests.length === 0 && <small>No provider-confirmed pull requests.</small>}</article>
      <article><h4>Exact merge approvals</h4>{delivery.mergeApprovals.map(approval =>
        <div key={approval.approvalId} className="delivery-row" data-testid="merge-approval-card">
          <strong>{approval.provider} · {approval.repository} · PR #{approval.pullRequestNumber}</strong>
          <span>Head: <code>{approval.headSha}</code></span>
          <span>Method: {approval.method}</span>
          <span>Status: {approval.status}</span>
          {approval.invalidationReason && <small>Invalidated: {approval.invalidationReason}</small>}
        </div>)}
        {delivery.mergeApprovals.length === 0 && <small>No exact merge approvals.</small>}
      </article>
      <article><h4>Project dependencies</h4>{delivery.dependencies.map(dependency =>
        <div key={dependency.depends_on_project_id} className="delivery-row">
          <strong>Depends on: {dependency.depends_on_project_name}</strong>
          <span>State: {dependency.depends_on_project_status}</span>
        </div>,
      )}{delivery.dependencies.length === 0 && <small>No project dependencies.</small>}</article>
      <article><h4>Health updates</h4>{delivery.updates.map(update => <div key={update.id} className="delivery-row"><strong>{update.health} · {update.status}</strong><span>{update.body}</span></div>)}{delivery.updates.length === 0 && <small>No health updates.</small>}</article>
      <article><h4>Completion suggestions</h4>{delivery.completionSuggestions.map(suggestion => <div key={suggestion.id} className="delivery-row"><strong>{suggestion.status}</strong><span>{suggestion.rationale}</span><small>Decision only; the work item remains unchanged until a human workflow transition.</small>{suggestion.status === 'open' && <span><button type="button" disabled={decidingId === suggestion.id} onClick={() => void decideSuggestion(suggestion, 'accepted')}>Accept suggestion</button><button type="button" disabled={decidingId === suggestion.id} onClick={() => void decideSuggestion(suggestion, 'dismissed')}>Dismiss suggestion</button></span>}</div>)}{delivery.completionSuggestions.length === 0 && <small>No suggestions.</small>}</article>
    </div>
  </section>
}
