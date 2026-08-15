'use client'

import { useCallback, useEffect, useState } from 'react'
import { AppShell, AsyncStateSurface, Button, EmptyState, ErrorState } from '@workmesh/ui'
import { apiRequest, json } from '../lib/api'
import { LoadMoreButton, usePagedApiList } from '../lib/pagination'
import { RealtimeStatus } from '../realtime-status'
import { GlobalCommandCenter } from '../../features/command-center'

type Rule = {
  id: string
  name: string
  state: 'active' | 'paused' | 'disabled'
  revision: number
  version: number
  trigger: { type: string; cron?: string }
}
type Loop = {
  id: string
  name: string
  state: 'active' | 'paused' | 'disabled'
  revision: number
  next_run_at: string | null
  no_overlap: boolean
}
type Run = {
  id: string
  rule_id: string | null
  loop_id: string | null
  session_id: string | null
  dry_run: boolean
  status: string
  attempt_count: number
  max_attempts: number
  created_at: string
  last_error: string | null
}
type Cycle = {
  id: string
  name: string
  state: string
  starts_at: string
  ends_at: string
  total_items: number
  completed_items: number
}
type Initiative = {
  id: string
  name: string
  status: string
  priority: string
  health: string
}
type Usage = {
  input_tokens: string
  output_tokens: string
  runtime_ms: string
  tool_calls: string
  unknown_cost_records: number
  currency_buckets: Array<{
    currency: string
    known_cost_minor: string
    unknown_cost_records: number
  }>
}
type Template = {
  id: string
  kind: string
  name: string
  status: string
  version: number
}
type FeatureRegistry = {
  features: Array<{ key: string; tier: 'beta' | 'experimental'; enabled: boolean }>
}

const when = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not scheduled'
const message = (reason: unknown) => reason instanceof Error ? reason.message : 'Request failed'
const operationsNavigation = [
  { href: '/?view=inbox', label: 'Inbox' },
  { href: '/?view=my-work', label: 'My Work' },
  { href: '/?view=projects', label: 'Projects' },
  { href: '/agents', label: 'Agents' },
  { href: '/operations', label: 'Operations', active: true },
]

