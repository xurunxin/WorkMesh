import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { constants } from 'node:fs'
import { chmod, lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import koffi from 'koffi'
import { ConnectorError, requireThat } from './errors.js'
import { trustedPosixDirectory, trustedWindowsDescriptor } from './path-policy.js'

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
const macAclGet = process.platform === 'darwin' ? libc?.func('void * acl_get_file(str path, int type)') : null
const macAclText = process.platform === 'darwin' ? libc?.func('void * acl_to_text(void * acl, void * length)') : null
const macAclFree = process.platform === 'darwin' ? libc?.func('int acl_free(void * acl)') : null

async function verifyAncestor(path: string): Promise<void> {
  const info = await lstat(path)
  requireThat(info.isDirectory() && !info.isSymbolicLink(), 'CONNECTOR_UNSAFE_PATH')
  if (windows) {
    requireThat((attributes!(path) & 0x400) === 0, 'CONNECTOR_UNSAFE_PATH')
    const descriptor = Buffer.alloc(32_768), needed = [0]
    requireThat(getSecurity!(path, 5, descriptor, descriptor.length, needed), 'CONNECTOR_UNSAFE_ACL')
    trustedWindowsDescriptor(descriptor.subarray(0, needed[0]), await userSid())
  } else {
    trustedPosixDirectory(info.uid, info.mode, process.getuid!())
    if (macAclGet) {
      const entry = macAclGet(path, 0x100)
      requireThat(entry, 'CONNECTOR_UNSAFE_ACL')
      try {
        const text = macAclText!(entry, null)
        requireThat(text, 'CONNECTOR_UNSAFE_ACL')
        try {
          // macOS 扩展 ACL 不受 chmod 的 mode 位完整约束；保守拒绝所有修改型 allow。
          const aclText = koffi.decode.string(text)
          requireThat(!aclText.split('\n').some(line => /\ballow\b/.test(line)
            && /\b(?:write|append|delete|delete_child|add_file|add_subdirectory|writeattr|writeextattr|writesecurity|chown)\b/.test(line)), 'CONNECTOR_UNSAFE_ANCESTOR')
        } finally { macAclFree!(text) }
      } finally { macAclFree!(entry) }
    }
  }
}

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
async function withPreparedDirectory<T>(directory: string, action: () => Promise<T>): Promise<T> {
  const path = resolve(directory)
  const chain: string[] = []
  for (let part = path; ; part = dirname(part)) { chain.unshift(part); if (dirname(part) === part) break }
  const handles: unknown[] = []
  try {
    for (const part of chain) {
      try { await lstat(part) }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
        // 父级已经核验，缺失层级在创建时即保护，不用默认 ACL 的 recursive mkdir。
        try {
          if (windows) await withSecurityAttributes(attributes => {
            if (!nativeDirectory!(part, attributes)) throw nativePathError(nativeError!())
          })
          else await mkdir(part, { mode: 0o700 })
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
      }
      if (windows) {
        // 根到叶逐级固定目录对象；不共享写入/删除，封住空祖先被设置 reparse 的窗口。
        const handle = nativeOpen!(part, 0x20000 | 0x80, 1, null, 3, 0x02000000 | 0x00200000, null)
        requireThat(handle !== null && koffi.address(handle) !== 0xffffffffffffffffn, 'CONNECTOR_UNSAFE_PATH')
        handles.push(handle)
      }
      await verifyAncestor(part)
    }
    await verifyPrivate(path, true)
    return await action()
  } finally { for (const handle of handles.reverse()) nativeClose!(handle) }
}
export async function prepareDirectory(directory: string): Promise<void> {
  await withPreparedDirectory(directory, async () => {})
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
  return withPreparedDirectory(directory, () => lockPreparedDirectory(directory, action))
}
async function lockPreparedDirectory<T>(directory: string, action: () => Promise<T>): Promise<T> {
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
