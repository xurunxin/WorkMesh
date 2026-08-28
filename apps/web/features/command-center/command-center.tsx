'use client'

import React, { type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Dialog, Input } from '@workmesh/ui'
import { ArrowClockwise, MagnifyingGlass } from '@phosphor-icons/react'
import type { AuthorizedCommandSnapshot, Command, RecentCommandRef } from './contracts'
import { queryAuthorizedCommands } from './queries'
import { intersectRecent, staticCommands } from './registry'
import { commandCenterViewModel } from './view-model'
import { isInteractiveKeyboardTarget } from '../../app/lib/list-interactions'

const recentStorageKey = 'workmesh.command-center.recent.v1'
const returnFocusStateKey = '__workmeshCommandCenterReturnFocusV1'
const emptySnapshot: AuthorizedCommandSnapshot = { commands: [], errors: [], operationsEnabled: false, sourceStatuses: [], truncatedSources: [] }

type ReturnFocusMarker = Readonly<{ from: string; to: string }>

type CommandCenterLocale = 'zh-CN' | 'en'
const commandCenterText = {
  en: {
    search: 'Search', close: 'Close', title: 'Search WorkMesh', description: 'Search currently authorized WorkMesh resources and open safe navigation commands.', field: 'Search projects, Issues, Agents, sessions, and inbox', placeholder: 'Type a name, key, or command…', retry: 'Retry search', sourceStatus: 'Search source status', offline: 'Offline. Resource results are unavailable until a fresh connection succeeds.', stale: 'Refreshing authority-aware results…', idle: 'Type at least one character to search authorized resources.', ready: 'Type at least one character to search authorized resources.', loading: 'Searching currently authorized WorkMesh resources…', error: 'Resource search is unavailable. Navigation remains available.', partial: 'Partial results. Some sources are unavailable or have more matches.', empty: 'No currently authorized result matches this search.', results: (count: number) => `${count} result${count === 1 ? '' : 's'} available.`,
    groups: { recent: 'Recent', navigation: 'Go to', create: 'Create', projects: 'Projects', 'work-items': 'Issues', agents: 'Agents', sessions: 'Agent sessions', inbox: 'Inbox' },
    sources: { projects: 'Projects', 'work-items': 'Issues', agents: 'Agents', sessions: 'Agent sessions', inbox: 'Inbox' },
    sourceState: { loading: 'loading', empty: 'has no matching results', truncated: 'has more matching results', forbidden: 'is unavailable for this user', error: 'is temporarily unavailable', ready: 'ready' },
    kinds: { navigation: 'navigation', create: 'create', project: 'project', 'work-item': 'Issue', agent: 'Agent', session: 'session', inbox: 'inbox' },
    staticTitles: { 'navigate:inbox': 'Inbox', 'navigate:issues': 'Issues', 'navigate:active-work': 'Issues · Active', 'navigate:backlog': 'Issues · Backlog', 'navigate:projects': 'Projects', 'navigate:agents': 'Agents', 'navigate:settings': 'Settings', 'navigate:operations': 'Planning & Operations', 'create:work-item': 'Create Issue', 'create:project': 'Create project' },
  },
  'zh-CN': {
    search: '搜索', close: '关闭', title: '搜索 WorkMesh', description: '搜索当前有权访问的 WorkMesh 资源，并打开安全的导航命令。', field: '搜索项目、Issue、智能体、会话和收件箱', placeholder: '输入名称、编号或命令…', retry: '重试搜索', sourceStatus: '搜索来源状态', offline: '当前离线。重新连接前无法查询资源。', stale: '正在刷新权限感知的结果…', idle: '输入至少一个字符以搜索有权限访问的资源。', ready: '输入至少一个字符以搜索有权限访问的资源。', loading: '正在搜索当前有权访问的 WorkMesh 资源…', error: '资源搜索暂不可用，导航命令仍可使用。', partial: '结果不完整，部分来源不可用或仍有更多匹配项。', empty: '没有符合搜索条件且有权访问的结果。', results: (count: number) => `找到 ${count} 个结果。`,
    groups: { recent: '最近使用', navigation: '前往', create: '新建', projects: '项目', 'work-items': 'Issues', agents: '智能体', sessions: '智能体会话', inbox: '收件箱' },
    sources: { projects: '项目', 'work-items': 'Issues', agents: '智能体', sessions: '智能体会话', inbox: '收件箱' },
    sourceState: { loading: '正在加载', empty: '没有匹配结果', truncated: '还有更多匹配结果', forbidden: '当前用户无权访问', error: '暂时不可用', ready: '可用' },
    kinds: { navigation: '导航', create: '新建', project: '项目', 'work-item': 'Issue', agent: '智能体', session: '会话', inbox: '收件箱' },
    staticTitles: { 'navigate:inbox': '收件箱', 'navigate:issues': 'Issues', 'navigate:active-work': 'Issues · 活跃', 'navigate:backlog': 'Issues · 待办', 'navigate:projects': '项目', 'navigate:agents': '智能体', 'navigate:settings': '设置', 'navigate:operations': '规划与运营', 'create:work-item': '新建 Issue', 'create:project': '新建项目' },
  },
} as const

