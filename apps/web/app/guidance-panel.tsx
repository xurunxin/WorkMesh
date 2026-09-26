'use client'

// The Guidance panel: publishes, archives, rolls back, and diffs versioned
// markdown guidance at workspace, team, or project scope. Extracted from
// page.tsx (W04) so the home page routes between scopes instead of owning the
// guidance workflow's markup and API calls.

import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Button } from '@workmesh/ui'
import { ArchiveIcon } from '@phosphor-icons/react/dist/csr/Archive'
import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise'
import { ArrowsLeftRightIcon } from '@phosphor-icons/react/dist/csr/ArrowsLeftRight'
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/csr/UploadSimple'
import { apiMutation, apiRequest, json } from './lib/api'
import { useLocale, type GuidanceCopy } from './lib/i18n'
import { useAuthorityLifetime } from './lib/use-authority-lifetime'
import { RichTextEditor } from '../features/rich-content/editor'
import type { EditableProject } from '../features/projects/project-editor'

const requestError = (reason: unknown): string => reason instanceof Error ? reason.message : 'Something went wrong.'
const revisionHeader = (revision: number): HeadersInit => ({ ...json({}), 'If-Match': `"revision-${revision}"` })

type Project = EditableProject
type Team = { id: string; name: string; key: string; revision: number }
type GuidanceScope = 'workspace' | 'team' | 'project'
type GuidanceRevision = { id: string; revisionNumber: number; contentHash: string; changeSummary: string; authorActorId: string; authorDisplayName: string; publishedAt: string }
type GuidanceCurrent = { scope: GuidanceScope; scopeId: string; documentId: string | null; status: 'unpublished' | 'active' | 'archived'; revision: number; currentRevision: GuidanceRevision | null; markdown: string; updatedAt: string }
type GuidanceHistory = { scope: GuidanceScope; scopeId: string; documentId: string | null; revision: number; status: GuidanceCurrent['status']; currentRevisionId: string | null; revisions: GuidanceRevision[]; audit: Array<{ id: string; action: 'published' | 'archived' | 'rolled_back'; fromRevisionId: string | null; toRevisionId: string | null; actorId: string; actorDisplayName: string; reason: string; createdAt: string }> }
type GuidanceDiff = { from: GuidanceRevision; to: GuidanceRevision; changes: Array<{ kind: 'context' | 'removed' | 'added'; oldLine: number | null; newLine: number | null; text: string }> }

