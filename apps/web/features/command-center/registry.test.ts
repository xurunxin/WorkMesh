import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  GlobalCommandCenter,
  agentCommand,
  commandCenterViewModel,
  groupCommands,
  intersectRecent,
  projectCommand,
  rankCommands,
  staticCommands,
  workItemCommand,
  type Command,
  type RecentCommandRef,
} from './index'

describe('authority-aware command registry', () => {
  it('keeps Operations feature-gated and create commands navigation-only', () => {
    expect(staticCommands(false).some(command => command.id === 'navigate:operations')).toBe(false)
    const enabled = staticCommands(true)
    expect(enabled.find(command => command.id === 'navigate:operations')?.href).toBe('/operations')
    expect(enabled.filter(command => command.kind === 'create')).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'create:work-item', href: '/?view=my-work&intent=create-work-item', source: 'static' }),
      expect.objectContaining({ id: 'create:project', href: '/?view=projects&intent=create-project', source: 'static' }),
    ]))
  })

  it('builds stable authority-neutral resource routes', () => {
    expect(projectCommand({ id: 'project-1', name: 'Roadmap' })).toMatchObject({
      id: 'resource:project:project-1',
      href: '/?view=projects&project=project-1',
    })
    expect(workItemCommand({ id: 'item-1', title: 'Ship', number: 6, team_key: 'GEN', project_id: null })).toMatchObject({
      id: 'resource:work-item:item-1',
      href: '/?workItem=item-1',
    })
    expect(agentCommand({ id: 'agent-1', name: 'Codex', slug: 'codex' }).href).toBe('/agents/agent-1')
    expect(agentCommand({ id: 'agent/1', name: 'Codex', slug: 'codex' }).href).toBe('/agents/agent%2F1')
    expect(agentCommand({ id: 'agent%2F1', name: 'Codex', slug: 'codex' }).href).toBe('/agents/agent%252F1')
  })

  it('ranks exact identifiers before prefixes, words, substrings, and metadata', () => {
    const candidates: Command[] = [
      { id: 'resource:project:alpha', kind: 'project', group: 'projects', title: 'Alpha planning', subtitle: 'contains target', keywords: [], href: '/', source: 'projects' },
      { id: 'resource:project:beta', kind: 'project', group: 'projects', title: 'Target delivery', keywords: [], href: '/', source: 'projects' },
      { id: 'resource:project:target', kind: 'project', group: 'projects', title: 'Different', keywords: ['target'], href: '/', source: 'projects' },
    ]
    expect(rankCommands(candidates, 'target').map(command => command.id)).toEqual([
      'resource:project:target',
      'resource:project:beta',
      'resource:project:alpha',
    ])
  })

  it('shows recent resources only after a fresh authorized intersection', () => {
    const fresh = [projectCommand({ id: 'allowed', name: 'Allowed' })]
    const recent: RecentCommandRef[] = [
      { id: 'resource:project:denied', kind: 'project', lastUsedAt: '2026-08-11T10:01:00Z' },
      { id: 'resource:project:allowed', kind: 'project', lastUsedAt: '2026-08-11T10:00:00Z' },
    ]
    expect(intersectRecent(recent, fresh)).toEqual([
      expect.objectContaining({ id: 'resource:project:allowed', group: 'recent' }),
    ])
  })

  it('preserves deterministic group order', () => {
    const commands = [
      workItemCommand({ id: 'item', title: 'Item', number: 1, team_key: 'GEN', project_id: null }),
      ...staticCommands(false),
      projectCommand({ id: 'project', name: 'Project' }),
    ]
    expect(groupCommands(commands).map(group => group.id)).toEqual(['navigation', 'create', 'projects', 'work-items'])
  })
})

describe('command-center state projection', () => {
  const commands = staticCommands(false)

  it('keeps only safe static navigation actionable while offline or stale', () => {
    for (const state of [
      commandCenterViewModel({ commands, errors: [], loading: false, offline: true, stale: false, sourceStatuses: [], truncatedSources: [], query: '' }),
      commandCenterViewModel({ commands, errors: [], loading: true, offline: false, stale: true, sourceStatuses: [], truncatedSources: [], query: '' }),
    ]) {
      expect(state.actionable.every(command => command.source === 'static')).toBe(true)
      expect(['offline', 'stale']).toContain(state.state)
    }
  })

  it('distinguishes partial, empty, and error states without granting authority', () => {
    const partial = commandCenterViewModel({ commands, errors: [], loading: false, offline: false, stale: false, sourceStatuses: [{ source: 'projects', state: 'truncated' }], truncatedSources: ['projects'], query: 'road' })
    expect(partial.state).toBe('partial')
    expect(partial.sourceNotices).toEqual([expect.objectContaining({ source: 'projects', state: 'truncated', message: 'Projects has more matching results.' })])
    expect(commandCenterViewModel({ commands, errors: [], loading: false, offline: false, stale: false, sourceStatuses: [], truncatedSources: [], query: 'no-such-result' }).state).toBe('empty')
    const forbidden = commandCenterViewModel({ commands, errors: [{ source: 'projects', message: 'denied', state: 'forbidden' }], loading: false, offline: false, stale: false, sourceStatuses: [{ source: 'projects', state: 'forbidden' }], truncatedSources: [], query: 'road' })
    expect(forbidden.state).toBe('error')
    expect(forbidden.sourceNotices).toEqual([expect.objectContaining({ source: 'projects', state: 'forbidden', message: 'Projects is unavailable for this actor.' })])
  })

  it('names every resource source while a query is loading', () => {
    const loading = commandCenterViewModel({ commands: [], errors: [], loading: true, offline: false, stale: false, sourceStatuses: [], truncatedSources: [], query: 'g' })
    expect(loading.sourceNotices.map(notice => [notice.source, notice.state])).toEqual([
      ['projects', 'loading'], ['work-items', 'loading'], ['agents', 'loading'], ['sessions', 'loading'], ['inbox', 'loading'],
    ])
  })

  it('renders a visible mobile trigger and accessible shortcut metadata', () => {
    const html = renderToStaticMarkup(createElement(GlobalCommandCenter))
    expect(html).toContain('data-testid="command-center-trigger"')
    expect(html).toContain('aria-keyshortcuts="Control+K Meta+K"')
    expect(html).toContain('aria-label="Search"')
    expect(html).toContain('Search')
    expect(html).not.toContain('role="dialog"')
  })
})