function semanticLayerOpen(): boolean {
  return Boolean(document.querySelector('[aria-modal="true"]'))
}

function relativeLocation(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function historyRecord(): Record<string, unknown> {
  const state: unknown = window.history.state
  return state !== null && typeof state === 'object' && !Array.isArray(state)
    ? { ...state as Record<string, unknown> }
    : {}
}

function isReturnFocusMarker(value: unknown): value is ReturnFocusMarker {
  if (value === null || typeof value !== 'object') return false
  const marker = value as Partial<ReturnFocusMarker>
  return typeof marker.from === 'string' && typeof marker.to === 'string'
}

function markCommandCenterNavigation(href: string): void {
  const target = new URL(href, window.location.href)
  if (target.origin !== window.location.origin) return
  const marker: ReturnFocusMarker = {
    from: relativeLocation(),
    to: `${target.pathname}${target.search}${target.hash}`,
  }
  window.history.replaceState({ ...historyRecord(), [returnFocusStateKey]: marker }, '', window.location.href)
}

function consumeReturnFocusMarker(): ReturnFocusMarker | null {
  const state = historyRecord()
  const marker = state[returnFocusStateKey]
  if (!isReturnFocusMarker(marker) || marker.from !== relativeLocation()) return null
  delete state[returnFocusStateKey]
  window.history.replaceState(Object.keys(state).length > 0 ? state : null, '', window.location.href)
  return marker
}

function readRecent(): RecentCommandRef[] {
  if (typeof sessionStorage === 'undefined') return []
  try {
    const value = JSON.parse(sessionStorage.getItem(recentStorageKey) ?? '[]') as unknown
    if (!Array.isArray(value)) return []
    return value.filter((item): item is RecentCommandRef => Boolean(item)
      && typeof item === 'object'
      && typeof (item as RecentCommandRef).id === 'string'
      && typeof (item as RecentCommandRef).kind === 'string'
      && typeof (item as RecentCommandRef).lastUsedAt === 'string').slice(0, 12)
  } catch { return [] }
}

function remember(command: Command): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const entry: RecentCommandRef = { id: command.id, kind: command.kind, lastUsedAt: new Date().toISOString() }
    const next = [entry, ...readRecent().filter(item => item.id !== command.id)].slice(0, 12)
    sessionStorage.setItem(recentStorageKey, JSON.stringify(next))
  } catch { /* Recency is optional and must never block navigation. */ }
}

export type GlobalCommandCenterProps = {
  getLayerOpen?: () => boolean
  triggerLabel?: string
  locale?: CommandCenterLocale
}