export function GuidancePanel({ copy, workspaceId, team, projects, actorId }: { copy: GuidanceCopy; workspaceId: string; team: Team | null; projects: Project[]; actorId: string }) {
  const { editorCopy } = useLocale()
  const isAuthorityCurrent = useAuthorityLifetime()
  const [scope, setScope] = useState<GuidanceScope>('workspace')
  const [projectId, setProjectId] = useState('')
  const [current, setCurrent] = useState<GuidanceCurrent | null>(null)
  const [history, setHistory] = useState<GuidanceHistory | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [changeSummary, setChangeSummary] = useState('')
  const [reason, setReason] = useState('')
  const [fromRevisionId, setFromRevisionId] = useState('')
  const [toRevisionId, setToRevisionId] = useState('')
  const [diff, setDiff] = useState<GuidanceDiff | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setProjectId(value => projects.some(project => project.id === value) ? value : projects[0]?.id ?? '')
  }, [projects])
  const id = scope === 'workspace' ? workspaceId : scope === 'team' ? team?.id ?? '' : projectId
  const plural = `${scope}s`
  const root = id ? `/api/v1/${plural}/${id}/guidance` : ''
  const loadGuidance = useCallback(async () => {
    if (!root) {
      setCurrent(null); setHistory(null); setMarkdown(''); setDiff(null)
      return
    }
    setLoading(true); setError('')
    try {
      const [nextCurrent, nextHistory] = await Promise.all([
        apiRequest<GuidanceCurrent>(root),
        apiRequest<GuidanceHistory>(`${root}/history`),
      ])
      if (!isAuthorityCurrent()) return
      setCurrent(nextCurrent); setHistory(nextHistory); setMarkdown(nextCurrent.markdown); setDiff(null)
      const newest = nextHistory.revisions[0]?.id ?? ''
      const previous = nextHistory.revisions[1]?.id ?? newest
      setFromRevisionId(previous); setToRevisionId(newest)
    } catch (reasonValue) {
      if (isAuthorityCurrent()) setError(requestError(reasonValue))
    } finally {
      if (isAuthorityCurrent()) setLoading(false)
    }
  }, [isAuthorityCurrent, root])
  useEffect(() => { void loadGuidance() }, [loadGuidance])

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!root || !current) return
    setError('')
    try {
      await apiMutation(`guidance:${scope}:${id}:publish`, root, { method: 'PUT', headers: revisionHeader(current.revision), body: JSON.stringify({ markdown, changeSummary }) })
      if (!isAuthorityCurrent()) return
      setChangeSummary(''); await loadGuidance()
    } catch (reasonValue) { if (isAuthorityCurrent()) setError(requestError(reasonValue)) }
  }
  const archive = async () => {
    if (!root || !current || !reason) return
    setError('')
    try {
      await apiMutation(`guidance:${scope}:${id}:archive`, `${root}/archive`, { method: 'POST', headers: revisionHeader(current.revision), body: JSON.stringify({ reason }) })
      if (!isAuthorityCurrent()) return
      setReason(''); await loadGuidance()
    } catch (reasonValue) { if (isAuthorityCurrent()) setError(requestError(reasonValue)) }
  }
  const rollback = async (revisionId: string) => {
    if (!root || !current || !reason) return
    setError('')
    try {
      await apiMutation(`guidance:${scope}:${id}:rollback:${revisionId}`, `${root}/rollback`, { method: 'POST', headers: revisionHeader(current.revision), body: JSON.stringify({ revisionId, reason }) })
      if (!isAuthorityCurrent()) return
      setReason(''); await loadGuidance()
    } catch (reasonValue) { if (isAuthorityCurrent()) setError(requestError(reasonValue)) }
  }
  const compare = async () => {
    if (!root || !fromRevisionId || !toRevisionId) return
    setError('')
    try {
      const query = new URLSearchParams({ fromRevisionId, toRevisionId })
      const nextDiff = await apiRequest<GuidanceDiff>(`${root}/diff?${query}`)
      if (isAuthorityCurrent()) setDiff(nextDiff)
    } catch (reasonValue) { if (isAuthorityCurrent()) setError(requestError(reasonValue)) }
  }

  return <section className="guidance-panel" data-testid="guidance-panel">
    <p className="guidance-intro">{copy.intro}</p>
    <div className="guidance-toolbar">
      <div className="guidance-toolbar-fields">
        <label>{copy.scope}<select aria-label={copy.scopeLabel} value={scope} onChange={event => setScope(event.currentTarget.value as GuidanceScope)}><option value="workspace">{copy.workspace}</option><option value="team">{copy.team}</option><option value="project">{copy.project}</option></select></label>
        {scope === 'team' && <label>{copy.team}<input value={team?.name ?? copy.noTeamSelected} readOnly /></label>}
        {scope === 'project' && <label>{copy.project}<select aria-label={copy.projectLabel} value={projectId} onChange={event => setProjectId(event.currentTarget.value)}><option value="" disabled>{copy.noProject}</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
      </div>
      <div className={`guidance-status status-${current?.status ?? 'unpublished'}`}>
        <span className="guidance-status-label">{copy.status(current?.status ?? 'unavailable')}</span>
        <span className="guidance-status-revision">{copy.documentRevision(current?.revision ?? 0)}</span>
      </div>
    </div>
    {!root && <p className="empty">{copy.selectScope}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {loading && <p>{copy.loading}</p>}
    {root && current && <>
      <form className="guidance-editor" onSubmit={event => void publish(event)}>
        <RichTextEditor
          copy={editorCopy}
          defaultView="edit"
          identity={{ workspaceId, teamId: team?.id ?? '', actorId, resourceType: 'guidance', resourceId: current.documentId ?? scope, field: 'markdown', baseRevision: current.revision }}
          label={copy.markdown}
          name="markdown"
          onChange={setMarkdown}
          required
          testId="guidance-markdown"
          value={markdown}
        />
        <span className="guidance-character-count">{copy.characterCount(markdown.length)}</span>
        <label>{copy.changeSummary}<input data-testid="guidance-change-summary" value={changeSummary} onChange={event => setChangeSummary(event.currentTarget.value)} maxLength={500} required /></label>
        <Button data-testid="publish-guidance" icon={<UploadSimpleIcon aria-hidden="true" size={17} weight="bold" />} type="submit" variant="primary">{copy.publishRevision}</Button>
      </form>
      {current.currentRevision && <dl className="guidance-current"><div><dt>{copy.currentRevision}</dt><dd>#{current.currentRevision.revisionNumber}</dd></div><div><dt>{copy.author}</dt><dd>{current.currentRevision.authorDisplayName}</dd></div><div><dt>{copy.published}</dt><dd>{copy.formatDate(current.currentRevision.publishedAt)}</dd></div><div><dt>SHA-256</dt><dd>{current.currentRevision.contentHash}</dd></div></dl>}
      <section className="guidance-actions"><label>{copy.auditReason}<input value={reason} onChange={event => setReason(event.currentTarget.value)} placeholder={copy.auditPlaceholder} maxLength={2000} /></label><Button className="danger" disabled={!reason || current.status !== 'active'} icon={<ArchiveIcon aria-hidden="true" size={17} weight="bold" />} onClick={() => void archive()} variant="danger">{copy.archiveCurrent}</Button></section>
      <section className="guidance-history"><h3>{copy.revisionHistory}</h3>{history?.revisions.length ? <ul>{history.revisions.map(revision => <li key={revision.id} className={history.currentRevisionId === revision.id ? 'selected' : ''}><div><strong>#{revision.revisionNumber} · {revision.changeSummary}</strong><small>{revision.authorDisplayName} · {copy.formatDate(revision.publishedAt)}</small><code>{revision.contentHash}</code></div><Button disabled={!reason || history.currentRevisionId === revision.id} icon={<ArrowCounterClockwiseIcon aria-hidden="true" size={16} />} onClick={() => void rollback(revision.id)}>{copy.rollbackPointer}</Button></li>)}</ul> : <p className="empty">{copy.noRevisions}</p>}</section>
      {(history?.revisions.length ?? 0) >= 2 && <section className="guidance-compare"><h3>{copy.compareRevisions}</h3><div><select aria-label={copy.fromRevision} value={fromRevisionId} onChange={event => setFromRevisionId(event.currentTarget.value)}>{history?.revisions.map(revision => <option key={revision.id} value={revision.id}>#{revision.revisionNumber}</option>)}</select><select aria-label={copy.toRevision} value={toRevisionId} onChange={event => setToRevisionId(event.currentTarget.value)}>{history?.revisions.map(revision => <option key={revision.id} value={revision.id}>#{revision.revisionNumber}</option>)}</select><Button icon={<ArrowsLeftRightIcon aria-hidden="true" size={16} weight="bold" />} onClick={() => void compare()}>{copy.showDiff}</Button></div>{diff && <pre data-testid="guidance-diff">{diff.changes.map((change, index) => <span key={`${change.kind}:${index}`} className={`diff-${change.kind}`}>{change.kind === 'added' ? '+' : change.kind === 'removed' ? '-' : ' '} {change.text}{'\n'}</span>)}</pre>}</section>}
      <section className="guidance-audit"><h3>{copy.pointerAudit}</h3>{history?.audit.length ? <ol>{history.audit.map(fact => <li key={fact.id}><strong>{copy.action(fact.action)}</strong> {copy.by} {fact.actorDisplayName} · {fact.reason} <time>{copy.formatDate(fact.createdAt)}</time></li>)}</ol> : <p>{copy.noPointerChanges}</p>}</section>
      {scope === 'project' && projects.find(project => project.id === projectId)?.description && <div className="guidance-description-note"><strong>{copy.projectDescription}</strong><p>{projects.find(project => project.id === projectId)?.description}</p></div>}
    </>}
  </section>
}
