import { access, cp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const deployRoot = path.resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('Production deploy directory is required')

const exists = async value => access(value).then(() => true, () => false)
const workspaceRoot = path.join(deployRoot, 'node_modules', '@workmesh')
const sourceRoot = path.resolve(import.meta.dirname, '..', '..')

if (await exists(workspaceRoot)) {
  for (const name of await import('node:fs/promises').then(fs => fs.readdir(workspaceRoot))) {
    const packageRoot = await realpath(path.join(workspaceRoot, name))
    const manifestPath = path.join(packageRoot, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const rootEntry = path.join(packageRoot, 'dist', 'index.js')
    const nestedEntry = path.join(packageRoot, 'dist', 'src', 'index.js')
    if (await exists(rootEntry)) manifest.exports = './dist/index.js'
    else if (await exists(nestedEntry)) manifest.exports = './dist/src/index.js'
    else throw new Error(`Compiled workspace entry point is missing: ${manifest.name}`)
    if (manifest.name === '@workmesh/config') {
      await cp(
        path.join(sourceRoot, 'packages', 'config', 'src', 'runtime-secrets.mjs'),
        path.join(packageRoot, 'dist', 'runtime-secrets.mjs'),
      )
    }
    if (manifest.name === '@workmesh/db') {
      await cp(
        path.join(packageRoot, 'migrations'),
        path.join(packageRoot, 'dist', 'migrations'),
        { recursive: true },
      )
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8')
    await rm(path.join(packageRoot, 'src'), { recursive: true, force: true })
    await rm(path.join(packageRoot, 'integration'), { recursive: true, force: true })
  }
}

await rm(path.join(deployRoot, 'src'), { recursive: true, force: true })
await rm(path.join(deployRoot, 'integration'), { recursive: true, force: true })
