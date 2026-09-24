import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appRoot = fileURLToPath(new URL('.', import.meta.url))

function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return productionSources(path)
    if (!['.ts', '.tsx', '.css'].includes(extname(entry.name)) || /(?:\.test|\.spec)\.[^.]+$/.test(entry.name)) return []
    return [path]
  })
}

describe('authenticated UI unification contract', () => {
  it('does not reintroduce removed routes or legacy tab systems', () => {
    const source = productionSources(appRoot).map(path => readFileSync(path, 'utf8')).join('\n')
    for (const forbidden of ['wm-project-navigation', 'collaboration-queue-tabs', 'project-tabs', 'settings-tabs', '/preview-issues', '/preview-round2', '/human-control-plane-preview', '/evidence/collaboration-faults']) {
      expect(source).not.toContain(forbidden)
    }
  })

  it('routes every authenticated top-level page through the shared shell', () => {
    for (const relative of ['page.tsx', 'agents/page.tsx', 'agents/[id]/page.tsx', 'agent-sessions/[id]/page.tsx', 'operations/page.tsx', 'settings/page.tsx', 'workbench/page.tsx']) {
      expect(readFileSync(join(appRoot, relative), 'utf8')).toContain('AuthenticatedWorkspaceShell')
    }
  })
})
