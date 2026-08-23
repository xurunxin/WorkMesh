import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildRawByteManifest,
  findDifferentPathIdenticalContent,
  findHunkOverlaps,
  isAllowedWebUiPath,
  parseAuditArguments,
  parseDiffCheckIssues,
  parsePorcelainV2,
  parseZeroContextHunks,
  runWebUiScopeConflictAudit,
  type RawByteManifestEntry,
} from './audit-web-ui-scope-and-conflicts.mjs'

const temporaryDirectories: string[] = []
const execFileAsync = promisify(execFile)

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) await rm(directory, { recursive: true, force: true })
  }
})

describe('scope/conflict audit CLI and allowlist', () => {
  it('requires the three documented path arguments', () => {
    expect(parseAuditArguments([
      '--ui-worktree', 'ui',
      '--repair-worktree', 'repair',
      '--output', 'audit.json',
    ])).toEqual({ help: false, uiWorktree: 'ui', repairWorktree: 'repair', output: 'audit.json' })
    expect(parseAuditArguments(['--help'])).toEqual({
      help: true,
      uiWorktree: null,
      repairWorktree: null,
      output: null,
    })
    expect(() => parseAuditArguments(['--ui-worktree', 'ui'])).toThrow('--repair-worktree is required')
  })

  it('accepts only the declared frontend, verification, plan, report, and manifest paths', () => {
    const accepted = [
      'apps/web/app/page.tsx',
      'packages/ui/src/index.tsx',
      'playwright.config.ts',
      'pnpm-lock.yaml',
      'turbo.json',
      'vitest.config.test.ts',
      'scripts/audit-web-ui-scope-and-conflicts.mts',
      'scripts/audit-web-ui-scope-and-conflicts.test.ts',
      'scripts/stabilize-web-ui-final-evidence.mts',
      'scripts/stabilize-web-ui-final-evidence.test.ts',
      'docs/superpowers/plans/2026-08-22-web-ui-ux-improvements.md',
      '.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-7.1-report.md',
      '.superpowers/sdd/2026-08-22-web-ui-ux-improvements/progress.md',
      '.superpowers/sdd/2026-08-22-web-ui-ux-improvements/review-abc..def.diff',
      '.superpowers/sdd/2026-08-22-web-ui-ux-improvements/task-2.6-test.log',
      '.superpowers/sdd/2026-08-22-web-ui-ux-improvements/resolve.py',
      'artifacts/web-ui-final/conflict-audit.json',
    ]
    for (const candidate of accepted) expect(isAllowedWebUiPath(candidate), candidate).toBe(true)
    expect(isAllowedWebUiPath('apps/api/src/server.ts')).toBe(false)
    expect(isAllowedWebUiPath('packages/db/src/index.ts')).toBe(false)
    expect(isAllowedWebUiPath('AGENTS.md')).toBe(false)
    expect(isAllowedWebUiPath('.superpowers/sdd/2026-08-22-web-ui-ux-improvements/private.env')).toBe(false)
    expect(isAllowedWebUiPath('.superpowers/sdd/2026-08-22-web-ui-ux-improvements/nested/report.md')).toBe(false)
    expect(isAllowedWebUiPath('artifacts/web-ui-final/final-tour.png')).toBe(false)
  })
})

