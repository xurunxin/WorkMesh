import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8')

describe('command-center integration contract', () => {
  it('is mounted once at the root layout, not per-page', () => {
    // The command center is centralized: a single instance is rendered in the
    // root layout so every authenticated route shares one trigger + dialog.
    // Pages must NOT import `GlobalCommandCenter` directly.
    expect(read('app/layout.tsx')).toContain('CommandCenterMount')
    expect(read('app/command-center-mount.tsx')).toContain('GlobalCommandCenter')
    for (const path of [
      'app/page.tsx',
      'app/agents/page.tsx',
      'app/settings/page.tsx',
      'app/operations/page.tsx',
      'app/agent-sessions/[id]/page.tsx',
    ]) expect(read(path)).not.toContain('GlobalCommandCenter')
  })

  it('restores safe create intents and generic work-item deep links through existing forms', () => {
    const home = read('app/page.tsx')
    expect(home).toContain("intent === 'create-work-item'")
    expect(home).toContain("intent === 'create-project'")
    expect(home).toContain("params.delete('intent')")
    expect(home).toContain('if (route.workItemId) void openItem(route.workItemId, true, false)')
    expect(home).toContain('data-testid="create-project"')
    expect(home).toContain('data-testid="create-work-item"')
  })

  it('provides stable Agent and Inbox anchor targets', () => {
    expect(read('app/agents/page.tsx')).toContain('id={`agent-${agent.id}`}')
    expect(read('app/work-room.tsx')).toContain("id={`inbox-${stringValue(item, 'id')}`}")
  })

  it('bounds and cancels endpoint fanout without adding mutation methods', () => {
    const queries = read('features/command-center/queries.ts')
    const component = read('features/command-center/command-center.tsx')
    expect(queries).toContain('const maxTeams = 3')
    expect(queries).toContain('const maxPages = 3')
    expect(queries).toContain('const pageLimit = 50')
    expect(queries).not.toMatch(/method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/)
    expect(component).toContain('new AbortController()')
    expect(component).toContain('controller.abort()')
    expect(component).toContain('generation !== generationRef.current')
    expect(component).toContain('editableTarget(event.target)')
    expect(queries).toContain('normalizedQuery.length < minimumResourceQueryLength')
    expect(queries).toContain('teamId: team.id')
  })

  it('exposes the frozen feature modules through the public Interface', () => {
    const publicInterface = read('features/command-center/index.ts')
    for (const symbol of ['queryAuthorizedCommands', 'commandCenterViewModel', 'rankCommands', 'groupCommands', 'staticCommands'])
      expect(publicInterface).toContain(symbol)
    for (const testPath of ['features/command-center/registry.test.ts', 'features/command-center/queries.test.ts'])
      expect(read(testPath)).toContain("from './index'")
  })

  it('stores only opaque recency references', () => {
    const component = read('features/command-center/command-center.tsx')
    expect(component).toContain("{ id: command.id, kind: command.kind, lastUsedAt: new Date().toISOString() }")
    expect(component).not.toMatch(/sessionStorage\.setItem\([^\n]+(?:title|subtitle|body|message)/)
  })
})
