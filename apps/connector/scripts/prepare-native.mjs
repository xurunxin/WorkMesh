import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { copyFile, lstat, readFile, rename, unlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'

// node-pty 1.1.0 的 Darwin prebuild helper 在上游 tarball 中缺少执行位。
// 仅准备安装目录内的私有副本；不 chmod pnpm CAS 的硬链接。
if (process.platform === 'darwin') {
  const root = dirname(createRequire(import.meta.url).resolve('node-pty/package.json'))
  if (JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version !== '1.1.0') throw new Error('原生依赖版本改变，需要重新核验')
  let found = false
  for (const directory of ['build/Release', `prebuilds/darwin-${process.arch}`]) {
    const path = join(root, directory, 'spawn-helper')
    let info
    try { info = await lstat(path) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('原生 helper 路径不安全')
    found = true
    if ((info.mode & 0o111) === 0o111) continue
    const before = await readFile(path), temporary = path + '.' + randomUUID() + '.tmp'
    try {
      await copyFile(path, temporary, constants.COPYFILE_EXCL)
      const { chmod } = await import('node:fs/promises')
      await chmod(temporary, 0o755)
      await rename(temporary, path)
      if (!(await readFile(path)).equals(before) || (await lstat(path)).nlink !== 1) throw new Error('原生 helper 私有副本验证失败')
      console.log(JSON.stringify({ resource: 'nativeHelper', path, priorMode: info.mode & 0o777, mode: 0o755,
        sha256: createHash('sha256').update(before).digest('hex'), privateCopy: true }))
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
  }
  if (!found) throw new Error('缺少原生 Darwin helper')
}