export function GlobalCommandCenter({ getLayerOpen = semanticLayerOpen, triggerLabel, locale = 'en' }: GlobalCommandCenterProps) {
  const text = commandCenterText[locale]
  const [mounted, setMounted] = useState(false)
  const [triggerSlot, setTriggerSlot] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [snapshot, setSnapshot] = useState<AuthorizedCommandSnapshot>(emptySnapshot)
  const [loading, setLoading] = useState(false)
  const [stale, setStale] = useState(false)
  const [online, setOnline] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const generationRef = useRef(0)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const openCommandCenter = () => {
    if (getLayerOpen()) return
    setOpen(true)
  }

  useEffect(() => {
    setMounted(true)
    const updateTriggerSlot = () => setTriggerSlot(document.getElementById('workmesh-command-center-trigger-slot'))
    updateTriggerSlot()
    const observer = new MutationObserver(updateTriggerSlot)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const restoreTriggerFocus = () => {
      if (!triggerRef.current) return
      if (!consumeReturnFocusMarker()) return
      const activeElement = document.activeElement
      if (activeElement === triggerRef.current) return
      if (activeElement && activeElement !== document.body && activeElement !== document.documentElement) return
      triggerRef.current?.focus({ preventScroll: true })
    }
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) restoreTriggerFocus()
    }
    restoreTriggerFocus()
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [mounted, triggerSlot])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || isInteractiveKeyboardTarget(event.target) || getLayerOpen()) return
      // Cmd/Ctrl+K — universal palette shortcut.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        openCommandCenter()
        return
      }
      // `/` (forward slash) — slash to open, but only when the key is plain
      // (no modifiers) so browser shortcuts like Ctrl+/ are not swallowed.
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        event.preventDefault()
        openCommandCenter()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [getLayerOpen])
  useEffect(() => {
    const generation = ++generationRef.current
    if (!open || !online) {
      if (!online) { setSnapshot(emptySnapshot); setLoading(false); setStale(false) }
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setStale(snapshot.commands.length > 0)
    const timer = window.setTimeout(() => {
      void queryAuthorizedCommands(query, controller.signal).then(value => {
        if (controller.signal.aborted || generation !== generationRef.current) return
        setSnapshot(value)
        setLoading(false)
        setStale(false)
      }).catch(reason => {
        if (controller.signal.aborted || generation !== generationRef.current || (reason instanceof DOMException && reason.name === 'AbortError')) return
        setSnapshot({ ...emptySnapshot, errors: [{ source: 'identity', message: reason instanceof Error ? reason.message : 'Search failed', state: 'error' }] })
        setLoading(false)
        setStale(false)
      })
    }, 150)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [open, online, query, refreshKey])

  const commands = useMemo(() => {
    const stable = [...staticCommands(snapshot.operationsEnabled), ...snapshot.commands]
    const recent = intersectRecent(readRecent(), stable)
    const recentIds = new Set(recent.map(command => command.id))
    return [...recent, ...stable.filter(command => !recentIds.has(command.id))]
  }, [snapshot])
  const view = useMemo(() => commandCenterViewModel({
    commands,
    errors: snapshot.errors,
    loading,
    offline: !online,
    query,
    sourceStatuses: snapshot.sourceStatuses,
    stale,
    truncatedSources: snapshot.truncatedSources,
  }), [commands, loading, online, query, snapshot.errors, snapshot.sourceStatuses, snapshot.truncatedSources, stale])

  useEffect(() => { setActiveIndex(0) }, [query, view.state])
  const active = view.actionable[activeIndex]
  const close = () => { setOpen(false); setQuery(''); setActiveIndex(0) }
  const activate = (command: Command) => {
    remember(command)
    markCommandCenterNavigation(command.href)
    close()
    window.location.assign(command.href)
  }
  const followLink = (event: ReactMouseEvent<HTMLAnchorElement>, command: Command) => {
    remember(command)
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return
    markCommandCenterNavigation(command.href)
  }
  const move = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex(index => view.actionable.length ? (index + delta + view.actionable.length) % view.actionable.length : 0)
    } else if (event.key === 'Enter' && active) {
      event.preventDefault()
      activate(active)
    }
  }

  const dialog = mounted ? createPortal(
    <Dialog closeLabel={text.close} description={text.description} initialFocusRef={searchInputRef} onClose={close} open={open} title={text.title}>
      <div className="command-center" data-command-state={view.state} data-testid="command-center">
        <label className="command-center-search">{text.field}
          <Input aria-activedescendant={active ? `command-${active.id}` : undefined} aria-controls="command-center-results" aria-expanded="true" aria-label={text.title} autoComplete="off" onChange={event => setQuery(event.currentTarget.value)} onKeyDown={move} placeholder={text.placeholder} ref={searchInputRef} role="combobox" value={query} />
        </label>
        <div aria-live="polite" className={`command-center-status state-${view.state}`} role="status">
          <span>{view.state === 'ready' && query.trim() ? text.results(view.actionable.length) : text[view.state]}</span>
          {(view.state === 'error' || view.state === 'partial') && <Button icon={<ArrowClockwise aria-hidden size={16} />} onClick={() => setRefreshKey(value => value + 1)} type="button" variant="ghost">{text.retry}</Button>}
        </div>
        {view.sourceNotices.length > 0 && <ul aria-label={text.sourceStatus} className="command-center-source-status">
          {view.sourceNotices.map(notice => <li data-source-state={notice.state} key={notice.source}>{text.sources[notice.source]}{locale === 'zh-CN' ? '：' : ': '}{text.sourceState[notice.state]}</li>)}
        </ul>}
        <div className="command-center-results" id="command-center-results" role="listbox">
          {view.groups.map(group => <section aria-label={text.groups[group.id]} className="command-center-group" key={group.id} role="group">
            <h3>{text.groups[group.id]}</h3>
            {group.commands.map(command => {
              const selected = active?.id === command.id
            return <a aria-selected={selected} className={selected ? 'is-active' : undefined} href={command.href} id={`command-${command.id}`} key={`${group.id}:${command.id}`} onClick={event => followLink(event, command)} onMouseEnter={() => setActiveIndex(view.actionable.findIndex(candidate => candidate.id === command.id))} role="option">
                <span><strong>{command.source === 'static' ? text.staticTitles[command.id as keyof typeof text.staticTitles] ?? command.title : command.title}</strong>{command.subtitle && <small>{command.subtitle}</small>}</span>
                <em>{text.kinds[command.kind]}</em>
              </a>
            })}
          </section>)}
        </div>
      </div>
    </Dialog>,
    document.body,
  ) : null

  const trigger = <Button aria-keyshortcuts="Control+K Meta+K" aria-label={triggerLabel ?? text.search} className="command-center-trigger" data-testid="command-center-trigger" icon={<MagnifyingGlass aria-hidden size={16} />} onClick={openCommandCenter} ref={triggerRef} type="button" variant="ghost">
      <span>{triggerLabel ?? text.search}</span><kbd>Ctrl K</kbd>
    </Button>

  return <>
    {mounted ? (triggerSlot ? createPortal(trigger, triggerSlot) : trigger) : null}
    {dialog}
  </>
}
