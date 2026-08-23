import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const WEB_UI_CONFLICT_AUDIT_SCHEMA_VERSION = 1 as const

type AuditStatus = 'pass' | 'blocked'
type WorktreeSide = 'ui' | 'repair'
type ChangeKind = 'committed' | 'dirtyTracked' | 'untracked'

type CliArguments = Readonly<{
  help: boolean
  uiWorktree: string | null
  repairWorktree: string | null
  output: string | null
}>

type GitResult = Readonly<{
  exitCode: number | null
  stdout: Buffer
  timedOut: boolean
}>

export type PorcelainRecord = Readonly<{
  kind: 'tracked' | 'untracked'
  path: string
  originalPath: string | null
  staged: boolean
  unstaged: boolean
  unmerged: boolean
}>

export type ParsedPorcelain = Readonly<{
  records: PorcelainRecord[]
  trackedPaths: string[]
  untrackedPaths: string[]
  counts: {
    trackedRecords: number
    trackedPaths: number
    untracked: number
    staged: number
    unstaged: number
    unmerged: number
  }
}>

export type RawByteManifestEntry = Readonly<{
  path: string
  kind: 'file' | 'symlink' | 'directory' | 'missing'
  readable: boolean
  sizeBytes: number | null
  sha256: string | null
}>

export type DiffHunk = Readonly<{
  path: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
}>

type DiffCheckResult = Readonly<{
  command: string[]
  pass: boolean
  exitCode: number | null
  issueCount: number
  issues: Array<{ path: string; line: number; message: string }>
  outputSha256: string
}>

type BinaryDiffRecord = Readonly<{
  command: string[]
  exitCode: number | null
  byteLength: number
  sha256: string
}>

type ScopeResult = Readonly<{
  enforced: boolean
  status: AuditStatus
  allowedPaths: string[]
  outsideFrontendAllowlist: string[]
}>

type WorktreeSnapshot = Readonly<{
  side: WorktreeSide
  path: string
  head: string
  mergeBase: string
  porcelainV2: ParsedPorcelain & { command: string[] }
  paths: {
    committed: string[]
    dirtyTracked: string[]
    untracked: string[]
    allChanged: string[]
  }
  binaryDiffs: {
    mergeBaseToWorkingTree: BinaryDiffRecord
    mergeBaseToHead: BinaryDiffRecord
    headToWorkingTree: BinaryDiffRecord
  }
  untrackedManifest: RawByteManifestEntry[]
  currentContentManifest: RawByteManifestEntry[]
  trackedHunks: DiffHunk[]
  diffCheck: {
    workingTree: DiffCheckResult
    staged: DiffCheckResult
    mergeBaseToWorkingTree: DiffCheckResult
  }
  scope: ScopeResult
}>

type HunkOverlap = Readonly<{
  path: string
  ui: Omit<DiffHunk, 'path'>
  repair: Omit<DiffHunk, 'path'>
}>

type IdenticalContentPair = Readonly<{
  sha256: string
  sizeBytes: number
  uiPath: string
  repairPath: string
}>

type CommittedTreeMerge = Readonly<{
  command: string[]
  readOnlyAgainstWorktrees: true
  isolatedObjectDatabase: true
  status: 'clean' | 'conflicted' | 'error'
  exitCode: number | null
  treeOid: string | null
  conflictPaths: string[]
  outputSha256: string
}>

export type WebUiScopeConflictAudit = Readonly<{
  schemaVersion: typeof WEB_UI_CONFLICT_AUDIT_SCHEMA_VERSION
  kind: 'workmesh.web-ui-scope-conflict-audit'
  generatedAt: string
  status: AuditStatus
  inputs: {
    uiWorktree: string
    repairWorktree: string
  }
  mergeBase: string
  worktrees: {
    ui: WorktreeSnapshot
    repair: WorktreeSnapshot
  }
  intersections: {
    committedPaths: string[]
    dirtyTrackedPaths: string[]
    untrackedPaths: string[]
    anyChangedPaths: string[]
    changeKindsByPath: Array<{
      path: string
      uiKinds: ChangeKind[]
      repairKinds: ChangeKind[]
    }>
    samePathZeroContextHunkOverlaps: HunkOverlap[]
    differentPathIdenticalContent: IdenticalContentPair[]
  }
  committedTreeMerge: CommittedTreeMerge
  blockers: string[]
}>