describe('porcelain and raw-byte evidence', () => {
  it('parses tracked, rename, unmerged, and untracked porcelain-v2 records', () => {
    const value = [
      '1 .M N... 100644 100644 100644 aaaaaaa bbbbbbb apps/web/app/page.tsx',
      '2 R. N... 100644 100644 100644 aaaaaaa bbbbbbb R100 packages/ui/src/new.tsx',
      'packages/ui/src/old.tsx',
      'u UU N... 100644 100644 100644 100644 aaaaaaa bbbbbbb ccccccc playwright.config.ts',
      '? artifacts/web-ui-final/manifest.json',
      '',
    ].join('\0')
    const parsed = parsePorcelainV2(value)
    expect(parsed.trackedPaths).toEqual([
      'apps/web/app/page.tsx',
      'packages/ui/src/new.tsx',
      'packages/ui/src/old.tsx',
      'playwright.config.ts',
    ])
    expect(parsed.untrackedPaths).toEqual(['artifacts/web-ui-final/manifest.json'])
    expect(parsed.counts).toEqual({
      trackedRecords: 3,
      trackedPaths: 4,
      untracked: 1,
      staged: 2,
      unstaged: 2,
      unmerged: 1,
    })
  })

  it('hashes untracked fixture files from their raw bytes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'workmesh-scope-audit-test-'))
    temporaryDirectories.push(root)
    await mkdir(path.join(root, 'nested'), { recursive: true })
    await writeFile(path.join(root, 'nested', 'fixture.bin'), Buffer.from([0, 1, 2, 255]))
    const manifest = await buildRawByteManifest(root, ['nested/fixture.bin'])
    expect(manifest).toEqual([{
      path: 'nested/fixture.bin',
      kind: 'file',
      readable: true,
      sizeBytes: 4,
      sha256: '3d1f57c984978ef98a18378c8166c1cb8ede02c03eeb6aee7e2f121dfeee3e56',
    }])
  })
})

describe('zero-context and content intersections', () => {
  it('parses zero-context ranges and reports only same-path base-range overlaps', () => {
    const ui = parseZeroContextHunks(`--- apps/web/app/page.tsx
+++ apps/web/app/page.tsx
@@ -10,2 +10,3 @@
--- packages/ui/src/index.tsx
+++ packages/ui/src/index.tsx
@@ -40,0 +41,1 @@
`)
    const repair = parseZeroContextHunks(`--- apps/web/app/page.tsx
+++ apps/web/app/page.tsx
@@ -11,2 +11,2 @@
--- packages/ui/src/index.tsx
+++ packages/ui/src/index.tsx
@@ -60,1 +60,1 @@
`)
    expect(ui).toHaveLength(2)
    expect(findHunkOverlaps(ui, repair)).toEqual([{
      path: 'apps/web/app/page.tsx',
      ui: { oldStart: 10, oldCount: 2, newStart: 10, newCount: 3 },
      repair: { oldStart: 11, oldCount: 2, newStart: 11, newCount: 2 },
    }])
  })

  it('reports equal bytes only when the two worktrees use different paths', () => {
    const entry = (filePath: string, hash: string): RawByteManifestEntry => ({
      path: filePath,
      kind: 'file',
      readable: true,
      sizeBytes: 4,
      sha256: hash,
    })
    expect(findDifferentPathIdenticalContent(
      [entry('apps/web/a.ts', 'same'), entry('apps/web/shared.ts', 'same')],
      [entry('apps/web/b.ts', 'same'), entry('apps/web/shared.ts', 'same')],
    )).toEqual([
      { sha256: 'same', sizeBytes: 4, uiPath: 'apps/web/a.ts', repairPath: 'apps/web/b.ts' },
      { sha256: 'same', sizeBytes: 4, uiPath: 'apps/web/a.ts', repairPath: 'apps/web/shared.ts' },
      { sha256: 'same', sizeBytes: 4, uiPath: 'apps/web/shared.ts', repairPath: 'apps/web/b.ts' },
    ])
  })

  it('keeps diff-check output to actionable path, line, and diagnostic rows', () => {
    const diffCheckOutput = [
      'apps/web/app/page.tsx:42: trailing whitespace.',
      `+const value = true;${' '.repeat(3)}`,
      '',
    ].join('\n')
    expect(parseDiffCheckIssues(diffCheckOutput)).toEqual([{
      path: 'apps/web/app/page.tsx',
      line: 42,
      message: 'trailing whitespace.',
    }])
  })
})

