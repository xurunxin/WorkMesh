import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

const owned = new Set<string>()
export async function temporaryDirectory(kind: string, root = process.platform === 'win32' ? process.env.APPDATA! : tmpdir()): Promise<string> {
  if (!/^[a-z-]+$/.test(kind)) throw new Error('Invalid test resource kind')
  const boundary = await realpath(root)
  const path = await realpath(await mkdtemp(join(boundary, `workmesh-b1-b2-${kind}-`)))
  owned.add(path)
  boundaries.set(path, boundary + sep)
  console.log(JSON.stringify({ resource: 'temporaryPath', path, state: 'created' }))
  return path
}
const boundaries = new Map<string, string>()
export async function cleanupDirectory(path: string): Promise<void> {
  const boundary = boundaries.get(path)
  if (!owned.has(path) || !boundary || !resolve(path).startsWith(boundary)) throw new Error('Invalid test cleanup boundary')
  await rm(path, { recursive: true, force: true })
  owned.delete(path)
  boundaries.delete(path)
  console.log(JSON.stringify({ resource: 'temporaryPath', path, state: 'removed' }))
}