const HELP = `Usage: pnpm exec tsx scripts/audit-web-ui-scope-and-conflicts.mts \\
  --ui-worktree <path> --repair-worktree <path> --output <file>

Writes a read-only frontend scope and Git conflict report for the UI and repair worktrees.
It does not merge, rebase, stash, checkout, reset, or modify either worktree.
`

const sha256 = (value: Buffer | string): string =>
  createHash('sha256').update(value).digest('hex')

const sortedUnique = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right))

export const normalizeRepoPath = (value: string): string =>
  value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '')

export const parseAuditArguments = (values: readonly string[]): CliArguments => {
  let help = false
  let uiWorktree: string | null = null
  let repairWorktree: string | null = null
  let output: string | null = null
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index]
    if (name === '--help' || name === '-h') {
      help = true
      continue
    }
    const value = values[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${name ?? '(missing)'} requires a value`)
    if (name === '--ui-worktree') uiWorktree = value
    else if (name === '--repair-worktree') repairWorktree = value
    else if (name === '--output') output = value
    else throw new Error(`Unknown argument: ${name ?? '(missing)'}`)
    index += 1
  }
  if (!help) {
    if (!uiWorktree) throw new Error('--ui-worktree is required')
    if (!repairWorktree) throw new Error('--repair-worktree is required')
    if (!output) throw new Error('--output is required')
  }
  return { help, uiWorktree, repairWorktree, output }
}

const textAfterSpaces = (value: string, spaces: number): string => {
  let cursor = 0
  for (let index = 0; index < spaces; index += 1) {
    cursor = value.indexOf(' ', cursor)
    if (cursor < 0) return ''
    cursor += 1
  }
  return value.slice(cursor)
}

export const parsePorcelainV2 = (value: Buffer | string): ParsedPorcelain => {
  const tokens = (Buffer.isBuffer(value) ? value.toString('utf8') : value).split('\0')
  const records: PorcelainRecord[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? ''
    if (!token) continue
    if (token.startsWith('? ')) {
      records.push({
        kind: 'untracked',
        path: normalizeRepoPath(token.slice(2)),
        originalPath: null,
        staged: false,
        unstaged: false,
        unmerged: false,
      })
      continue
    }
    if (token.startsWith('! ') || token.startsWith('# ')) continue
    const recordType = token[0]
    if (recordType !== '1' && recordType !== '2' && recordType !== 'u') continue
    const xy = token.slice(2, 4)
    const renamed = recordType === '2'
    const primaryPath = textAfterSpaces(token, renamed ? 9 : recordType === 'u' ? 10 : 8)
    const originalPath = renamed ? normalizeRepoPath(tokens[index + 1] ?? '') : null
    if (renamed) index += 1
    records.push({
      kind: 'tracked',
      path: normalizeRepoPath(primaryPath),
      originalPath: originalPath || null,
      staged: recordType === 'u' || xy[0] !== '.',
      unstaged: recordType === 'u' || xy[1] !== '.',
      unmerged: recordType === 'u',
    })
  }

  const trackedRecords = records.filter(record => record.kind === 'tracked')
  const trackedPaths = sortedUnique(trackedRecords.flatMap(record =>
    record.originalPath ? [record.path, record.originalPath] : [record.path]))
  const untrackedPaths = sortedUnique(records
    .filter(record => record.kind === 'untracked')
    .map(record => record.path))
  return {
    records,
    trackedPaths,
    untrackedPaths,
    counts: {
      trackedRecords: trackedRecords.length,
      trackedPaths: trackedPaths.length,
      untracked: untrackedPaths.length,
      staged: trackedRecords.filter(record => record.staged).length,
      unstaged: trackedRecords.filter(record => record.unstaged).length,
      unmerged: trackedRecords.filter(record => record.unmerged).length,
    },
  }
}

const decodeDiffPath = (value: string): string => {
  const trimmed = value.trim()
  if (trimmed === '/dev/null') return trimmed
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return normalizeRepoPath(JSON.parse(trimmed) as string)
    } catch {
      return normalizeRepoPath(trimmed.slice(1, -1))
    }
  }
  return normalizeRepoPath(trimmed.replace(/^[ab]\//, ''))
}

export const parseZeroContextHunks = (diff: string): DiffHunk[] => {
  const hunks: DiffHunk[] = []
  let previousPath: string | null = null
  let currentPath: string | null = null
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('--- ')) {
      previousPath = decodeDiffPath(line.slice(4))
      continue
    }
    if (line.startsWith('+++ ')) {
      const nextPath = decodeDiffPath(line.slice(4))
      currentPath = nextPath === '/dev/null' ? previousPath : nextPath
      continue
    }
    const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (!match || !currentPath || currentPath === '/dev/null') continue
    hunks.push({
      path: currentPath,
      oldStart: Number(match[1]),
      oldCount: match[2] === undefined ? 1 : Number(match[2]),
      newStart: Number(match[3]),
      newCount: match[4] === undefined ? 1 : Number(match[4]),
    })
  }
  return hunks
}

const hunkInterval = (hunk: DiffHunk): { start: number; end: number } => ({
  start: hunk.oldStart,
  end: hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart + hunk.oldCount - 1,
})

export const findHunkOverlaps = (
  uiHunks: readonly DiffHunk[],
  repairHunks: readonly DiffHunk[],
): HunkOverlap[] => {
  const overlaps: HunkOverlap[] = []
  for (const ui of uiHunks) {
    for (const repair of repairHunks) {
      if (ui.path !== repair.path) continue
      const uiInterval = hunkInterval(ui)
      const repairInterval = hunkInterval(repair)
      if (uiInterval.start > repairInterval.end || repairInterval.start > uiInterval.end) continue
      const { path: _uiPath, ...uiRange } = ui
      const { path: _repairPath, ...repairRange } = repair
      overlaps.push({ path: ui.path, ui: uiRange, repair: repairRange })
    }
  }
  return overlaps.sort((left, right) =>
    left.path.localeCompare(right.path) || left.ui.oldStart - right.ui.oldStart)
}

const allowedVerificationScripts = new Set([
  'scripts/verify-web-ui-final-preflight.mts',
  'scripts/verify-playwright-suite-scope.mts',
  'scripts/run-web-ui-final-playwright.mts',
  'scripts/audit-web-ui-scope-and-conflicts.mts',
  'scripts/stabilize-web-ui-final-evidence.mts',
  'scripts/verify-web-ui-final-verification.test.ts',
  'scripts/run-web-ui-final-playwright.test.ts',
  'scripts/audit-web-ui-scope-and-conflicts.test.ts',
  'scripts/stabilize-web-ui-final-evidence.test.ts',
])

const allowedRootConfigs = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'playwright.config.ts',
  'turbo.json',
  'vitest.config.ts',
  'vitest.config.test.ts',
])

export const isAllowedWebUiPath = (value: string): boolean => {
  const candidate = normalizeRepoPath(value)
  if (candidate.startsWith('apps/web/')) return true
  if (candidate.startsWith('packages/ui/')) return true
  if (allowedVerificationScripts.has(candidate) || allowedRootConfigs.has(candidate)) return true
  if (candidate === 'docs/superpowers/plans/2026-08-22-web-ui-ux-improvements.md') return true
  if (/^\.superpowers\/sdd\/2026-08-22-web-ui-ux-improvements\/[^/]+\.(?:md|diff|log|py)$/.test(candidate)) return true
  if (candidate.startsWith('artifacts/web-ui-final/') && /\.(?:json|tsv|sha256)$/.test(candidate)) return true
  return false
}

const runGit = async (
  worktree: string,
  args: readonly string[],
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<GitResult> => new Promise(resolve => {
  const stdout: Buffer[] = []
  let settled = false
  const child = spawn(
    'git',
    ['--no-optional-locks', '-c', 'core.quotePath=false', '-C', worktree, ...args],
    {
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )
  const timeout = setTimeout(() => {
    if (!settled) child.kill()
  }, 120_000)
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
  child.stderr.resume()
  child.on('error', () => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    resolve({ exitCode: null, stdout: Buffer.concat(stdout), timedOut: false })
  })
  child.on('close', exitCode => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    resolve({ exitCode, stdout: Buffer.concat(stdout), timedOut: child.killed })
  })
})

const requireGitText = async (worktree: string, args: readonly string[]): Promise<string> => {
  const result = await runGit(worktree, args)
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(`Git read failed: git ${args.join(' ')}`)
  }
  return result.stdout.toString('utf8').trim()
}

const splitNulPaths = (value: Buffer): string[] =>
  sortedUnique(value.toString('utf8').split('\0').filter(Boolean).map(normalizeRepoPath))

const readPathBytes = async (worktree: string, repoPath: string): Promise<RawByteManifestEntry> => {
  const absolutePath = path.join(worktree, ...normalizeRepoPath(repoPath).split('/'))
  try {
    const stat = await lstat(absolutePath)
    if (stat.isSymbolicLink()) {
      const bytes = Buffer.from(await readlink(absolutePath), 'utf8')
      return { path: repoPath, kind: 'symlink', readable: true, sizeBytes: bytes.byteLength, sha256: sha256(bytes) }
    }
    if (stat.isFile()) {
      const bytes = await readFile(absolutePath)
      return { path: repoPath, kind: 'file', readable: true, sizeBytes: bytes.byteLength, sha256: sha256(bytes) }
    }
    return { path: repoPath, kind: 'directory', readable: true, sizeBytes: null, sha256: null }
  } catch {
    return { path: repoPath, kind: 'missing', readable: false, sizeBytes: null, sha256: null }
  }
}

export const buildRawByteManifest = async (
  worktree: string,
  repoPaths: readonly string[],
): Promise<RawByteManifestEntry[]> => {
  const entries: RawByteManifestEntry[] = []
  for (const repoPath of sortedUnique(repoPaths)) entries.push(await readPathBytes(worktree, repoPath))
  return entries
}

const binaryDiff = async (worktree: string, args: readonly string[]): Promise<BinaryDiffRecord> => {
  const command = ['git', 'diff', '--binary', '--no-ext-diff', ...args]
  const result = await runGit(worktree, ['diff', '--binary', '--no-ext-diff', ...args])
  return {
    command,
    exitCode: result.exitCode,
    byteLength: result.stdout.byteLength,
    sha256: sha256(result.stdout),
  }
}

export const parseDiffCheckIssues = (output: string): Array<{ path: string; line: number; message: string }> => {
  const issues: Array<{ path: string; line: number; message: string }> = []
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(.+):(\d+): (.+)$/)
    if (!match) continue
    issues.push({ path: normalizeRepoPath(match[1] ?? ''), line: Number(match[2]), message: match[3] ?? '' })
  }
  return issues
}

const diffCheck = async (worktree: string, args: readonly string[]): Promise<DiffCheckResult> => {
  const command = ['git', 'diff', '--check', ...args]
  const result = await runGit(worktree, ['diff', '--check', ...args])
  const output = result.stdout.toString('utf8')
  const issues = parseDiffCheckIssues(output)
  return {
    command,
    pass: result.exitCode === 0,
    exitCode: result.exitCode,
    issueCount: issues.length,
    issues,
    outputSha256: sha256(result.stdout),
  }
}

const snapshotWorktree = async (input: Readonly<{
  side: WorktreeSide
  worktree: string
  head: string
  mergeBase: string
}>): Promise<WorktreeSnapshot> => {
  const porcelainCommand = ['git', 'status', '--porcelain=v2', '-z', '--untracked-files=all']
  const porcelainRaw = await runGit(input.worktree, ['status', '--porcelain=v2', '-z', '--untracked-files=all'])
  if (porcelainRaw.exitCode !== 0) throw new Error(`Unable to read ${input.side} porcelain-v2 status`)
  const porcelain = parsePorcelainV2(porcelainRaw.stdout)

  const committedRaw = await runGit(input.worktree, [
    'diff', '--name-only', '-z', '--no-ext-diff', '--no-renames', input.mergeBase, input.head, '--',
  ])
  if (committedRaw.exitCode !== 0) throw new Error(`Unable to read ${input.side} committed paths`)
  const committed = splitNulPaths(committedRaw.stdout)
  const dirtyTracked = porcelain.trackedPaths
  const untracked = porcelain.untrackedPaths
  const allChanged = sortedUnique([...committed, ...dirtyTracked, ...untracked])

  const hunkDiff = await runGit(input.worktree, [
    'diff', '--unified=0', '--no-ext-diff', '--no-renames', '--no-color', '--no-prefix', input.mergeBase, '--',
  ])
  if (hunkDiff.exitCode !== 0) throw new Error(`Unable to read ${input.side} zero-context diff`)

  const [mergeBaseToWorkingTree, mergeBaseToHead, headToWorkingTree] = await Promise.all([
    binaryDiff(input.worktree, [input.mergeBase, '--']),
    binaryDiff(input.worktree, [input.mergeBase, input.head, '--']),
    binaryDiff(input.worktree, [input.head, '--']),
  ])
  const [workingTreeCheck, stagedCheck, mergeBaseCheck] = await Promise.all([
    diffCheck(input.worktree, ['--']),
    diffCheck(input.worktree, ['--cached', input.head, '--']),
    diffCheck(input.worktree, [input.mergeBase, '--']),
  ])
  const [untrackedManifest, currentContentManifest] = await Promise.all([
    buildRawByteManifest(input.worktree, untracked),
    buildRawByteManifest(input.worktree, allChanged),
  ])
  const allowedPaths = allChanged.filter(isAllowedWebUiPath)
  const outsideFrontendAllowlist = allChanged.filter(candidate => !isAllowedWebUiPath(candidate))

  return {
    side: input.side,
    path: input.worktree,
    head: input.head,
    mergeBase: input.mergeBase,
    porcelainV2: { ...porcelain, command: porcelainCommand },
    paths: { committed, dirtyTracked, untracked, allChanged },
    binaryDiffs: { mergeBaseToWorkingTree, mergeBaseToHead, headToWorkingTree },
    untrackedManifest,
    currentContentManifest,
    trackedHunks: parseZeroContextHunks(hunkDiff.stdout.toString('utf8')),
    diffCheck: {
      workingTree: workingTreeCheck,
      staged: stagedCheck,
      mergeBaseToWorkingTree: mergeBaseCheck,
    },
    scope: {
      enforced: input.side === 'ui',
      status: input.side === 'ui' && outsideFrontendAllowlist.length > 0 ? 'blocked' : 'pass',
      allowedPaths,
      outsideFrontendAllowlist,
    },
  }
}

const intersection = (left: readonly string[], right: readonly string[]): string[] => {
  const rightSet = new Set(right)
  return sortedUnique(left.filter(candidate => rightSet.has(candidate)))
}

const kindsByPath = (snapshot: WorktreeSnapshot): Map<string, ChangeKind[]> => {
  const result = new Map<string, ChangeKind[]>()
  const add = (paths: readonly string[], kind: ChangeKind): void => {
    for (const candidate of paths) result.set(candidate, [...(result.get(candidate) ?? []), kind])
  }
  add(snapshot.paths.committed, 'committed')
  add(snapshot.paths.dirtyTracked, 'dirtyTracked')
  add(snapshot.paths.untracked, 'untracked')
  return result
}

export const findDifferentPathIdenticalContent = (
  uiManifest: readonly RawByteManifestEntry[],
  repairManifest: readonly RawByteManifestEntry[],
): IdenticalContentPair[] => {
  const pairs: IdenticalContentPair[] = []
  for (const ui of uiManifest) {
    if (!ui.readable || ui.sha256 === null || ui.sizeBytes === null) continue
    for (const repair of repairManifest) {
      if (!repair.readable || repair.sha256 !== ui.sha256 || repair.sizeBytes !== ui.sizeBytes) continue
      if (repair.path === ui.path) continue
      pairs.push({ sha256: ui.sha256, sizeBytes: ui.sizeBytes, uiPath: ui.path, repairPath: repair.path })
    }
  }
  return pairs.sort((left, right) =>
    left.sha256.localeCompare(right.sha256)
      || left.uiPath.localeCompare(right.uiPath)
      || left.repairPath.localeCompare(right.repairPath))
}

const committedTreeMerge = async (input: Readonly<{
  uiWorktree: string
  uiHead: string
  repairHead: string
}>): Promise<CommittedTreeMerge> => {
  const commonDirOutput = await requireGitText(input.uiWorktree, ['rev-parse', '--git-common-dir'])
  const commonDir = path.isAbsolute(commonDirOutput)
    ? commonDirOutput
    : path.resolve(input.uiWorktree, commonDirOutput)
  const temporaryObjectRoot = await mkdtemp(path.join(os.tmpdir(), 'workmesh-ui-merge-tree-'))
  const objectDirectory = path.join(temporaryObjectRoot, 'objects')
  await mkdir(objectDirectory, { recursive: true })
  const command = ['git', 'merge-tree', '--write-tree', '--name-only', '-z', input.uiHead, input.repairHead]
  try {
    const result = await runGit(
      input.uiWorktree,
      ['merge-tree', '--write-tree', '--name-only', '-z', input.uiHead, input.repairHead],
      {
        GIT_OBJECT_DIRECTORY: objectDirectory,
        GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(commonDir, 'objects'),
      },
    )
    const tokens = result.stdout.toString('utf8').split('\0')
    const treeOid = /^[0-9a-f]{40,64}$/.test(tokens[0]?.trim() ?? '') ? tokens[0]?.trim() ?? null : null
    const conflictPaths: string[] = []
    for (let index = 1; index < tokens.length; index += 1) {
      const token = tokens[index] ?? ''
      if (!token) break
      conflictPaths.push(normalizeRepoPath(token))
    }
    return {
      command,
      readOnlyAgainstWorktrees: true,
      isolatedObjectDatabase: true,
      status: result.exitCode === 0 ? 'clean' : result.exitCode === 1 ? 'conflicted' : 'error',
      exitCode: result.exitCode,
      treeOid,
      conflictPaths: sortedUnique(conflictPaths),
      outputSha256: sha256(result.stdout),
    }
  } finally {
    await rm(temporaryObjectRoot, { recursive: true, force: true })
  }
}

export const runWebUiScopeConflictAudit = async (input: Readonly<{
  uiWorktree: string
  repairWorktree: string
  now?: Date
}>): Promise<WebUiScopeConflictAudit> => {
  const uiWorktree = path.resolve(input.uiWorktree)
  const repairWorktree = path.resolve(input.repairWorktree)
  const [uiHead, repairHead] = await Promise.all([
    requireGitText(uiWorktree, ['rev-parse', 'HEAD']),
    requireGitText(repairWorktree, ['rev-parse', 'HEAD']),
  ])
  const mergeBase = await requireGitText(uiWorktree, ['merge-base', uiHead, repairHead])
  const [ui, repair, merge] = await Promise.all([
    snapshotWorktree({ side: 'ui', worktree: uiWorktree, head: uiHead, mergeBase }),
    snapshotWorktree({ side: 'repair', worktree: repairWorktree, head: repairHead, mergeBase }),
    committedTreeMerge({ uiWorktree, uiHead, repairHead }),
  ])

  const committedPaths = intersection(ui.paths.committed, repair.paths.committed)
  const dirtyTrackedPaths = intersection(ui.paths.dirtyTracked, repair.paths.dirtyTracked)
  const untrackedPaths = intersection(ui.paths.untracked, repair.paths.untracked)
  const anyChangedPaths = intersection(ui.paths.allChanged, repair.paths.allChanged)
  const uiKinds = kindsByPath(ui)
  const repairKinds = kindsByPath(repair)
  const changeKindsByPath = anyChangedPaths.map(candidate => ({
    path: candidate,
    uiKinds: uiKinds.get(candidate) ?? [],
    repairKinds: repairKinds.get(candidate) ?? [],
  }))
  const samePathZeroContextHunkOverlaps = findHunkOverlaps(ui.trackedHunks, repair.trackedHunks)
  const differentPathIdenticalContent = findDifferentPathIdenticalContent(
    ui.currentContentManifest,
    repair.currentContentManifest,
  )

  const blockers: string[] = []
  if (ui.scope.status === 'blocked') blockers.push('UI_CHANGE_OUTSIDE_FRONTEND_ALLOWLIST')
  if ([
    ui.binaryDiffs.mergeBaseToWorkingTree,
    ui.binaryDiffs.mergeBaseToHead,
    ui.binaryDiffs.headToWorkingTree,
    repair.binaryDiffs.mergeBaseToWorkingTree,
    repair.binaryDiffs.mergeBaseToHead,
    repair.binaryDiffs.headToWorkingTree,
  ].some(record => record.exitCode !== 0)) blockers.push('BINARY_DIFF_READ_FAILED')
  if ([...ui.untrackedManifest, ...repair.untrackedManifest].some(entry => !entry.readable)) {
    blockers.push('UNTRACKED_MANIFEST_CHANGED_DURING_AUDIT')
  }
  if (!ui.diffCheck.workingTree.pass || !ui.diffCheck.staged.pass || !ui.diffCheck.mergeBaseToWorkingTree.pass) {
    blockers.push('UI_DIFF_CHECK_FAILED')
  }
  if (!repair.diffCheck.workingTree.pass || !repair.diffCheck.staged.pass || !repair.diffCheck.mergeBaseToWorkingTree.pass) {
    blockers.push('REPAIR_DIFF_CHECK_FAILED')
  }
  if (untrackedPaths.length > 0) blockers.push('UNTRACKED_PATH_COLLISION')
  if (changeKindsByPath.some(entry =>
    entry.uiKinds.includes('untracked') !== entry.repairKinds.includes('untracked'))) {
    blockers.push('TRACKED_UNTRACKED_PATH_COLLISION')
  }
  if (samePathZeroContextHunkOverlaps.length > 0) blockers.push('ZERO_CONTEXT_HUNK_OVERLAP')
  if (merge.status === 'conflicted') blockers.push('COMMITTED_TREE_CONFLICT')
  if (merge.status === 'error') blockers.push('COMMITTED_TREE_CONFLICT_CHECK_FAILED')

  return {
    schemaVersion: WEB_UI_CONFLICT_AUDIT_SCHEMA_VERSION,
    kind: 'workmesh.web-ui-scope-conflict-audit',
    generatedAt: (input.now ?? new Date()).toISOString(),
    status: blockers.length === 0 ? 'pass' : 'blocked',
    inputs: { uiWorktree, repairWorktree },
    mergeBase,
    worktrees: { ui, repair },
    intersections: {
      committedPaths,
      dirtyTrackedPaths,
      untrackedPaths,
      anyChangedPaths,
      changeKindsByPath,
      samePathZeroContextHunkOverlaps,
      differentPathIdenticalContent,
    },
    committedTreeMerge: merge,
    blockers,
  }
}

const isDirectExecution = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false

if (isDirectExecution) {
  const args = parseAuditArguments(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP)
  } else {
    const result = await runWebUiScopeConflictAudit({
      uiWorktree: args.uiWorktree as string,
      repairWorktree: args.repairWorktree as string,
    })
    const output = path.resolve(args.output as string)
    await mkdir(path.dirname(output), { recursive: true })
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    process.stdout.write(`Web UI scope/conflict audit ${result.status}; result written to ${output}\n`)
    if (result.status !== 'pass') process.exitCode = 1
  }
}