describe('temporary Git fixture', () => {
  it('audits two linked worktrees without changing either worktree', async () => {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'workmesh-scope-git-test-'))
    temporaryDirectories.push(fixtureRoot)
    const repository = path.join(fixtureRoot, 'repository')
    const uiWorktree = path.join(fixtureRoot, 'ui')
    const repairWorktree = path.join(fixtureRoot, 'repair')
    await mkdir(path.join(repository, 'apps', 'web'), { recursive: true })
    await mkdir(path.join(repository, 'apps', 'api'), { recursive: true })
    await writeFile(path.join(repository, 'apps', 'web', 'page.ts'), 'export const page = 1\n')
    await writeFile(path.join(repository, 'apps', 'api', 'server.ts'), 'export const server = 1\n')
    await execFileAsync('git', ['init'], { cwd: repository, windowsHide: true })
    await execFileAsync('git', ['config', 'user.name', 'WorkMesh Fixture'], { cwd: repository, windowsHide: true })
    await execFileAsync('git', ['config', 'user.email', 'fixture@workmesh.test'], { cwd: repository, windowsHide: true })
    await execFileAsync('git', ['add', 'apps/web/page.ts', 'apps/api/server.ts'], { cwd: repository, windowsHide: true })
    await execFileAsync('git', ['commit', '-m', 'fixture base'], { cwd: repository, windowsHide: true })
    await execFileAsync('git', ['worktree', 'add', '-b', 'ui-fixture', uiWorktree, 'HEAD'], { cwd: repository, windowsHide: true })
    await execFileAsync('git', ['worktree', 'add', '-b', 'repair-fixture', repairWorktree, 'HEAD'], { cwd: repository, windowsHide: true })

    await writeFile(path.join(uiWorktree, 'apps', 'web', 'page.ts'), 'export const page = 2\n')
    await mkdir(path.join(uiWorktree, 'artifacts', 'web-ui-final'), { recursive: true })
    await writeFile(path.join(uiWorktree, 'artifacts', 'web-ui-final', 'fixture.json'), '{"fixture":true}\n')
    await writeFile(path.join(repairWorktree, 'apps', 'api', 'server.ts'), 'export const server = 2\n')
    await execFileAsync('git', ['add', 'apps/api/server.ts'], { cwd: repairWorktree, windowsHide: true })
    await execFileAsync('git', ['commit', '-m', 'repair fixture'], { cwd: repairWorktree, windowsHide: true })
    const beforeUi = await execFileAsync('git', ['status', '--porcelain=v2', '-z', '--untracked-files=all'], { cwd: uiWorktree, windowsHide: true })
    const beforeRepair = await execFileAsync('git', ['status', '--porcelain=v2', '-z', '--untracked-files=all'], { cwd: repairWorktree, windowsHide: true })

    const audit = await runWebUiScopeConflictAudit({
      uiWorktree,
      repairWorktree,
      now: new Date('2026-08-23T00:00:00.000Z'),
    })
    expect(audit.status).toBe('pass')
    expect(audit.worktrees.ui.paths.dirtyTracked).toEqual(['apps/web/page.ts'])
    expect(audit.worktrees.ui.paths.untracked).toEqual(['artifacts/web-ui-final/fixture.json'])
    expect(audit.worktrees.ui.scope.outsideFrontendAllowlist).toEqual([])
    expect(audit.worktrees.repair.paths.committed).toEqual(['apps/api/server.ts'])
    expect(audit.worktrees.repair.scope.outsideFrontendAllowlist).toEqual(['apps/api/server.ts'])
    expect(audit.committedTreeMerge.status).toBe('clean')
    expect(audit.committedTreeMerge.treeOid).toMatch(/^[0-9a-f]{40,64}$/)
    expect(audit.intersections.anyChangedPaths).toEqual([])
    const afterUi = await execFileAsync('git', ['status', '--porcelain=v2', '-z', '--untracked-files=all'], { cwd: uiWorktree, windowsHide: true })
    const afterRepair = await execFileAsync('git', ['status', '--porcelain=v2', '-z', '--untracked-files=all'], { cwd: repairWorktree, windowsHide: true })
    expect(afterUi.stdout).toBe(beforeUi.stdout)
    expect(afterRepair.stdout).toBe(beforeRepair.stdout)
  }, 30_000)
})
