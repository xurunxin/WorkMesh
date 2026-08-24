'use client'

import { type ChangeEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, EmptyState, ErrorState } from '@workmesh/ui'
import { ApiError, apiRequest, json } from './lib/api'
import { isCollectionAuthorityRevoked } from './lib/collection-authority'
import { LoadMoreButton, usePagedApiList } from './lib/pagination'
import { SkeletonList } from './lib/skeleton-list'
import { type Locale, useLocale } from './lib/i18n'
import { matchesOperationsQuery, readOperationsQuery } from './operations/filter'
import { runDisplayValues, RunsTable, type OperationsRun } from './operations/runs-table'
import { type OperationsSectionId, visibleOperationsSections } from './operations/sections'
import { UsageMetrics } from './operations/usage-metrics'
import { useToast } from './lib/use-toast'
import { useAuthorityLifetime } from './lib/use-authority-lifetime'

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
type Cycle = {
  id: string
  name: string
  state: 'current' | 'upcoming' | 'history'
  starts_at: string
  ends_at: string
  total_items: number
  completed_items: number
}
type Initiative = {
  id: string
  name: string
  status: 'planned' | 'active' | 'paused' | 'completed' | 'canceled'
  priority: 'none' | 'low' | 'medium' | 'high' | 'urgent'
  health: 'on_track' | 'at_risk' | 'off_track' | 'unknown'
}
type Template = {
  id: string
  kind: 'work_item' | 'project' | 'agent_run' | 'handoff' | 'automation'
  name: string
  status: 'draft' | 'active' | 'archived'
  version: number
}
type FeatureRegistry = {
  features: Array<{ key: string; tier: 'beta' | 'experimental'; enabled: boolean }>
}
type UsageLoadState = Readonly<{
  error: Error | null
  initialized: boolean
  loading: boolean
  value: unknown
}>

const when = (value: string | null, notScheduled: string, locale: Locale) =>
  value ? new Date(value).toLocaleString(locale) : notScheduled
const message = (reason: unknown) => reason instanceof Error ? reason.message : 'Request failed'
const OPERATIONS_AUTHORITY_HISTORY_KEY = 'workmeshOperationsAuthorityKey'

export function shouldReanchorOperationsSection(input: Readonly<{
  embedded: boolean
  hash: string
  layoutDidInitialize: boolean
  section: OperationsSectionId | null
  targetIsActive: boolean
}>): boolean {
  if (input.embedded || !input.layoutDidInitialize || !input.section || !input.targetIsActive) return false
  return input.hash === `#operations-${input.section}`
}

export type OperationsContentProps = {
  /** When true, omit the page-level header (title, refresh, back link) so the content fits inside a tab. */
  embedded?: boolean
  /** Non-secret authenticated authority tuple. A changed tuple synchronously retires every retained projection. */
  authorityKey: string | null
}

export function OperationsContent(props: OperationsContentProps) {
  const { operationsCopy } = useLocale()
  if (props.authorityKey === null)
    return <div className="operations-loading"><SkeletonList columns={2} items={6} label={operationsCopy.loading} /></div>
  return <OperationsContentScope key={props.authorityKey} {...props} authorityKey={props.authorityKey} />
}