export default function OperationsPage() {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [error, setError] = useState('')
  const [features, setFeatures] = useState<Set<string> | null>(null)
  const operationsEnabled = features?.has('WORKMESH_BETA_OPERATIONS_UI') ?? false
  const cyclesPage = usePagedApiList<Cycle>(
    operationsEnabled && features?.has('WORKMESH_BETA_PLANNING') ? '/api/v1/cycles' : null,
  )
  const initiativesPage = usePagedApiList<Initiative>(
    operationsEnabled && features?.has('WORKMESH_BETA_PLANNING') ? '/api/v1/initiatives' : null,
  )
  const rulesPage = usePagedApiList<Rule>(
    operationsEnabled && features?.has('WORKMESH_EXPERIMENTAL_AUTOMATION') ? '/api/v1/automation-rules' : null,
  )
  const loopsPage = usePagedApiList<Loop>(
    operationsEnabled && features?.has('WORKMESH_EXPERIMENTAL_AGENT_LOOPS') ? '/api/v1/loops' : null,
  )
  const runsPage = usePagedApiList<Run>(
    operationsEnabled && features?.has('WORKMESH_EXPERIMENTAL_AUTOMATION') ? '/api/v1/automation-runs' : null,
  )
  const templatesPage = usePagedApiList<Template>(
    operationsEnabled && features?.has('WORKMESH_BETA_TEMPLATES') ? '/api/v1/templates' : null,
  )
  const collectionError = [
    cyclesPage.error, initiativesPage.error, rulesPage.error,
    loopsPage.error, runsPage.error, templatesPage.error,
  ].find(Boolean)
  const data = operationsEnabled && usage ? {
    cycles: cyclesPage.items,
    initiatives: initiativesPage.items,
    rules: rulesPage.items,
    loops: loopsPage.items,
    runs: runsPage.items,
    usage,
    templates: templatesPage.items,
  } : null
  const load = useCallback(async () => {
    try {
      setError('')
      const registry = await apiRequest<FeatureRegistry>('/api/v1/features')
      const enabled = new Set(registry.features.filter(feature => feature.enabled).map(feature => feature.key))
      setFeatures(enabled)
      if (!enabled.has('WORKMESH_BETA_OPERATIONS_UI')) {
        setUsage(null)
        return
      }
      setUsage(enabled.has('WORKMESH_BETA_COSTS') ? await apiRequest<Usage>('/api/v1/usage-summary') : {
          input_tokens: '0',
          output_tokens: '0',
          runtime_ms: '0',
          tool_calls: '0',
          unknown_cost_records: 0,
          currency_buckets: [],
        })
    } catch (reason) {
      setError(message(reason))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const ruleState = async (rule: Rule) => {
    try {
      await apiRequest(`/api/v1/automation-rules/${rule.id}/state`, {
        method: 'POST',
        headers: { ...json({}), 'If-Match': `"revision-${rule.revision}"` },
        body: JSON.stringify({ state: rule.state === 'active' ? 'paused' : 'active' }),
      })
      await rulesPage.refresh()
    } catch (reason) {
      setError(message(reason))
    }
  }
  const loopState = async (loop: Loop) => {
    try {
      await apiRequest(`/api/v1/loops/${loop.id}/state`, {
        method: 'POST',
        headers: { ...json({}), 'If-Match': `"revision-${loop.revision}"` },
        body: JSON.stringify({ state: loop.state === 'active' ? 'paused' : 'active' }),
      })
      await loopsPage.refresh()
    } catch (reason) {
      setError(message(reason))
    }
  }
  const dryRun = async (rule: Rule) => {
    try {
      await apiRequest(`/api/v1/automation-rules/${rule.id}/dry-run`, {
        method: 'POST',
        headers: json({}),
        body: JSON.stringify({
          occurrenceKey: `ui:${crypto.randomUUID()}`,
          payload: { source: 'operations-ui' },
        }),
      })
      await runsPage.refresh()
    } catch (reason) {
      setError(message(reason))
    }
  }

  const headerActions = <div className="shell-action-cluster"><GlobalCommandCenter /><RealtimeStatus /></div>
  if (!features && !error) return <AppShell contextLabel="Planning & Operations" headerActions={headerActions} navigation={operationsNavigation} productName="WorkMesh" utilityNavigation={[{ href: '/settings', label: 'Settings' }]}><div className="center"><AsyncStateSurface description="Loading durable planning, automation, health, and cost projections." state="loading" title="Loading Operations" /></div></AppShell>
  if (features && !features.has('WORKMESH_BETA_OPERATIONS_UI'))
    return <AppShell contextLabel="Planning & Operations" headerActions={headerActions} navigation={operationsNavigation} productName="WorkMesh" utilityNavigation={[{ href: '/settings', label: 'Settings' }]}><div className="center" data-testid="operations-disabled"><EmptyState description="This deployment has not enabled the Operations UI feature." title="Operations is disabled" /></div></AppShell>
  return (
    <AppShell contextLabel="Planning & Operations" headerActions={headerActions} navigation={operationsNavigation} productName="WorkMesh" utilityNavigation={[{ href: '/settings', label: 'Settings' }]}>
    <div className="operations-shell">
      <header className="operations-header">
        <div>
          <a href="/">Back to work</a>
          <h1>Planning &amp; Operations</h1>
          <p>Durable planning, automation, health, and cost observability.</p>
        </div>
        <Button onClick={() => { void load(); void cyclesPage.refresh(); void initiativesPage.refresh(); void rulesPage.refresh(); void loopsPage.refresh(); void runsPage.refresh(); void templatesPage.refresh() }}>Refresh</Button>
      </header>
      {(error || collectionError) && <ErrorState actionLabel="Retry" description={error || collectionError?.message || 'Unable to load Operations.'} onAction={() => { void load(); void cyclesPage.refresh(); void initiativesPage.refresh(); void rulesPage.refresh(); void loopsPage.refresh(); void runsPage.refresh(); void templatesPage.refresh() }} title="Operations needs attention" />}
      {data && (
        <>
          {features?.has('WORKMESH_BETA_COSTS') && <section className="operations-metrics" aria-label="Usage and cost">
            <article>
              <span>Known cost</span>
              {data.usage.currency_buckets.length === 0
                ? <strong>No known cost</strong>
                : data.usage.currency_buckets.map(bucket =>
                  <strong key={bucket.currency}>{bucket.known_cost_minor} {bucket.currency}</strong>)}
            </article>
            <article><span>Unknown cost</span><strong>{data.usage.unknown_cost_records}</strong><small>Never treated as zero.</small></article>
            <article><span>Tokens</span><strong>{Number(data.usage.input_tokens) + Number(data.usage.output_tokens)}</strong></article>
            <article><span>Runtime</span><strong>{Math.round(Number(data.usage.runtime_ms) / 1000)}s</strong></article>
            <article><span>Tool calls</span><strong>{data.usage.tool_calls}</strong></article>
          </section>}
          <div className="operations-grid">
            {features?.has('WORKMESH_BETA_PLANNING') && <section className="operations-panel" data-testid="cycles-panel">
              <h2>Cycles</h2>
              {data.cycles.map(cycle => (
                <article key={cycle.id}>
                  <div><strong>{cycle.name}</strong><span className={`status ${cycle.state}`}>{cycle.state}</span></div>
                  <p>{cycle.completed_items}/{cycle.total_items} completed</p>
                  <small>{when(cycle.starts_at)} → {when(cycle.ends_at)}</small>
                </article>
              ))}
              {data.cycles.length === 0 && <EmptyState description="Create a Cycle when a planning window is ready." title="No Cycles configured" />}
              <LoadMoreButton collection={cyclesPage} label="cycles" />
            </section>}
            {features?.has('WORKMESH_BETA_PLANNING') && <section className="operations-panel" data-testid="initiatives-panel">
              <h2>Initiatives</h2>
              {data.initiatives.map(initiative => (
                <article key={initiative.id}>
                  <div><strong>{initiative.name}</strong><span className={`health ${initiative.health}`}>{initiative.health}</span></div>
                  <p>{initiative.status} · {initiative.priority} priority</p>
                </article>
              ))}
              {data.initiatives.length === 0 && <EmptyState description="Initiatives will appear here when the feature has durable data." title="No Initiatives configured" />}
              <LoadMoreButton collection={initiativesPage} label="initiatives" />
            </section>}
            {features?.has('WORKMESH_EXPERIMENTAL_AUTOMATION') && <section className="operations-panel wide" data-testid="automation-panel">
              <h2>Automation rules</h2>
              {data.rules.map(rule => (
                <article key={rule.id} className="automation-row">
                  <div><strong>{rule.name}</strong><small>v{rule.version} · {rule.trigger.type}{rule.trigger.cron ? ` ${rule.trigger.cron}` : ''}</small></div>
                  <span className={`status ${rule.state}`}>{rule.state}</span>
                  <button onClick={() => void dryRun(rule)}>Dry run</button>
                  <button onClick={() => void ruleState(rule)}>{rule.state === 'active' ? 'Pause' : 'Resume'}</button>
                </article>
              ))}
              {data.rules.length === 0 && <EmptyState description="Automation rules will appear after they are created through an authorized command." title="No Rules configured" />}
              <LoadMoreButton collection={rulesPage} label="automation rules" />
            </section>}
            {features?.has('WORKMESH_EXPERIMENTAL_AGENT_LOOPS') && <section className="operations-panel wide" data-testid="loops-panel">
              <h2>Loops</h2>
              {data.loops.map(loop => (
                <article key={loop.id} className="automation-row">
                  <div><strong>{loop.name}</strong><small>Next: {when(loop.next_run_at)} · {loop.no_overlap ? 'No overlap' : 'Overlap allowed'}</small></div>
                  <span className={`status ${loop.state}`}>{loop.state}</span>
                  <button onClick={() => void loopState(loop)}>{loop.state === 'active' ? 'Pause' : 'Resume'}</button>
                </article>
              ))}
              {data.loops.length === 0 && <EmptyState description="Agent Loops will appear after they are created through an authorized command." title="No Loops configured" />}
              <LoadMoreButton collection={loopsPage} label="loops" />
            </section>}
            {features?.has('WORKMESH_EXPERIMENTAL_AUTOMATION') && <section className="operations-panel wide" data-testid="runs-panel">
              <h2>Recent runs</h2>
              <div className="operations-table">
                <div className="table-head"><span>Run</span><span>Kind</span><span>Status</span><span>Attempts</span><span>Session</span><span>Created</span></div>
                {data.runs.map(run => (
                  <div key={run.id}>
                    <code>{run.id.slice(0, 8)}</code>
                    <span>{run.dry_run ? 'Dry run' : run.loop_id ? 'Loop' : 'Rule'}</span>
                    <span className={`status ${run.status}`}>{run.status}</span>
                    <span>{run.attempt_count}/{run.max_attempts}</span>
                    <code>{run.session_id?.slice(0, 8) ?? '—'}</code>
                    <time>{when(run.created_at)}</time>
                    {run.last_error && <small className="error">{run.last_error}</small>}
                  </div>
                ))}
              </div>
              {data.runs.length === 0 && <EmptyState description="Durable run history will appear after an automation or loop executes." title="No run history yet" />}
              <LoadMoreButton collection={runsPage} label="automation runs" />
            </section>}
            {features?.has('WORKMESH_BETA_TEMPLATES') && <section className="operations-panel wide" data-testid="templates-panel">
              <h2>Templates &amp; playbooks</h2>
              <div className="template-list">
                {data.templates.map(template => (
                  <span key={template.id}>
                    <strong>{template.name}</strong>
                    <small>{template.kind} · v{template.version} · {template.status}</small>
                  </span>
                ))}
              </div>
              {data.templates.length === 0 && <EmptyState description="Templates and playbooks will appear when they are available to this workspace." title="No Templates configured" />}
              <LoadMoreButton collection={templatesPage} label="templates" />
            </section>}
          </div>
        </>
      )}
    </div>
    </AppShell>
  )
}
