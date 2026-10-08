import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { constants } from 'node:fs'
import { chmod, lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import koffi from 'koffi'
import { ConnectorError, requireThat } from './errors.js'

const execute = promisify(execFile)
const windows = process.platform === 'win32'
const kernel = windows ? koffi.load('kernel32.dll') : null
const nativeOpen = kernel?.func('void * __stdcall CreateFileW(str16 path, uint32 access, uint32 share, void * security, uint32 creation, uint32 flags, void * template)')
const nativeClose = kernel?.func('int __stdcall CloseHandle(void * handle)')
const nativeLock = kernel?.func('int __stdcall LockFileEx(void * handle, uint32 flags, uint32 reserved, uint32 low, uint32 high, void * overlapped)')
const nativeError = kernel?.func('uint32 __stdcall GetLastError()')
const nativeMove = kernel?.func('int __stdcall MoveFileExW(str16 source, str16 target, uint32 flags)')
const nativeDirectory = kernel?.func('int __stdcall CreateDirectoryW(str16 path, void * security)')
const attributes = kernel?.func('uint32 __stdcall GetFileAttributesW(str16 path)')
const localFree = kernel?.func('void * __stdcall LocalFree(void * pointer)')
const security = windows ? koffi.load('advapi32.dll') : null
const fromSddl = security?.func('int __stdcall ConvertStringSecurityDescriptorToSecurityDescriptorW(str16 text, uint32 revision, _Out_ void ** descriptor, void * size)')
const toSddl = security?.func('int __stdcall ConvertSecurityDescriptorToStringSecurityDescriptorW(void * descriptor, uint32 revision, uint32 info, _Out_ void ** text, void * size)')
const setSecurity = security?.func('int __stdcall SetFileSecurityW(str16 path, uint32 info, void * descriptor)')
const getSecurity = security?.func('int __stdcall GetFileSecurityW(str16 path, uint32 info, _Out_ void * descriptor, uint32 length, _Out_ uint32 * needed)')
let currentSid: Promise<string> | undefined
function userSid(): Promise<string> {
  return currentSid ??= execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value'], { windowsHide: true })
    .then(({ stdout }) => { const sid = stdout.trim(); requireThat(/^S-[0-9]+-[0-9]+(?:-[0-9]+)+$/.test(sid), 'CONNECTOR_USER_SID_INVALID'); return sid })
}
async function withSecurityAttributes<T>(action: (attributes: Buffer) => T): Promise<T> {
  const sid = await userSid(); const output: unknown[] = [null]
  requireThat(fromSddl!(`O:${sid}D:P(A;;FA;;;${sid})`, 1, output, null), 'CONNECTOR_UNSAFE_ACL')
  try {
    requireThat(typeof output[0] === 'bigint', 'CONNECTOR_UNSAFE_ACL')
    const attributes = Buffer.alloc(process.arch === 'ia32' ? 12 : 24)
    attributes.writeUInt32LE(attributes.length, 0)
    if (process.arch === 'ia32') attributes.writeUInt32LE(Number(output[0]), 4)
    else attributes.writeBigUInt64LE(output[0], 8)
    return action(attributes)
  } finally { localFree!(output[0]) }
}
function nativePathError(code: number): NodeJS.ErrnoException {
  return Object.assign(new ConnectorError('CONNECTOR_NATIVE_FILE_FAILED'), { code: code === 80 || code === 183 ? 'EEXIST' : code === 3 ? 'ENOENT' : 'EIO' })
}
const libc = windows ? null : koffi.load(process.platform === 'darwin' ? '/usr/lib/libSystem.B.dylib' : 'libc.so.6')
const flock = libc?.func('int flock(int fd, int operation)')
const errnoAddress = libc?.func(process.platform === 'darwin' ? 'int * __error()' : 'int * __errno_location()')

// 创建时传入安全描述符，写敏感字节前读回实际 owner/DACL。
async function acl(path: string, establish: boolean): Promise<void> {
  try {
    const sid = await userSid()
    const expected = `O:${sid}D:P(A;;FA;;;${sid})`
    requireThat((attributes!(path) & 0x400) === 0, 'CONNECTOR_UNSAFE_PATH')
    if (establish) {
      const output: unknown[] = [null]
      requireThat(fromSddl!(expected, 1, output, null), 'CONNECTOR_UNSAFE_ACL')
      try { requireThat(setSecurity!(path, 0x80000005, output[0]), 'CONNECTOR_UNSAFE_ACL') }
      finally { localFree!(output[0]) }
    }
    const descriptor = Buffer.alloc(32_768); const needed = [0]
    requireThat(getSecurity!(path, 5, descriptor, descriptor.length, needed), 'CONNECTOR_UNSAFE_ACL')
    const output: unknown[] = [null]
    requireThat(toSddl!(descriptor, 1, 5, output, null), 'CONNECTOR_UNSAFE_ACL')
    try { requireThat(typeof output[0] === 'bigint' && koffi.decode.string16(output[0]) === expected, 'CONNECTOR_UNSAFE_ACL') }
    finally { localFree!(output[0]) }
  } catch { throw new ConnectorError('CONNECTOR_UNSAFE_ACL') }
}
export async function verifyPrivate(path: string, directory = false): Promise<void> {
  const info = await lstat(path)
  requireThat(!info.isSymbolicLink() && (directory ? info.isDirectory() : info.isFile() && info.nlink === 1), 'CONNECTOR_UNSAFE_PATH')
  if (windows) await acl(path, false)
  else requireThat(info.uid === process.getuid?.() && (info.mode & 0o777) === (directory ? 0o700 : 0o600)
    && (directory || info.nlink === 1), 'CONNECTOR_UNSAFE_PERMISSIONS')
}
export async function prepareDirectory(directory: string): Promise<void> {
  const path = resolve(directory)
  let ancestor = dirname(path)
  while (dirname(ancestor) !== ancestor) {
    try {
      const info = await lstat(ancestor)
      requireThat(!info.isSymbolicLink(), 'CONNECTOR_UNSAFE_PATH')
      if (windows) {
        requireThat((attributes!(ancestor) & 0x400) === 0, 'CONNECTOR_UNSAFE_PATH')
      }
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new ConnectorError('CONNECTOR_UNSAFE_PATH') }
    ancestor = dirname(ancestor)
  }
  try {
    if (windows) await withSecurityAttributes(attributes => {
      if (!nativeDirectory!(path, attributes)) throw nativePathError(nativeError!())
    })
    else await mkdir(path, { mode: 0o700, recursive: false })
  }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') { await mkdir(dirname(path), { recursive: true }); return prepareDirectory(path) }
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
  }
  await verifyPrivate(path, true)
}
async function privateEmpty(path: string): Promise<void> {
  if (windows) {
    await withSecurityAttributes(attributes => {
      const handle = nativeOpen!(path, 0x40000000, 3, attributes, 1, 0x00200000, null)
      if (handle === null || koffi.address(handle) === 0xffffffffffffffffn) throw nativePathError(nativeError!())
      nativeClose!(handle)
    })
    await verifyPrivate(path)
    return
  }
  const handle = await open(path, 'wx', 0o600)
  await handle.close()
  await chmod(path, 0o600)
  await verifyPrivate(path)
}
export async function readPrivate(path: string): Promise<Buffer | null> {
  try {
    await verifyPrivate(path)
    const handle = await open(path, constants.O_RDONLY | (windows ? 0 : constants.O_NOFOLLOW))
    try { return await handle.readFile() } finally { await handle.close() }
  } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e }
}
export async function syncDirectory(directory: string): Promise<void> {
  if (windows) return // MoveFileExW 的 WRITE_THROUGH 覆盖本地原子替换。
  const handle = await open(directory, constants.O_RDONLY)
  try { await handle.sync() } finally { await handle.close() }
}
export async function atomicWrite(path: string, bytes: string | Uint8Array): Promise<void> {
  const temp = join(dirname(path), `.connector-tmp-${randomUUID()}`)
  await privateEmpty(temp)
  try {
    const handle = await open(temp, constants.O_WRONLY | (windows ? 0 : constants.O_NOFOLLOW))
    try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
    if (await readPrivate(path) !== null) await verifyPrivate(path)
    if (windows) requireThat(nativeMove!(temp, path, 0x1 | 0x8), 'CONNECTOR_RENAME_FAILED')
    else await rename(temp, path)
    await syncDirectory(dirname(path))
  } finally { await unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e }) }
}
export async function removePrivate(path: string): Promise<void> {
  if (await readPrivate(path) !== null) { await unlink(path); await syncDirectory(dirname(path)) }
}
export async function cleanTemps(directory: string): Promise<void> {
  for (const name of await readdir(directory)) if (/^\.connector-tmp-[a-f0-9-]{36}$/.test(name)) await removePrivate(join(directory, name))
}
export async function withDirectoryLock<T>(directory: string, action: () => Promise<T>): Promise<T> {
  await prepareDirectory(directory)
  const path = join(directory, 'connector.lock')
  try { await privateEmpty(path) } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e }
  await verifyPrivate(path)
  if (windows) {
    const handle = nativeOpen!(path, 0x80000000 | 0x40000000, 3, null, 3, 0x00200000, null)
    requireThat(handle !== null && koffi.address(handle) !== 0xffffffffffffffffn, 'CONNECTOR_LOCK_FAILED')
    const overlapped = Buffer.alloc(process.arch === 'ia32' ? 20 : 32)
    try {
      while (!nativeLock!(handle, 3, 0, 1, 0, overlapped)) {
        requireThat(nativeError!() === 33, 'CONNECTOR_LOCK_FAILED')
        await new Promise(r => setTimeout(r, 50))
      }
      await verifyPrivate(path)
      return await action()
    } finally { nativeClose!(handle) }
  }
  const handle = await open(path, constants.O_RDWR | constants.O_NOFOLLOW)
  try {
    while (flock!(handle.fd, 2 | 4) !== 0) {
      requireThat([4, 11, 35].includes(koffi.decode.int(errnoAddress!())), 'CONNECTOR_LOCK_FAILED')
      await new Promise(r => setTimeout(r, 50))
    }
    await verifyPrivate(path)
    return await action()
  } finally { flock!(handle.fd, 8); await handle.close() }
}
