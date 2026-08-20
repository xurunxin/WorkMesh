'use client'

import { useCallback, useEffect, useState } from 'react'
import { AsyncStateSurface, Button, EmptyState, ErrorState } from '@workmesh/ui'
import { apiRequest, json } from './lib/api'
import { LoadMoreButton, usePagedApiList } from './lib/pagination'
import { useLocale } from './lib/i18n'

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

const when = (value: string | null, notScheduled: string) => value ? new Date(value).toLocaleString() : notScheduled
const message = (reason: unknown) => reason instanceof Error ? reason.message : 'Request failed'

export type OperationsContentProps = {
  /** When true, omit the page-level header (title, refresh, back link) so the content fits inside a tab. */
  embedded?: boolean
}

export function OperationsContent({ embedded = false }: OperationsContentProps) {
  const { t, operationsCopy } = useLocale()
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

  const refreshAll = () => {
    void load()
    void cyclesPage.refresh()
    void initiativesPage.refresh()
    void rulesPage.refresh()
    void loopsPage.refresh()
    void runsPage.refresh()
    void templatesPage.refresh()
  }

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

  if (!features && !error) return <div className="center"><AsyncStateSurface description={operationsCopy.loadingDescription} state="loading" title={operationsCopy.loading} /></div>
  if (features && !features.has('WORKMESH_BETA_OPERATIONS_UI'))
    return <div className="center" data-testid="operations-disabled"><EmptyState description={operationsCopy.disabledDescription} title={operationsCopy.disabledTitle} /></div>
  return (
    <div className="operations-tab">
      {!embedded && <header className="operations-header">
        <div>
          <a href="/">{operationsCopy.backToWork}</a>
          <h1>{operationsCopy.title}</h1>
          <p>{operationsCopy.subtitle}</p>
        </div>
        <Button onClick={refreshAll}>{operationsCopy.refresh}</Button>
      </header>}
      {embedded && <div className="settings-tab-actions"><Button onClick={refreshAll}>{operationsCopy.refresh}</Button></div>}
      {(error || collectionError) && <ErrorState actionLabel={operationsCopy.retry} description={error || collectionError?.message || operationsCopy.errorDescription} onAction={refreshAll} title={operationsCopy.error} />}
      {data && (
        <>
          {features?.has('WORKMESH_BETA_COSTS') && <section className="operations-metrics" aria-label={operationsCopy.metricsTitle}>
            <article>
              <span>{operationsCopy.metricsKnownCost}</span>
              {data.usage.currency_buckets.length === 0
                ? <strong>{operationsCopy.metricsNoKnownCost}</strong>
                : data.usage.currency_buckets.map(bucket =>
                  <strong key={bucket.currency}>{bucket.known_cost_minor} {bucket.currency}</strong>)}
            </article>
            <article><span>{operationsCopy.metricsUnknownCost}</span><strong>{data.usage.unknown_cost_records}</strong><small>{operationsCopy.metricsNeverTreatedAsZero}</small></article>
            <article><span>{operationsCopy.metricsTokens}</span><strong>{Number(data.usage.input_tokens) + Number(data.usage.output_tokens)}</strong></article>
            <article><span>{operationsCopy.metricsRuntime}</span><strong>{Math.round(Number(data.usage.runtime_ms) / 1000)}s</strong></article>
            <article><span>{operationsCopy.metricsToolCalls}</span><strong>{data.usage.tool_calls}</strong></article>
          </section>}
          <div className="operations-grid">
            {features?.has('WORKMESH_BETA_PLANNING') && <section className="operations-panel" data-testid="cycles-panel">
              <h2>{operationsCopy.cycles}</h2>
              {data.cycles.map(cycle => (
                <article key={cycle.id}>
                  <div><strong>{cycle.name}</strong><span className={`status ${cycle.state}`}>{operationsCopy.cycleState(cycle.state)}</span></div>
                  <p>{operationsCopy.cycleProgress(cycle.completed_items, cycle.total_items)}</p>
                  <small>{when(cycle.starts_at, operationsCopy.notScheduled)} → {when(cycle.ends_at, operationsCopy.notScheduled)}</small>
                </article>
              ))}
              {data.cycles.length === 0 && <EmptyState description={operationsCopy.noCyclesDescription} title={operationsCopy.noCyclesTitle} />}
              <LoadMoreButton collection={cyclesPage} label={operationsCopy.cycles} loadMoreLabel={`${t('loadMore')} ${operationsCopy.cycles}`} />
            </section>}
            {features?.has('WORKMESH_BETA_PLANNING') && <section className="operations-panel" data-testid="initiatives-panel">
              <h2>{operationsCopy.initiatives}</h2>
              {data.initiatives.map(initiative => (
                <article key={initiative.id}>
                  <div><strong>{initiative.name}</strong><span className={`health ${initiative.health}`}>{operationsCopy.initiativeHealth(initiative.health)}</span></div>
                  <p>{operationsCopy.initiativeLine(initiative.status, initiative.priority)}</p>
                </article>
              ))}
              {data.initiatives.length === 0 && <EmptyState description={operationsCopy.noInitiativesDescription} title={operationsCopy.noInitiativesTitle} />}
              <LoadMoreButton collection={initiativesPage} label={operationsCopy.initiatives} loadMoreLabel={`${t('loadMore')} ${operationsCopy.initiatives}`} />
            </section>}
            {features?.has('WORKMESH_EXPERIMENTAL_AUTOMATION') && <section className="operations-panel wide" data-testid="automation-panel">
              <h2>{operationsCopy.automation}</h2>
              {data.rules.map(rule => (
                <article key={rule.id} className="automation-row">
                  <div><strong>{rule.name}</strong><small>{operationsCopy.ruleTrigger(rule.version, rule.trigger.type, rule.trigger.cron)}</small></div>
                  <span className={`status ${rule.state}`}>{operationsCopy.ruleState(rule.state)}</span>
                  <button onClick={() => void dryRun(rule)}>{operationsCopy.dryRun}</button>
                  <button onClick={() => void ruleState(rule)}>{rule.state === 'active' ? operationsCopy.pause : operationsCopy.resume}</button>
                </article>
              ))}
              {data.rules.length === 0 && <EmptyState description={operationsCopy.noRulesDescription} title={operationsCopy.noRulesTitle} />}
              <LoadMoreButton collection={rulesPage} label={operationsCopy.automation} loadMoreLabel={`${t('loadMore')} ${operationsCopy.automation}`} />
            </section>}
            {features?.has('WORKMESH_EXPERIMENTAL_AGENT_LOOPS') && <section className="operations-panel wide" data-testid="loops-panel">
              <h2>{operationsCopy.loops}</h2>
              {data.loops.map(loop => (
                <article key={loop.id} className="automation-row">
                  <div><strong>{loop.name}</strong><small>{operationsCopy.loopNext(when(loop.next_run_at, operationsCopy.notScheduled))} · {loop.no_overlap ? operationsCopy.noOverlap : operationsCopy.overlapAllowed}</small></div>
                  <span className={`status ${loop.state}`}>{operationsCopy.loopState(loop.state)}</span>
                  <button onClick={() => void loopState(loop)}>{loop.state === 'active' ? operationsCopy.pause : operationsCopy.resume}</button>
                </article>
              ))}
              {data.loops.length === 0 && <EmptyState description={operationsCopy.noLoopsDescription} title={operationsCopy.noLoopsTitle} />}
              <LoadMoreButton collection={loopsPage} label={operationsCopy.loops} loadMoreLabel={`${t('loadMore')} ${operationsCopy.loops}`} />
            </section>}
            {features?.has('WORKMESH_EXPERIMENTAL_AUTOMATION') && <section className="operations-panel wide" data-testid="runs-panel">
              <h2>{operationsCopy.runs}</h2>
              <div className="operations-table">
                <div className="table-head"><span>{operationsCopy.run}</span><span>{operationsCopy.kind}</span><span>{operationsCopy.status}</span><span>{operationsCopy.attempts}</span><span>{operationsCopy.session}</span><span>{operationsCopy.created}</span></div>
                {data.runs.map(run => (
                  <div key={run.id}>
                    <code>{run.id.slice(0, 8)}</code>
                    <span>{run.dry_run ? operationsCopy.runKindDryRun : run.loop_id ? operationsCopy.runKindLoop : operationsCopy.runKindRule}</span>
                    <span className={`status ${run.status}`}>{operationsCopy.runState(run.status)}</span>
                    <span>{run.attempt_count}/{run.max_attempts}</span>
                    <code>{run.session_id?.slice(0, 8) ?? '—'}</code>
                    <time>{when(run.created_at, operationsCopy.notScheduled)}</time>
                    {run.last_error && <small className="error">{run.last_error}</small>}
                  </div>
                ))}
              </div>
              {data.runs.length === 0 && <EmptyState description={operationsCopy.noRunsDescription} title={operationsCopy.noRunsTitle} />}
              <LoadMoreButton collection={runsPage} label={operationsCopy.runs} loadMoreLabel={`${t('loadMore')} ${operationsCopy.runs}`} />
            </section>}
            {features?.has('WORKMESH_BETA_TEMPLATES') && <section className="operations-panel wide" data-testid="templates-panel">
              <h2>{operationsCopy.templates}</h2>
              <div className="template-list">
                {data.templates.map(template => (
                  <span key={template.id}>
                    <strong>{template.name}</strong>
                    <small>{operationsCopy.templateLine(template.kind, template.version, template.status)}</small>
                  </span>
                ))}
              </div>
              {data.templates.length === 0 && <EmptyState description={operationsCopy.noTemplatesDescription} title={operationsCopy.noTemplatesTitle} />}
              <LoadMoreButton collection={templatesPage} label={operationsCopy.templates} loadMoreLabel={`${t('loadMore')} ${operationsCopy.templates}`} />
            </section>}
          </div>
        </>
      )}
    </div>
  )
}
