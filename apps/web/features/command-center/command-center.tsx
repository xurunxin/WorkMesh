'use client'

import React, { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Dialog, Input } from '@workmesh/ui'
import type { AuthorizedCommandSnapshot, Command, RecentCommandRef } from './contracts'
import { queryAuthorizedCommands } from './queries'
import { intersectRecent, staticCommands } from './registry'
import { commandCenterViewModel } from './view-model'

const recentStorageKey = 'workmesh.command-center.recent.v1'
const emptySnapshot: AuthorizedCommandSnapshot = { commands: [], errors: [], operationsEnabled: false, sourceStatuses: [], truncatedSources: [] }

function editableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.matches('input, textarea, select, [contenteditable="true"]') || Boolean(target.closest('[contenteditable="true"]'))
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

export function GlobalCommandCenter() {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [snapshot, setSnapshot] = useState<AuthorizedCommandSnapshot>(emptySnapshot)
  const [loading, setLoading] = useState(false)
  const [stale, setStale] = useState(false)
  const [online, setOnline] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const generationRef = useRef(0)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || editableTarget(event.target) || !(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== 'k') return
      event.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => document.getElementById('workmesh-command-center-input')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])
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
    close()
    window.location.assign(command.href)
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
    <Dialog description="Search currently authorized WorkMesh resources and open safe navigation commands." onClose={close} open={open} title="Search WorkMesh">
      <div className="command-center" data-command-state={view.state} data-testid="command-center">
        <label className="command-center-search">Search projects, work items, agents, sessions, and inbox
          <Input aria-activedescendant={active ? `command-${active.id}` : undefined} aria-controls="command-center-results" aria-expanded="true" aria-label="Search WorkMesh" autoComplete="off" id="workmesh-command-center-input" onChange={event => setQuery(event.currentTarget.value)} onKeyDown={move} placeholder="Type a name, key, or command…" role="combobox" value={query} />
        </label>
        <div aria-live="polite" className={`command-center-status state-${view.state}`} role="status">
          <span>{view.statusMessage}</span>
          {(view.state === 'error' || view.state === 'partial') && <Button onClick={() => setRefreshKey(value => value + 1)} type="button" variant="ghost">Retry search</Button>}
        </div>
        {view.sourceNotices.length > 0 && <ul aria-label="Search source status" className="command-center-source-status">
          {view.sourceNotices.map(notice => <li data-source-state={notice.state} key={notice.source}>{notice.message}</li>)}
        </ul>}
        <div className="command-center-results" id="command-center-results" role="listbox">
          {view.groups.map(group => <section aria-label={group.label} className="command-center-group" key={group.id} role="group">
            <h3>{group.label}</h3>
            {group.commands.map(command => {
              const selected = active?.id === command.id
              return <a aria-selected={selected} className={selected ? 'is-active' : undefined} href={command.href} id={`command-${command.id}`} key={`${group.id}:${command.id}`} onClick={() => remember(command)} onMouseEnter={() => setActiveIndex(view.actionable.findIndex(candidate => candidate.id === command.id))} role="option">
                <span><strong>{command.title}</strong>{command.subtitle && <small>{command.subtitle}</small>}</span>
                <em>{command.kind.replaceAll('-', ' ')}</em>
              </a>
            })}
          </section>)}
        </div>
      </div>
    </Dialog>,
    document.body,
  ) : null

  return <>
    <Button aria-keyshortcuts="Control+K Meta+K" className="command-center-trigger" data-testid="command-center-trigger" onClick={() => setOpen(true)} type="button" variant="ghost">
      <span>Search</span><kbd>Ctrl K</kbd>
    </Button>
    {dialog}
  </>
}
