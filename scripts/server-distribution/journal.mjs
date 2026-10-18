import { open, rename, readFile, mkdir, lstat, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fail } from './manifest.mjs'

export const stages = ['verified', 'staged', 'backed_up', 'migrated', 'healthy', 'committed']
export const candidateWasWithdrawn = journal => journal?.withdrawnAt !== undefined
  || journal?.recovery?.status === 'previous-restored'
export async function privateDirectory(directory, { create = false } = {}) {
  if (!path.isAbsolute(directory) || /[,\r\n\0]/.test(directory)) fail('INSTALL_UNSAFE_PATH')
  if (create) await mkdir(directory, { recursive: false, mode: 0o700 })
  let cursor = directory
  while (true) {
    const info = await lstat(cursor)
    if (!info.isDirectory() || info.isSymbolicLink()) fail('INSTALL_UNSAFE_PATH')
    if (process.platform !== 'win32' && ((info.mode & 0o002) && !(info.mode & 0o1000))) fail('INSTALL_UNSAFE_ANCESTOR')
    if (path.dirname(cursor) === cursor) break
    cursor = path.dirname(cursor)
  }
  const info = await lstat(directory)
  if (await realpath(directory) !== directory || (process.platform !== 'win32'
    && ((info.mode & 0o077) || (info.uid !== process.getuid() && info.uid !== 0)))) fail('INSTALL_UNSAFE_PATH')
}
export async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`
  const handle = await open(temporary, 'wx', 0o600)
  try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync() }
  finally { await handle.close() }
  await rename(temporary, file)
  if (process.platform !== 'win32') {
    const directory = await open(path.dirname(file), 'r')
    try { await directory.sync() } finally { await directory.close() }
  }
}
export async function withInstallLock(directory, action) {
  const file = path.join(directory, 'install.lock')
  let handle
  try { handle = await open(file, 'wx', 0o600) } catch { fail('INSTALL_LOCKED') }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, owner: randomUUID() }) + '\n')
    await handle.sync()
    return await action()
  } finally { await handle.close(); await unlink(file) }
}
export async function readState(file) {
  try {
    const info = await lstat(file)
    if (!info.isFile() || info.isSymbolicLink() || (process.platform !== 'win32' && (info.mode & 0o077))) fail('INSTALL_UNSAFE_STATE')
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) { if (error.code === 'ENOENT') return undefined; fail('INSTALL_INVALID_JOURNAL') }
}
export function validateJournal(value) {
  if (!value || value.format !== 'workmesh-install-journal' || !stages.includes(value.stage)
    || !/^[a-f0-9]{64}$/.test(value.candidate) || !/^[a-f0-9]{64}$/.test(value.configHash)
    || !/^[a-z][a-z0-9-]{2,47}$/.test(value.project) || !Array.isArray(value.actions)
    || value.actions.some(action => !['intent', 'completed', 'failed'].includes(action.status))) fail('INSTALL_INVALID_JOURNAL')
  return value
}
