import { constants } from 'node:fs'
import { lstat, readFile, mkdir, readdir, readlink, open, rename, symlink, unlink, rmdir, statfs } from 'node:fs/promises'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import { Parser } from 'tar'
import { releaseSchema, type ReleaseManifest } from './release-schema.js'
import { withDirectoryLock, atomicWrite, readPrivate, syncDirectory } from '../src/platform-security.js'
import { trustedPosixDirectory } from '../src/path-policy.js'

const execute = promisify(execFile)
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
function check(ok: unknown, code: string): asserts ok { if (!ok) throw new Error(code) }
async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e }
}
function safeRelative(path: string): void {
  check(!isAbsolute(path) && !path.includes('\\') && path.split('/').every(p => p && p !== '.' && p !== '..')
    && /^[A-Za-z0-9@_.+/-]+$/.test(path), 'INSTALL_UNSAFE_MEMBER')
}
async function safeDirectory(path: string): Promise<void> {
  const parent = dirname(path)
  if (parent !== path) await safeDirectory(parent)
  const info = await lstat(path)
  check(info.isDirectory() && !info.isSymbolicLink(), 'INSTALL_UNSAFE_DIRECTORY')
  trustedPosixDirectory(info.uid, info.mode, process.getuid!())
}
async function regular(path: string, privateFile = false): Promise<Buffer> {
  await safeDirectory(dirname(path))
  const info = await lstat(path)
  check(info.isFile() && !info.isSymbolicLink() && info.nlink === 1
    && [process.getuid!(), 0].includes(info.uid) && !(info.mode & 0o022), 'INSTALL_UNSAFE_FILE')
  if (privateFile) check(info.uid === process.getuid!() && (info.mode & 0o777) === 0o600, 'INSTALL_UNSAFE_FILE')
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const actual = await handle.stat()
    check(actual.ino === info.ino && actual.dev === info.dev, 'INSTALL_FILE_CHANGED')
    return await handle.readFile()
  } finally { await handle.close() }
}
async function manifest(path: string): Promise<ReleaseManifest> {
  const m = releaseSchema.parse(JSON.parse((await regular(path)).toString('utf8')))
  check(m.arch === ({ x64: 'amd64', arm64: 'arm64' } as Record<string, string>)[process.arch]
    && process.platform === 'linux', 'INSTALL_ARCH_MISMATCH')
  for (const files of [m.files, m.installerFiles]) {
    const paths = new Set<string>()
    for (const f of files) {
      safeRelative(f.path); check(!paths.has(f.path), 'INSTALL_DUPLICATE_MEMBER'); paths.add(f.path)
      check(!f.path.endsWith('.ts') && !f.path.endsWith('.map') && !f.path.split('/').some(x => ['.git', 'test', 'tests'].includes(x)) && (!f.path.split('/').includes('src') || /^(?:installer\/)?node_modules\/koffi\/src\/koffi\/.+\.(?:js|cjs)$/.test(f.path.replace(/^installer-linux-(?:amd64|arm64)\//, ''))), 'INSTALL_SOURCE_MEMBER')
    }
    for (const path of paths) check(![...paths].some(p => p !== path && path.startsWith(p + '/')), 'INSTALL_PATH_CONFLICT')
  }
  for (const required of ['bin/workmesh-connector', 'release.json', 'uninstall.sh', 'installer/bin/workmesh-connector-installer'])
    check(m.files.some(f => f.path === required), 'INSTALL_MISSING_MEMBER')
  return m
}
async function archive(path: string, m: ReleaseManifest): Promise<Map<string, Buffer>> {
  const bytes = await regular(path)
  check(bytes.length === m.archive.size && digest(bytes) === m.archive.sha256, 'INSTALL_ARCHIVE_HASH')
  const entries = new Map<string, Buffer>(), expected = new Map(m.files.map(f => [f.path, f]))
  const directories = new Set(m.files.flatMap(f => { const list = []; let p = dirname(f.path); while (p !== '.') { list.push(p); p = dirname(p) } return list }))
  let total = 0
  await new Promise<void>((done, fail) => {
    const parser = new Parser({ strict: true, onReadEntry(entry) {
      try {
        const path = entry.path.replace(/\/$/, '')
        safeRelative(path)
        check(!entries.has(path), 'INSTALL_DUPLICATE_MEMBER')
        check(entry.type === 'File' || entry.type === 'Directory', 'INSTALL_UNSAFE_MEMBER')
        check(!(entry.mode! & 0o7022), 'INSTALL_MEMBER_MODE')
        if (entry.type === 'Directory') {
          check(directories.has(path), 'INSTALL_UNLISTED_MEMBER')
          entries.set(path, Buffer.alloc(0)); entry.resume(); return
        }
        const f = expected.get(path)
        check(f && entry.size === f.size && (entry.mode! & 0o777) === f.mode, 'INSTALL_UNLISTED_MEMBER')
        total += entry.size; check(total <= 1024 * 1024 * 1024, 'INSTALL_ARCHIVE_LIMIT')
        const chunks: Buffer[] = []; let count = 0
        entries.set(path, Buffer.alloc(0))
        entry.on('data', (chunk: Buffer) => { count += chunk.length; if (count > f.size) { parser.abort(new Error('INSTALL_MEMBER_SIZE')); return } chunks.push(chunk) })
        entry.on('end', () => {
          const content = Buffer.concat(chunks)
          if (content.length !== f.size || digest(content) !== f.sha256) { parser.abort(new Error('INSTALL_MEMBER_HASH')); return }
          entries.set(path, content)
        })
      } catch (error) { parser.abort(error as Error) }
    } })
    parser.on('error', fail); parser.on('end', done); parser.end(bytes)
  })
  for (const f of m.files) check(entries.has(f.path) && entries.get(f.path)!.length === f.size
    && digest(entries.get(f.path)!) === f.sha256, 'INSTALL_MISSING_MEMBER')
  for (const path of directories) entries.delete(path)
  return entries
}
async function verifyFiles(root: string, m: ReleaseManifest): Promise<void> {
  await safeDirectory(root)
  const allowed = new Set(m.files.map(f => f.path))
  const walk = async (directory: string) => {
    for (const name of await readdir(directory)) {
      const path = join(directory, name), info = await lstat(path), rel = relative(root, path).split('\\').join('/')
      check(!info.isSymbolicLink() && info.uid === process.getuid!(), 'INSTALL_VERSION_CHANGED')
      if (info.isDirectory()) { check([...allowed].some(x => x.startsWith(rel + '/')), 'INSTALL_VERSION_CHANGED'); await walk(path) }
      else check(allowed.has(rel), 'INSTALL_VERSION_CHANGED')
    }
  }
  await walk(root)
  for (const f of m.files) {
    const path = join(root, f.path), info = await lstat(path), bytes = await regular(path)
    check((info.mode & 0o777) === f.mode && bytes.length === f.size && digest(bytes) === f.sha256, 'INSTALL_VERSION_CHANGED')
  }
}
async function active(root: string): Promise<void> {
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name) || Number(name) === process.pid) continue
    let executable: string
    try { executable = await readlink(`/proc/${name}/exe`) } catch (e) {
      if (['ENOENT', 'EACCES', 'EPERM'].includes((e as NodeJS.ErrnoException).code!)) continue
      throw e
    }
    check(!executable.startsWith(root + '/'), 'INSTALL_VERSION_ACTIVE')
  }
}
type Ledger = { schema: 'workmesh-connector-installed'; current: string; previous: string | null; versions: Record<string, ReleaseManifest> }
function validateLedger(value: unknown): Ledger {
  check(typeof value === 'object' && value !== null, 'INSTALL_LEDGER_INVALID')
  const v = value as Ledger
  check(Object.keys(v).sort().join(',') === 'current,previous,schema,versions' && v.schema === 'workmesh-connector-installed'
    && typeof v.versions === 'object' && v.versions !== null && Object.keys(v.versions).length > 0, 'INSTALL_LEDGER_INVALID')
  for (const [id, raw] of Object.entries(v.versions)) {
    const m = releaseSchema.parse(raw)
    check(id === `${m.connectorVersion}-${m.arch}`, 'INSTALL_LEDGER_INVALID')
  }
  check(Object.hasOwn(v.versions, v.current) && (v.previous === null || Object.hasOwn(v.versions, v.previous)), 'INSTALL_LEDGER_INVALID')
  return v
}
async function managedLink(path: string, expected: string): Promise<void> {
  if (!await exists(path)) return
  check((await lstat(path)).isSymbolicLink() && await readlink(path) === expected, 'INSTALL_FOREIGN_ENTRY')
}
async function switchLink(base: string, id: string): Promise<void> {
  const temp = join(base, `.current-${randomUUID()}`)
  await symlink(`releases/${id}`, temp)
  try { await rename(temp, join(base, 'current')); await syncDirectory(base) }
  finally { if (await exists(temp)) await unlink(temp) }
}
async function deleteVersion(root: string, m: ReleaseManifest): Promise<void> {
  await verifyFiles(root, m); await active(root)
  for (const f of m.files) await unlink(join(root, f.path))
  const directories = new Set(m.files.flatMap(f => { const list = []; let p = dirname(f.path); while (p !== '.') { list.push(p); p = dirname(p) } return list }))
  for (const path of [...directories].sort((a, b) => b.length - a.length)) await rmdir(join(root, path))
  await rmdir(root)
}
async function install(args: string[]): Promise<void> {
  const values = new Map<string, string>(), flags = new Set<string>()
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    check(!values.has(arg) && !flags.has(arg), 'INSTALL_USAGE')
    if (['--dry-run', '--uninstall', '--rollback'].includes(arg)) flags.add(arg)
    else { check(['--archive', '--manifest', '--prefix'].includes(arg) && args[i + 1] && !args[i + 1]!.startsWith('--'), 'INSTALL_USAGE'); values.set(arg, args[++i]!) }
  }
  check(values.has('--prefix') && !(flags.has('--uninstall') && flags.has('--rollback')), 'INSTALL_USAGE')
  const prefix = resolve(values.get('--prefix')!), base = join(prefix, 'lib/workmesh-connector'), bin = join(prefix, 'bin')
  check(prefix !== '/' && prefix !== '/usr' && prefix !== '/usr/local', 'INSTALL_PRIVATE_PREFIX_REQUIRED')
  const removal = flags.has('--uninstall') || flags.has('--rollback')
  check(removal ? values.size === 1 : values.size === 3, 'INSTALL_USAGE')
  let m: ReleaseManifest | undefined, entries: Map<string, Buffer> | undefined
  if (!removal) {
    m = await manifest(resolve(values.get('--manifest')!))
    const distribution = dirname(resolve(values.get('--manifest')!))
    check(digest(await regular(join(distribution, 'install.sh'))) === m.installScriptSha256, 'INSTALL_SCRIPT_HASH')
    for (const f of m.installerFiles) check(digest(await regular(join(distribution, f.path))) === f.sha256, 'INSTALL_HELPER_HASH')
    entries = await archive(resolve(values.get('--archive')!), m)
  }
  // Dry-run performs no directory creation, lock acquisition or other write.
  let nearest = prefix
  while (!await exists(nearest)) nearest = dirname(nearest)
  await safeDirectory(nearest)
  const fs = await statfs(nearest, { bigint: true })
  if (m) check(fs.bavail * fs.bsize >= BigInt(m.archive.size + m.files.reduce((s, f) => s + f.size, 0) * 2), 'INSTALL_SPACE_REQUIRED')
  if (flags.has('--dry-run')) { process.stdout.write('INSTALL_VALIDATED\n'); return }
  await withDirectoryLock(base, async () => {
    const ledgerPath = join(base, 'installed.json'), raw = await readPrivate(ledgerPath)
    let ledger = raw ? validateLedger(JSON.parse(raw.toString('utf8'))) : null
    const current = join(base, 'current'), entry = join(bin, 'workmesh-connector')
    if (ledger) await managedLink(current, `releases/${ledger.current}`)
    else check(!await exists(current), 'INSTALL_FOREIGN_ENTRY')
    await managedLink(entry, '../lib/workmesh-connector/current/bin/workmesh-connector')
    if (removal) {
      check(ledger, 'INSTALL_NOT_INSTALLED')
      for (const [id, installed] of Object.entries(ledger.versions)) await verifyFiles(join(base, 'releases', id), installed)
      if (flags.has('--rollback')) {
        check(ledger.previous, 'INSTALL_NO_PREVIOUS')
        const next = ledger.previous; ledger.previous = ledger.current; ledger.current = next
        await switchLink(base, next); await atomicWrite(ledgerPath, JSON.stringify(ledger) + '\n')
      } else {
        for (const id of Object.keys(ledger.versions)) await active(join(base, 'releases', id))
        if (await exists(entry)) await unlink(entry)
        if (await exists(current)) await unlink(current)
        for (const [id, installed] of Object.entries(ledger.versions)) await deleteVersion(join(base, 'releases', id), installed)
        await rmdir(join(base, 'releases')); await unlink(ledgerPath)
      }
      process.stdout.write(flags.has('--rollback') ? 'INSTALL_ROLLED_BACK\n' : 'INSTALL_REMOVED_CONFIG_AND_SECRETS_RETAINED\n'); return
    }
    check(m && entries, 'INSTALL_USAGE')
    const id = `${m.connectorVersion}-${m.arch}`, releases = join(base, 'releases'), destination = join(releases, id)
    if (!await exists(releases)) await mkdir(releases, { mode: 0o700 })
    await safeDirectory(releases)
    if (await exists(destination)) await verifyFiles(destination, m)
    else {
      const stage = join(releases, `.stage-${randomUUID()}`); await mkdir(stage, { mode: 0o700 })
      for (const f of m.files) {
        const path = join(stage, f.path); let parent = dirname(path), parts: string[] = []
        while (parent !== stage) { parts.unshift(parent); parent = dirname(parent) }
        for (const directory of parts) if (!await exists(directory)) await mkdir(directory, { mode: 0o700 })
        const handle = await open(path, 'wx', f.mode)
        try { await handle.writeFile(entries.get(f.path)!); await handle.sync() } finally { await handle.close() }
      }
      await verifyFiles(stage, m)
      const env = { ...process.env }; delete env.NODE_OPTIONS; delete env.NODE_PATH
      const { stdout } = await execute(join(stage, 'bin/workmesh-connector'), ['--version'], { env, timeout: 30000, maxBuffer: 4096 })
      const metadata = JSON.parse(stdout)
      check(metadata.connectorVersion === m.connectorVersion && metadata.sourceCommit === m.sourceCommit
        && metadata.arch === m.arch, 'INSTALL_EXECUTABLE_INVALID')
      await rename(stage, destination); await syncDirectory(releases)
    }
    if (!await exists(bin)) await mkdir(bin, { mode: 0o700 })
    await safeDirectory(bin)
    ledger ??= { schema: 'workmesh-connector-installed', current: id, previous: null, versions: {} }
    const previous = ledger.current === id ? ledger.previous : ledger.current
    // Only managed links change. Existing version files and config/secrets remain intact.
    const oldLedger = raw
    ledger.versions[id] = m; ledger.current = id; ledger.previous = previous
    await atomicWrite(ledgerPath, JSON.stringify(ledger) + '\n')
    try {
      await switchLink(base, id)
      if (!await exists(entry)) await symlink('../lib/workmesh-connector/current/bin/workmesh-connector', entry)
    } catch (error) {
      if (previous) await switchLink(base, previous)
      if (oldLedger) await atomicWrite(ledgerPath, oldLedger)
      throw error
    }
    process.stdout.write('INSTALL_COMPLETE\n')
  })
}
install(process.argv.slice(2)).catch(error => {
  const code = error instanceof Error && /^INSTALL_[A-Z_]+$/.test(error.message) ? error.message : 'INSTALL_FAILED'
  process.stderr.write(code + '\n'); process.exitCode = 1
})
