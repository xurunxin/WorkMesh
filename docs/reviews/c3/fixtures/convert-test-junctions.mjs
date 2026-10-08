import { readdir, lstat, readlink, unlink, symlink } from 'node:fs/promises'
import path from 'node:path'
const prefix = process.env.C3_WINDOWS_DEPLOY_ROOT + '\\'
let count = 0
async function walk(directory) {
  for (const entry of await readdir(directory)) {
    const file = path.join(directory, entry)
    const stat = await lstat(file)
    if (stat.isSymbolicLink()) {
      const target = await readlink(file)
      if (!target.includes(':')) {
        if (!path.resolve(path.dirname(file), target).startsWith('/app/')) throw new Error('相对链接越界')
        continue
      }
      const ownApi = process.env.C3_WINDOWS_WORKSPACE_ROOT + '\\apps\\api\\'
      if (!target.startsWith(prefix) && target !== ownApi) throw new Error(`测试产物链接越界: ${file}`)
      const linuxTarget = target === ownApi ? '/app' : path.join('/app', target.slice(prefix.length).replaceAll('\\', '/'))
      if (linuxTarget !== '/app' && !linuxTarget.startsWith('/app/')) throw new Error('测试产物链接越界')
      await unlink(file)
      await symlink(path.relative(path.dirname(file), linuxTarget), file)
      count++
    } else if (stat.isDirectory()) await walk(file)
  }
}
await walk('/app/node_modules')
console.log(JSON.stringify({ convertedWindowsJunctions: count, compiledFilesUnchanged: true }))