function OperationsContentScope({ authorityKey, embedded = false }: OperationsContentProps & { authorityKey: string }) {
  const { locale, t, operationsCopy, toastCopy } = useLocale()
  const { push: pushToast } = useToast()
  const isAuthorityCurrent = useAuthorityLifetime()
  const rootRef = useRef<HTMLDivElement>(null)
  const [usageState, setUsageState] = useState<UsageLoadState>({ error: null, initialized: false, loading: false, value: null })
  const [featuresLoading, setFeaturesLoading] = useState(false)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [mutationError, setMutationError] = useState('')
  const [features, setFeatures] = useState<Set<string> | null>(null)
  const [currentSection, setCurrentSection] = useState<OperationsSectionId | null>(null)
  const [query, setQuery] = useState('')
  const loadGenerationRef = useRef(0)
  const loadControllerRef = useRef<AbortController | null>(null)
  const costsScopeActiveRef = useRef(false)
  const initialSectionFocusRef = useRef(false)
  const sectionInitializationRef = useRef<Readonly<Record<OperationsSectionId, boolean>> | null>(null)
  const operationsEnabled = features?.has('WORKMESH_BETA_OPERATIONS_UI') ?? false
  const visibleSections = useMemo(
    () => features ? visibleOperationsSections(features) : [],
    [features],
  )
  const cyclesPage = usePagedApiList<Cycle>(
    operationsEnabled && features?.has('WORKMESH_BETA_PLANNING') ? '/api/v1/cycles' : null,
    { scopeKey: authorityKey },
  )
  const initiativesPage = usePagedApiList<Initiative>(
    operationsEnabled && features?.has('WORKMESH_BETA_PLANNING') ? '/api/v1/initiatives' : null,
    { scopeKey: authorityKey },
  )
  const rulesPage = usePagedApiList<Rule>(
    operationsEnabled && features?.has('WORKMESH_EXPERIMENTAL_AUTOMATION') ? '/api/v1/automation-rules' : null,
    { scopeKey: authorityKey },
  )
  const loopsPage = usePagedApiList<Loop>(
    operationsEnabled && features?.has('WORKMESH_EXPERIMENTAL_AGENT_LOOPS') ? '/api/v1/loops' : null,
    { scopeKey: authorityKey },
  )
  const runsPage = usePagedApiList<OperationsRun>(
    operationsEnabled && features?.has('WORKMESH_EXPERIMENTAL_AUTOMATION') ? '/api/v1/automation-runs' : null,
    { scopeKey: authorityKey },
  )
  const templatesPage = usePagedApiList<Template>(
    operationsEnabled && features?.has('WORKMESH_BETA_TEMPLATES') ? '/api/v1/templates' : null,
    { scopeKey: authorityKey },
  )
  const cyclesAuthorized = !isCollectionAuthorityRevoked(cyclesPage.error)
  const initiativesAuthorized = !isCollectionAuthorityRevoked(initiativesPage.error)
  const rulesAuthorized = !isCollectionAuthorityRevoked(rulesPage.error)
  const loopsAuthorized = !isCollectionAuthorityRevoked(loopsPage.error)
  const runsAuthorized = !isCollectionAuthorityRevoked(runsPage.error)
  const templatesAuthorized = !isCollectionAuthorityRevoked(templatesPage.error)
  const cyclesInitialized = cyclesPage.initialized && cyclesAuthorized
  const initiativesInitialized = initiativesPage.initialized && initiativesAuthorized
  const rulesInitialized = rulesPage.initialized && rulesAuthorized
  const loopsInitialized = loopsPage.initialized && loopsAuthorized
  const runsInitialized = runsPage.initialized && runsAuthorized
  const templatesInitialized = templatesPage.initialized && templatesAuthorized
  const cycles = cyclesAuthorized ? cyclesPage.items : []
  const initiatives = initiativesAuthorized ? initiativesPage.items : []
  const rules = rulesAuthorized ? rulesPage.items : []
  const loops = loopsAuthorized ? loopsPage.items : []
  const runs = runsAuthorized ? runsPage.items : []
  const templates = templatesAuthorized ? templatesPage.items : []
  const sectionsReady = operationsEnabled
  const sectionInitialization = useMemo<Readonly<Record<OperationsSectionId, boolean>>>(() => ({
    automation: rulesInitialized,
    cycles: cyclesInitialized,
    initiatives: initiativesInitialized,
    loops: loopsInitialized,
    metrics: usageState.initialized,
    runs: runsInitialized,
    templates: templatesInitialized,
  }), [
    cyclesInitialized,
    initiativesInitialized,
    loopsInitialized,
    rulesInitialized,
    runsInitialized,
    templatesInitialized,
    usageState.initialized,
  ])
  const load = useCallback(async () => {
    const generation = loadGenerationRef.current + 1
    loadGenerationRef.current = generation
    loadControllerRef.current?.abort()
    const controller = new AbortController()
    loadControllerRef.current = controller
    setFeaturesLoading(true)
    setUsageState(current => ({ ...current, loading: false }))
    try {
      setLoadError(null)
      const registry = await apiRequest<FeatureRegistry>('/api/v1/features', { signal: controller.signal })
      if (!isAuthorityCurrent() || controller.signal.aborted || generation !== loadGenerationRef.current) return
      const enabled = new Set(registry.features.filter(feature => feature.enabled).map(feature => feature.key))
      setFeatures(enabled)
      setFeaturesLoading(false)
      if (!enabled.has('WORKMESH_BETA_OPERATIONS_UI')) {
        costsScopeActiveRef.current = false
        setUsageState({ error: null, initialized: false, loading: false, value: null })
        return
      }
      if (!enabled.has('WORKMESH_BETA_COSTS')) {
        costsScopeActiveRef.current = false
        setUsageState({ error: null, initialized: false, loading: false, value: null })
        return
      }
      const sameCostsScope = costsScopeActiveRef.current
      costsScopeActiveRef.current = true
      setUsageState(current => sameCostsScope
        ? { ...current, error: null, loading: true }
        : { error: null, initialized: false, loading: true, value: null })
      try {
        const nextUsage = await apiRequest<unknown>('/api/v1/usage-summary', { signal: controller.signal })
        if (!isAuthorityCurrent() || controller.signal.aborted || generation !== loadGenerationRef.current) return
        setUsageState({ error: null, initialized: true, loading: false, value: nextUsage })
      } catch (reason) {
        if (!isAuthorityCurrent() || controller.signal.aborted || generation !== loadGenerationRef.current) return
        const nextError = reason instanceof Error ? reason : new Error('Request failed')
        setUsageState(current => isCollectionAuthorityRevoked(nextError)
          ? { error: nextError, initialized: false, loading: false, value: null }
          : { ...current, error: nextError, loading: false })
      }
    } catch (reason) {
      if (!isAuthorityCurrent() || controller.signal.aborted || generation !== loadGenerationRef.current) return
      const nextError = reason instanceof Error ? reason : new Error('Request failed')
      setFeaturesLoading(false)
      setLoadError(nextError)
      if (isCollectionAuthorityRevoked(nextError)) {
        costsScopeActiveRef.current = false
        setFeatures(null)
        setUsageState({ error: null, initialized: false, loading: false, value: null })
      }
    }
  }, [isAuthorityCurrent])
  useEffect(() => {
    void load()
    return () => {
      loadGenerationRef.current += 1
      loadControllerRef.current?.abort()
    }
  }, [load])

  useEffect(() => {
    const readFromUrl = () => {
      const historyState = window.history.state && typeof window.history.state === 'object'
        ? window.history.state as Record<string, unknown>
        : {}
      const routeAuthority = historyState[OPERATIONS_AUTHORITY_HISTORY_KEY]
      if (typeof routeAuthority === 'string' && routeAuthority !== authorityKey) {
        const url = new URL(window.location.href)
        url.searchParams.delete('opsQuery')
        window.history.replaceState({ ...historyState, [OPERATIONS_AUTHORITY_HISTORY_KEY]: authorityKey }, '', url)
        setQuery('')
        return
      }
      if (routeAuthority === undefined)
        window.history.replaceState({ ...historyState, [OPERATIONS_AUTHORITY_HISTORY_KEY]: authorityKey }, '', window.location.href)
      setQuery(readOperationsQuery(window.location.search))
    }
    const synchronizeHistory = () => {
      const parameters = new URLSearchParams(window.location.search)
      const sameOperationsTab = embedded
        ? window.location.pathname === '/settings' && parameters.get('tab') === 'operations'
        : window.location.pathname === '/operations'
      if (!sameOperationsTab || rootRef.current?.closest('[hidden]')) return
      readFromUrl()
    }
    readFromUrl()
    window.addEventListener('popstate', synchronizeHistory)
    return () => window.removeEventListener('popstate', synchronizeHistory)
  }, [authorityKey, embedded])

  const updateQuery = (event: ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.currentTarget.value
    const trimmed = nextQuery.trim()
    const url = new URL(window.location.href)
    if (trimmed) url.searchParams.set('opsQuery', trimmed)
    else url.searchParams.delete('opsQuery')
    setQuery(nextQuery)
    const historyState = window.history.state && typeof window.history.state === 'object'
      ? window.history.state as Record<string, unknown>
      : {}
    window.history.replaceState({ ...historyState, [OPERATIONS_AUTHORITY_HISTORY_KEY]: authorityKey }, '', url)
  }

  const cycleRows = cycles.map(item => {
    const state = operationsCopy.cycleState(item.state)
    const progress = operationsCopy.cycleProgress(item.completed_items, item.total_items)
    const schedule = `${when(item.starts_at, operationsCopy.notScheduled, locale)} → ${when(item.ends_at, operationsCopy.notScheduled, locale)}`
    return { item, state, progress, schedule, values: [item.name, state, progress, schedule] as const }
  })
  const initiativeRows = initiatives.map(item => {
    const health = operationsCopy.initiativeHealth(item.health)
    const line = operationsCopy.initiativeLine(
      operationsCopy.initiativeStatus(item.status),
      operationsCopy.initiativePriority(item.priority),
    )
    return { item, health, line, values: [item.name, health, line] as const }
  })
  const ruleRows = rules.map(item => {
    const state = operationsCopy.ruleState(item.state)
    const trigger = operationsCopy.ruleTrigger(item.version, item.trigger.type, item.trigger.cron)
    return { item, state, trigger, values: [item.name, state, trigger] as const }
  })
  const loopRows = loops.map(item => {
    const state = operationsCopy.loopState(item.state)
    const schedule = `${operationsCopy.loopNext(when(item.next_run_at, operationsCopy.notScheduled, locale))} · ${item.no_overlap ? operationsCopy.noOverlap : operationsCopy.overlapAllowed}`
    return { item, state, schedule, values: [item.name, state, schedule] as const }
  })
  const templateRows = templates.map(item => {
    const line = operationsCopy.templateLine(
      operationsCopy.templateKind(item.kind),
      item.version,
      operationsCopy.templateStatus(item.status),
    )
    return { item, line, values: [item.name, line] as const }
  })
  const filteredCycles = cycleRows.filter(row => matchesOperationsQuery(query, row.values))
  const filteredInitiatives = initiativeRows.filter(row => matchesOperationsQuery(query, row.values))
  const filteredRules = ruleRows.filter(row => matchesOperationsQuery(query, row.values))
  const filteredLoops = loopRows.filter(row => matchesOperationsQuery(query, row.values))
  const filteredRuns = runs.filter(item =>
    matchesOperationsQuery(query, runDisplayValues(item, locale, operationsCopy).values),
  )
  const filteredTemplates = templateRows.filter(row => matchesOperationsQuery(query, row.values))
  const collectionRefreshBusy = [
    cyclesPage, initiativesPage, rulesPage, loopsPage, runsPage, templatesPage,
  ].some(page => page.initialized && (page.loading || page.loadingMore))
  const refreshBusy = (features !== null && featuresLoading)
    || (usageState.initialized && usageState.loading)
    || collectionRefreshBusy

  const focusSection = useCallback((section: OperationsSectionId) => {
    const target = document.getElementById(`operations-${section}`)
    if (!target || target.closest('[hidden]')) return
    target.scrollIntoView({ block: 'start' })
    target.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!sectionsReady || visibleSections.length === 0) {
      setCurrentSection(null)
      return
    }
    const root = rootRef.current
    const tabPanel = root?.closest<HTMLElement>('[role="tabpanel"]') ?? null
    const synchronize = (allowStandaloneFocus: boolean) => {
      if (root?.closest('[hidden]')) {
        setCurrentSection(null)
        return
      }
      const section = visibleSections.find(candidate => window.location.hash === `#operations-${candidate}`) ?? null
      setCurrentSection(section)
      if (section && !embedded && allowStandaloneFocus) focusSection(section)
    }
    const allowInitialFocus = !initialSectionFocusRef.current
    synchronize(allowInitialFocus)
    initialSectionFocusRef.current = true
    const synchronizeFromNavigation = () => synchronize(true)
    const synchronizeFromVisibility = () => synchronize(false)
    window.addEventListener('hashchange', synchronizeFromNavigation)
    window.addEventListener('popstate', synchronizeFromNavigation)
    const visibilityObserver = tabPanel ? new MutationObserver(synchronizeFromVisibility) : null
    if (visibilityObserver && tabPanel)
      visibilityObserver.observe(tabPanel, { attributeFilter: ['hidden'], attributes: true })
    return () => {
      window.removeEventListener('hashchange', synchronizeFromNavigation)
      window.removeEventListener('popstate', synchronizeFromNavigation)
      visibilityObserver?.disconnect()
    }
  }, [embedded, focusSection, sectionsReady, visibleSections])

  useEffect(() => {
    const previous = sectionInitializationRef.current
    sectionInitializationRef.current = sectionInitialization
    if (!previous) return
    const layoutDidInitialize = visibleSections.some(section =>
      !previous[section] && sectionInitialization[section])
    const section = visibleSections.find(candidate => window.location.hash === `#operations-${candidate}`) ?? null
    const target = section ? document.getElementById(`operations-${section}`) : null
    if (shouldReanchorOperationsSection({
      embedded,
      hash: window.location.hash,
      layoutDidInitialize,
      section,
      targetIsActive: target !== null && document.activeElement === target,
    })) target?.scrollIntoView({ block: 'start' })
  }, [embedded, sectionInitialization, visibleSections])

  const activateSection = (event: MouseEvent<HTMLAnchorElement>, section: OperationsSectionId) => {
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    setCurrentSection(section)
    focusSection(section)
  }

  const refreshAll = () => {
    setMutationError('')
    void load()
    void cyclesPage.refresh()
    void initiativesPage.refresh()
    void rulesPage.refresh()
    void loopsPage.refresh()
    void runsPage.refresh()
    void templatesPage.refresh()
  }

  const ruleState = async (rule: Rule) => {
    setMutationError('')
    try {
      await apiRequest(`/api/v1/automation-rules/${rule.id}/state`, {
        method: 'POST',
        headers: { ...json({}), 'If-Match': `"revision-${rule.revision}"` },
        body: JSON.stringify({ state: rule.state === 'active' ? 'paused' : 'active' }),
      })
      if (!isAuthorityCurrent()) return
      await rulesPage.refresh()
      if (!isAuthorityCurrent()) return
    } catch (reason) {
      if (isAuthorityCurrent()) setMutationError(message(reason))
    }
  }
  const loopState = async (loop: Loop) => {
    setMutationError('')
    try {
      await apiRequest(`/api/v1/loops/${loop.id}/state`, {
        method: 'POST',
        headers: { ...json({}), 'If-Match': `"revision-${loop.revision}"` },
        body: JSON.stringify({ state: loop.state === 'active' ? 'paused' : 'active' }),
      })
      if (!isAuthorityCurrent()) return
      await loopsPage.refresh()
      if (!isAuthorityCurrent()) return
    } catch (reason) {
      if (isAuthorityCurrent()) setMutationError(message(reason))
    }
  }
  const dryRun = async (rule: Rule) => {
    setMutationError('')
    try {
      await apiRequest(`/api/v1/automation-rules/${rule.id}/dry-run`, {
        method: 'POST',
        headers: json({}),
        body: JSON.stringify({
          occurrenceKey: `ui:${crypto.randomUUID()}`,
          payload: { source: 'operations-ui' },
        }),
      })
      if (!isAuthorityCurrent()) return
      pushToast({
        dedupeKey: `operations:dry-run:${rule.id}`,
        description: toastCopy.dryRunStartedDescription(rule.name),
        title: toastCopy.dryRunStartedTitle,
        tone: 'success',
      })
      try {
        await runsPage.refresh()
      } catch {
        if (isAuthorityCurrent()) setLoadError(new Error(operationsCopy.errorDescription))
      }
    } catch (reason) {
      if (!isAuthorityCurrent()) return
      if (reason instanceof ApiError && reason.status < 500 && ![408, 425, 429].includes(reason.status)) {
        setMutationError(message(reason))
      } else {
        pushToast({
          dedupeKey: `operations:dry-run:${rule.id}`,
          description: toastCopy.dryRunFailedDescription,
          title: toastCopy.dryRunFailedTitle,
          tone: 'error',
        })
      }
    }
  }

  const sectionLabels: Record<OperationsSectionId, string> = {
    metrics: operationsCopy.metricsTitle,
    cycles: operationsCopy.cycles,
    initiatives: operationsCopy.initiatives,
    automation: operationsCopy.automation,
    loops: operationsCopy.loops,
    runs: operationsCopy.runs,
    templates: operationsCopy.templates,
  }
  return (
    <div aria-busy={refreshBusy || undefined} className="operations-tab" ref={rootRef}>
      {!embedded && <header className="operations-header">
        <div>
          <a href="/">{operationsCopy.backToWork}</a>
          <h1>{operationsCopy.title}</h1>
          <p>{operationsCopy.subtitle}</p>
        </div>
        <Button onClick={refreshAll}>{operationsCopy.refresh}</Button>
      </header>}
      {embedded && <div className="settings-tab-heading"><h2>{operationsCopy.title}</h2><div className="settings-tab-actions"><Button onClick={refreshAll}>{operationsCopy.refresh}</Button></div></div>}
      {refreshBusy && <span aria-live="polite" className="sr-only" role="status">{operationsCopy.loading}</span>}
      {(mutationError || loadError) && <ErrorState actionLabel={operationsCopy.retry} description={mutationError || operationsCopy.errorDescription} onAction={refreshAll} title={operationsCopy.error} />}
      {!features && !loadError && <div className="operations-loading"><SkeletonList columns={2} items={6} label={operationsCopy.loading} /></div>}
      {features && !operationsEnabled && <div className="center" data-testid="operations-disabled"><EmptyState description={operationsCopy.disabledDescription} title={operationsCopy.disabledTitle} /></div>}
      {operationsEnabled && visibleSections.length === 0 && (
        <div className="operations-sections-empty" data-testid="operations-sections-empty">
          <EmptyState description={operationsCopy.noSectionsDescription} title={operationsCopy.noSectionsTitle} />
        </div>
      )}
      {operationsEnabled && (
        <>
          {visibleSections.some(section => section !== 'metrics') && (
            <div className="operations-search" data-testid="operations-search">
              <label htmlFor="operations-loaded-search">{operationsCopy.searchLabel}</label>
              <input
                aria-describedby="operations-search-description"
                data-hotkey-filter="true"
                id="operations-loaded-search"
                onChange={updateQuery}
                placeholder={operationsCopy.searchPlaceholder}
                type="search"
                value={query}
              />
              <small id="operations-search-description">{operationsCopy.searchDescription}</small>
            </div>
          )}
          {visibleSections.length > 0 && <nav aria-label={operationsCopy.sectionNavigation} className="operations-section-navigation" data-testid="operations-section-navigation">
            {visibleSections.map(section => (
              <a
                aria-current={currentSection === section ? 'location' : undefined}
                href={`#operations-${section}`}
                key={section}
                onClick={event => activateSection(event, section)}
              >
                {sectionLabels[section]}
              </a>
            ))}
          </nav>}
          {features?.has('WORKMESH_BETA_COSTS') && <section aria-busy={usageState.initialized && usageState.loading || undefined} className="operations-metrics operations-section-target" aria-label={operationsCopy.metricsTitle} id="operations-metrics" tabIndex={-1}>
            {usageState.error && <ErrorState actionLabel={operationsCopy.retry} description={operationsCopy.errorDescription} onAction={() => void load()} title={operationsCopy.error} />}
            {!usageState.initialized
              ? (usageState.error ? null : <div className="operations-usage-loading"><SkeletonList columns={5} items={5} label={operationsCopy.loading} /></div>)
              : <UsageMetrics copy={operationsCopy} locale={locale} usage={usageState.value} />}
          </section>}
          {visibleSections.some(section => section !== 'metrics') && <div className="operations-grid">
            {features?.has('WORKMESH_BETA_PLANNING') && <section aria-busy={cyclesInitialized && (cyclesPage.loading || cyclesPage.loadingMore) || undefined} className="operations-panel operations-section-target" data-testid="cycles-panel" id="operations-cycles" tabIndex={-1}>
              <h2>{operationsCopy.cycles}</h2>
              {cyclesPage.error && <ErrorState actionLabel={operationsCopy.retry} description={operationsCopy.errorDescription} onAction={() => void cyclesPage.refresh()} title={operationsCopy.error} />}
              {!cyclesInitialized
                ? (cyclesPage.error ? null : <SkeletonList columns={1} items={3} label={operationsCopy.collectionLoading(operationsCopy.cycles)} />)
                : <>{filteredCycles.map(row => (
                <article key={row.item.id}>
                  <div><strong>{row.item.name}</strong><span className={`status ${row.item.state}`}>{row.state}</span></div>
                  <p>{row.progress}</p>
                  <small>{row.schedule}</small>
                </article>
              ))}
              {cycles.length === 0 && !cyclesPage.nextCursor && <EmptyState description={operationsCopy.noCyclesDescription} title={operationsCopy.noCyclesTitle} />}
              {filteredCycles.length === 0 && (cycles.length > 0 || cyclesPage.nextCursor) && <EmptyState description={operationsCopy.noMatchesDescription(query.trim())} title={operationsCopy.noMatchesTitle(operationsCopy.cycles)} />}
              <LoadMoreButton collection={cyclesPage} label={operationsCopy.cycles} loadMoreLabel={`${t('loadMore')} ${operationsCopy.cycles}`} />
              </>}
            </section>}
            {features?.has('WORKMESH_BETA_PLANNING') && <section aria-busy={initiativesInitialized && (initiativesPage.loading || initiativesPage.loadingMore) || undefined} className="operations-panel operations-section-target" data-testid="initiatives-panel" id="operations-initiatives" tabIndex={-1}>
              <h2>{operationsCopy.initiatives}</h2>
              {initiativesPage.error && <ErrorState actionLabel={operationsCopy.retry} description={operationsCopy.errorDescription} onAction={() => void initiativesPage.refresh()} title={operationsCopy.error} />}
              {!initiativesInitialized
                ? (initiativesPage.error ? null : <SkeletonList columns={1} items={3} label={operationsCopy.collectionLoading(operationsCopy.initiatives)} />)
                : <>{filteredInitiatives.map(row => (
                <article key={row.item.id}>
                  <div><strong>{row.item.name}</strong><span className={`health ${row.item.health}`}>{row.health}</span></div>
                  <p>{row.line}</p>
                </article>
              ))}
              {initiatives.length === 0 && !initiativesPage.nextCursor && <EmptyState description={operationsCopy.noInitiativesDescription} title={operationsCopy.noInitiativesTitle} />}
              {filteredInitiatives.length === 0 && (initiatives.length > 0 || initiativesPage.nextCursor) && <EmptyState description={operationsCopy.noMatchesDescription(query.trim())} title={operationsCopy.noMatchesTitle(operationsCopy.initiatives)} />}
              <LoadMoreButton collection={initiativesPage} label={operationsCopy.initiatives} loadMoreLabel={`${t('loadMore')} ${operationsCopy.initiatives}`} />
              </>}
            </section>}
            {features?.has('WORKMESH_EXPERIMENTAL_AUTOMATION') && <section aria-busy={rulesInitialized && (rulesPage.loading || rulesPage.loadingMore) || undefined} className="operations-panel operations-section-target wide" data-testid="automation-panel" id="operations-automation" tabIndex={-1}>
              <h2>{operationsCopy.automation}</h2>
              {rulesPage.error && <ErrorState actionLabel={operationsCopy.retry} description={operationsCopy.errorDescription} onAction={() => void rulesPage.refresh()} title={operationsCopy.error} />}
              {!rulesInitialized
                ? (rulesPage.error ? null : <SkeletonList columns={1} items={4} label={operationsCopy.collectionLoading(operationsCopy.automation)} />)
                : <>{filteredRules.map(row => (
                <article key={row.item.id} className="automation-row">
                  <div><strong>{row.item.name}</strong><small>{row.trigger}</small></div>
                  <span className={`status ${row.item.state}`}>{row.state}</span>
                  <button onClick={() => void dryRun(row.item)}>{operationsCopy.dryRun}</button>
                  <button onClick={() => void ruleState(row.item)}>{row.item.state === 'active' ? operationsCopy.pause : operationsCopy.resume}</button>
                </article>
              ))}
              {rules.length === 0 && !rulesPage.nextCursor && <EmptyState description={operationsCopy.noRulesDescription} title={operationsCopy.noRulesTitle} />}
              {filteredRules.length === 0 && (rules.length > 0 || rulesPage.nextCursor) && <EmptyState description={operationsCopy.noMatchesDescription(query.trim())} title={operationsCopy.noMatchesTitle(operationsCopy.automation)} />}
              <LoadMoreButton collection={rulesPage} label={operationsCopy.automation} loadMoreLabel={`${t('loadMore')} ${operationsCopy.automation}`} />
              </>}
            </section>}
            {features?.has('WORKMESH_EXPERIMENTAL_AGENT_LOOPS') && <section aria-busy={loopsInitialized && (loopsPage.loading || loopsPage.loadingMore) || undefined} className="operations-panel operations-section-target wide" data-testid="loops-panel" id="operations-loops" tabIndex={-1}>
              <h2>{operationsCopy.loops}</h2>
              {loopsPage.error && <ErrorState actionLabel={operationsCopy.retry} description={operationsCopy.errorDescription} onAction={() => void loopsPage.refresh()} title={operationsCopy.error} />}
              {!loopsInitialized
                ? (loopsPage.error ? null : <SkeletonList columns={1} items={4} label={operationsCopy.collectionLoading(operationsCopy.loops)} />)
                : <>{filteredLoops.map(row => (
                <article key={row.item.id} className="automation-row">
                  <div><strong>{row.item.name}</strong><small>{row.schedule}</small></div>
                  <span className={`status ${row.item.state}`}>{row.state}</span>
                  <button onClick={() => void loopState(row.item)}>{row.item.state === 'active' ? operationsCopy.pause : operationsCopy.resume}</button>
                </article>
              ))}
              {loops.length === 0 && !loopsPage.nextCursor && <EmptyState description={operationsCopy.noLoopsDescription} title={operationsCopy.noLoopsTitle} />}
              {filteredLoops.length === 0 && (loops.length > 0 || loopsPage.nextCursor) && <EmptyState description={operationsCopy.noMatchesDescription(query.trim())} title={operationsCopy.noMatchesTitle(operationsCopy.loops)} />}
              <LoadMoreButton collection={loopsPage} label={operationsCopy.loops} loadMoreLabel={`${t('loadMore')} ${operationsCopy.loops}`} />
              </>}
            </section>}
            {features?.has('WORKMESH_EXPERIMENTAL_AUTOMATION') && <section aria-busy={runsInitialized && (runsPage.loading || runsPage.loadingMore) || undefined} className="operations-panel operations-section-target wide" data-testid="runs-panel" id="operations-runs" tabIndex={-1}>
              <h2>{operationsCopy.runs}</h2>
              {runsPage.error && <ErrorState actionLabel={operationsCopy.retry} description={operationsCopy.errorDescription} onAction={() => void runsPage.refresh()} title={operationsCopy.error} />}
              {!runsInitialized
                ? (runsPage.error ? null : <SkeletonList columns={1} items={4} label={operationsCopy.collectionLoading(operationsCopy.runs)} />)
                : <><RunsTable copy={operationsCopy} locale={locale} runs={filteredRuns} />
              {runs.length === 0 && !runsPage.nextCursor && <EmptyState description={operationsCopy.noRunsDescription} title={operationsCopy.noRunsTitle} />}
              {filteredRuns.length === 0 && (runs.length > 0 || runsPage.nextCursor) && <EmptyState description={operationsCopy.noMatchesDescription(query.trim())} title={operationsCopy.noMatchesTitle(operationsCopy.runs)} />}
              <LoadMoreButton collection={runsPage} label={operationsCopy.runs} loadMoreLabel={`${t('loadMore')} ${operationsCopy.runs}`} />
              </>}
            </section>}
            {features?.has('WORKMESH_BETA_TEMPLATES') && <section aria-busy={templatesInitialized && (templatesPage.loading || templatesPage.loadingMore) || undefined} className="operations-panel operations-section-target wide" data-testid="templates-panel" id="operations-templates" tabIndex={-1}>
              <h2>{operationsCopy.templates}</h2>
              {templatesPage.error && <ErrorState actionLabel={operationsCopy.retry} description={operationsCopy.errorDescription} onAction={() => void templatesPage.refresh()} title={operationsCopy.error} />}
              {!templatesInitialized
                ? (templatesPage.error ? null : <div className="operations-template-loading"><SkeletonList columns={4} items={4} label={operationsCopy.collectionLoading(operationsCopy.templates)} /></div>)
                : <>
              <div className="template-list">
                {filteredTemplates.map(row => (
                  <span key={row.item.id}>
                    <strong>{row.item.name}</strong>
                    <small>{row.line}</small>
                  </span>
                ))}
              </div>
              {templates.length === 0 && !templatesPage.nextCursor && <EmptyState description={operationsCopy.noTemplatesDescription} title={operationsCopy.noTemplatesTitle} />}
              {filteredTemplates.length === 0 && (templates.length > 0 || templatesPage.nextCursor) && <EmptyState description={operationsCopy.noMatchesDescription(query.trim())} title={operationsCopy.noMatchesTitle(operationsCopy.templates)} />}
              <LoadMoreButton collection={templatesPage} label={operationsCopy.templates} loadMoreLabel={`${t('loadMore')} ${operationsCopy.templates}`} />
              </>}
            </section>}
          </div>}
        </>
      )}
    </div>
  )
}
