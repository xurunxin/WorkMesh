import { readFile, writeFile, mkdir, readdir, lstat, copyFile, chmod, realpath, cp } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { inject } from 'postject'
import { c as tar, x as untar } from 'tar'
import { parse as yaml } from 'yaml'

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..'), repo = resolve(app, '../..')
const require = createRequire(join(app, 'package.json'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const check = (ok, code) => { if (!ok) throw new Error(code) }
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()
const args = process.argv.slice(2).filter(x => x !== '--')
check(args.length === 2 && args[0] === '--output', 'Use --output <owned-new-directory>')
check(process.platform === 'linux' && ['x64', 'arm64'].includes(process.arch), 'Native Linux build required')
const output = resolve(args[1]), version = JSON.parse(await readFile(join(app, 'package.json'), 'utf8')).version
check(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-z0-9.-]+)?$/.test(version), 'Invalid release version')
const nodeVersion = (await readFile(join(repo, '.node-version'), 'utf8')).trim()
check(process.versions.node === nodeVersion, 'Wrong build Node')
const arch = process.arch === 'x64' ? 'amd64' : 'arm64'
const sourceCommit = run('git', ['rev-parse', 'HEAD'], { cwd: repo }), sourceTree = run('git', ['rev-parse', 'HEAD^{tree}'], { cwd: repo })
check(run('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repo }) === '', 'Build requires committed clean sources')
const lockBytes = await readFile(join(repo, 'pnpm-lock.yaml')), lock = yaml(lockBytes.toString('utf8'))
await mkdir(output, { mode: 0o700 })
const work = join(output, 'build'), payload = join(output, 'payload'), helper = join(output, `installer-linux-${arch}`)
for (const p of [work, payload, helper]) await mkdir(p, { mode: 0o700 })
const sums = await fetch(`https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`).then(r => { check(r.ok, 'Node sums unavailable'); return r.text() })
async function nodeArtifact(name) {
  const expected = sums.split('\n').find(l => l.endsWith('  ' + name))?.split(' ')[0]
  check(expected && /^[a-f0-9]{64}$/.test(expected), 'Node digest unavailable')
  const response = await fetch(`https://nodejs.org/dist/v${nodeVersion}/${name}`); check(response.ok, 'Node download failed')
  const bytes = Buffer.from(await response.arrayBuffer()); check(hash(bytes) === expected, 'Node digest mismatch')
  const path = join(work, name); await writeFile(path, bytes, { mode: 0o600 }); return { path, sha256: expected }
}
const runtime = await nodeArtifact(`node-v${nodeVersion}-linux-${process.arch}.tar.gz`)
const headers = await nodeArtifact(`node-v${nodeVersion}-headers.tar.gz`)
await untar({ file: runtime.path, cwd: work }); await untar({ file: headers.path, cwd: work })
const node = join(work, `node-v${nodeVersion}-linux-${process.arch}/bin/node`)
check(run(node, ['-p', 'process.versions.node']) === nodeVersion, 'Runtime version mismatch')
const tools = Object.fromEntries(['gcc', 'g++', 'make', 'python3'].map(name => [name, run(name, ['--version']).split('\n')[0]]))
const nativeNames = ['@napi-rs/keyring', 'koffi', 'node-pty']
async function packageRoot(name) {
  let p = dirname(await realpath(require.resolve(name)))
  while (p !== dirname(p)) {
    try { if (JSON.parse(await readFile(join(p, 'package.json'), 'utf8')).name === name) return p } catch (error) { if (error.code !== 'ENOENT') throw error }
    p = dirname(p)
  }
  throw new Error('Missing package ' + name)
}
const ptySource = await packageRoot('node-pty'), privatePty = join(work, 'node-pty')
await cp(ptySource, privatePty, { recursive: true, dereference: true, filter: path => !['node_modules', 'build', 'prebuilds'].includes(path.split('/').at(-1)) })
const addon = await packageRoot('node-addon-api')
await mkdir(join(privatePty, 'node_modules'), { mode: 0o700 })
await cp(addon, join(privatePty, 'node_modules/node-addon-api'), { recursive: true, dereference: true })
const gyp = require.resolve('node-gyp/bin/node-gyp.js')
const compile = run(node, [gyp, 'rebuild', `--nodedir=${join(work, `node-v${nodeVersion}`)}`, '--python=/usr/bin/python3'], {
  cwd: privatePty, env: { ...process.env, npm_config_build_from_source: 'true', npm_config_nodedir: join(work, `node-v${nodeVersion}`), npm_config_python: '/usr/bin/python3', npm_config_offline: 'true' },
})
await writeFile(join(output, 'native-build.log'), compile + '\n', { mode: 0o600 })
tools['node-gyp'] = JSON.parse(await readFile(join(dirname(dirname(gyp)), 'package.json'), 'utf8')).version
check(tools['node-gyp'] === '11.4.2', 'Wrong node-gyp')
const packageRoots = new Map()
const receipts = []
const allNative = []
async function copyPackage(name, root, directories) {
  packageRoots.set(name, root)
  const meta = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const key = `${meta.name}@${meta.version}`, integrity = lock.packages[key]?.resolution?.integrity
  check(integrity, 'Package missing from lock: ' + key)
  const files = []
  const walk = async (directory, prefix = '') => {
    for (const name of await readdir(directory)) {
      const path = join(directory, name), rel = prefix + name, info = await lstat(path)
      if (info.isDirectory()) {
        if (name === 'node_modules' || ['src', 'scripts', 'test', 'tests', 'obj', 'obj.target', 'vendor', 'examples', 'benchmark'].includes(name)) continue
        await walk(path, rel + '/')
      } else if (info.isFile() && (/\.(?:js|cjs|json|node)$/.test(name) || /^(?:license|copying|notice)/i.test(name))) {
        if (name.endsWith('.map') || rel.includes('build/') && rel !== 'build/Release/pty.node') continue
        files.push(rel)
      }
    }
  }
  await walk(root)
  const binaries = []
  for (const rel of files) {
    const bytes = await readFile(join(root, rel))
    if (rel.endsWith('.node')) {
      check(bytes.readUInt32BE(0) === 0x7f454c46 && bytes[4] === 2 && bytes.readUInt16LE(18) === (arch === 'amd64' ? 62 : 183), 'Wrong native ELF')
      const dynamic = run('readelf', ['-d', join(root, rel)]), symbols = run('readelf', ['--version-info', join(root, rel)])
      binaries.push({ path: `node_modules/${name}/${rel}`, elfMachine: bytes.readUInt16LE(18),
        needed: [...dynamic.matchAll(/Shared library: \[([^\]]+)\]/g)].map(m => m[1]),
        symbolVersions: [...new Set([...symbols.matchAll(/(?:GLIBCXX|GLIBC|CXXABI)_[\d.]+/g)].map(m => m[0]))].sort() })
    }
    for (const directory of directories) {
      const target = join(directory, 'node_modules', name, rel)
      await mkdir(dirname(target), { recursive: true, mode: 0o700 }); await writeFile(target, bytes, { mode: 0o600 })
    }
  }
  const receipt = { name, version: meta.version, integrity, binaries }; receipts.push(receipt); allNative.push(...binaries)
}
const keyringRoot = await packageRoot('@napi-rs/keyring'), koffiRoot = await packageRoot('koffi')
for (const [name, root] of [['@napi-rs/keyring', keyringRoot], ['koffi', koffiRoot], ['node-pty', privatePty]]) {
  await copyPackage(name, root, name === 'koffi' ? [payload, helper] : [payload])
  const meta = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  for (const optional of Object.keys(meta.optionalDependencies ?? {})) {
    if (!optional.includes('linux') || !optional.includes(process.arch) || optional.includes('musl')) continue
    const resolver = createRequire(join(root, 'package.json'))
    const resolved = dirname(resolver.resolve(optional + '/package.json'))
    await copyPackage(optional, resolved, name === 'koffi' ? [payload, helper] : [payload])
  }
}
check(allNative.some(b => b.path.endsWith('/pty.node')) && allNative.length >= 3, 'Incomplete native closure')
const key = await readFile(join(app, 'assets/workmesh-public-key.pem'))
check(key.equals(await readFile(join(repo, 'skills/workmesh/public-key.pem'))), 'Public key divergence')
const metadata = { connectorVersion: version, sourceCommit, sourceTree, nodeVersion, platform: 'linux', arch }
await writeFile(join(work, 'release.json'), JSON.stringify(metadata) + '\n', { mode: 0o600 })
await copyFile(join(work, 'release.json'), join(payload, 'release.json'))
const banner = `const __seaRequire = require('node:module').createRequire(require('node:fs').realpathSync(process.execPath)); require = __seaRequire; delete process.env.NODE_PATH; delete process.env.NODE_OPTIONS;`
const metafiles = []
async function sea(entry, path, assets = {}) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const bundle = join(work, path.includes('installer') ? 'installer.cjs' : 'connector.cjs')
  const result = await build({ entryPoints: [join(app, entry)], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', target: 'node22',
    external: nativeNames, banner: { js: banner }, sourcemap: false, metafile: true,
    plugins: [{ name: 'sea-key', setup(b) { b.onResolve({ filter: /trusted-key\.js$/ }, () => ({ path: join(app, 'src/release-trusted-key.ts') })) } }],
  })
  metafiles.push(result.metafile)
  const config = join(work, path.includes('installer') ? 'installer-sea.json' : 'connector-sea.json'), blob = config + '.blob'
  await writeFile(config, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false, assets }))
  run(node, ['--experimental-sea-config', config])
  await copyFile(node, path)
  await inject(path, 'NODE_SEA_BLOB', await readFile(blob), { sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2' })
  await chmod(path, 0o700)
}
await sea('src/release-entry.ts', join(payload, 'bin/workmesh-connector'), {
  'workmesh-public-key.pem': join(app, 'assets/workmesh-public-key.pem'), 'release.json': join(work, 'release.json'),
})
await sea('scripts/install-entry.ts', join(helper, 'bin/workmesh-connector-installer'))
await cp(helper, join(payload, 'installer'), { recursive: true, dereference: true })
await copyFile(join(app, 'scripts/uninstall.sh'), join(payload, 'uninstall.sh')); await chmod(join(payload, 'uninstall.sh'), 0o700)
const licenses = []
for (const input of new Set(metafiles.flatMap(m => Object.keys(m.inputs)))) {
  let root = dirname(resolve(input))
  while (root !== dirname(root)) {
    if (await lstat(join(root, 'package.json')).then(i => i.isFile()).catch(e => { if (e.code === 'ENOENT') return false; throw e })) {
      const packageMeta = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
      for (const name of await readdir(root)) if (/^(license|copying|notice)/i.test(name) && (await lstat(join(root, name))).isFile()) {
        const relative = `LICENSES/${packageMeta.name.replaceAll('/', '_')}-${packageMeta.version}-${name}`
        await mkdir(join(payload, 'LICENSES'), { recursive: true, mode: 0o700 }); await copyFile(join(root, name), join(payload, relative)); await chmod(join(payload, relative), 0o600); licenses.push(relative)
      }
      break
    }
    root = dirname(root)
  }
}
// Native package licenses and the runtime license are shipped too.
for (const receipt of receipts) {
  const root = packageRoots.get(receipt.name)
  for (const name of await readdir(root)) if (/^(license|copying|notice)/i.test(name) && (await lstat(join(root, name))).isFile()) {
    const rel = `LICENSES/${receipt.name.replaceAll('/', '_')}-${name}`
    await mkdir(join(payload, 'LICENSES'), { recursive: true, mode: 0o700 }); await copyFile(join(root, name), join(payload, rel)); await chmod(join(payload, rel), 0o600); licenses.push(rel)
  }
}
await copyFile(join(work, `node-v${nodeVersion}-linux-${process.arch}/LICENSE`), join(payload, 'LICENSES/node-LICENSE')); licenses.push('LICENSES/node-LICENSE')
await chmod(join(payload, 'LICENSES/node-LICENSE'), 0o600)
async function fileList(root, prefix = '') {
  const list = []
  for (const name of (await readdir(root)).sort()) {
    const path = join(root, name), info = await lstat(path), relative = prefix + name
    check(!info.isSymbolicLink(), 'Release symlink rejected')
    if (info.isDirectory()) list.push(...await fileList(path, relative + '/'))
    else { const bytes = await readFile(path); list.push({ path: relative, mode: info.mode & 0o777, size: bytes.length, sha256: hash(bytes) }) }
  }
  return list
}
const helperFiles = (await fileList(helper)).map(f => ({ ...f, path: `installer-linux-${arch}/${f.path}` }))
let shell = await readFile(join(app, 'scripts/install.sh'), 'utf8')
shell = shell.replace('@ARCH@', arch).replace('@HELPER_SUMS@', helperFiles.map(f => `${f.sha256}  ${f.path}`).join('\n'))
await writeFile(join(output, 'install.sh'), shell, { mode: 0o700 })
const files = await fileList(payload), archiveName = `workmesh-connector-${version}-linux-${arch}.tar.gz`, archivePath = join(output, archiveName)
await tar({ gzip: true, cwd: payload, file: archivePath, portable: true, noMtime: true }, files.map(f => f.path))
const archiveBytes = await readFile(archivePath)
const manifest = { schema: 'workmesh-connector-release', ...metadata, lockSha256: hash(lockBytes), publicKeySha256: hash(key),
  archive: { name: archiveName, size: archiveBytes.length, sha256: hash(archiveBytes) }, files, installerFiles: helperFiles,
  installScriptSha256: hash(Buffer.from(shell)), nativeDependencies: receipts,
  build: { headersSha256: headers.sha256, headersUrl: `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-headers.tar.gz`, runtimeSha256: runtime.sha256, tools, nodeAbi: process.versions.modules },
  licenses: [...new Set(licenses)].sort(),
}
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
await writeFile(join(output, 'SHA256SUMS'), `${hash(archiveBytes)}  ${archiveName}\n${hash(await readFile(join(output, 'manifest.json')))}  manifest.json\n${hash(Buffer.from(shell))}  install.sh\n` + helperFiles.map(f => `${f.sha256}  ${f.path}\n`).join(''), { mode: 0o600 })
const result = JSON.parse(run(join(payload, 'bin/workmesh-connector'), ['--version']))
check(JSON.stringify(result) === JSON.stringify(metadata), 'SEA metadata mismatch')
await writeFile(join(output, 'build-receipt.json'), JSON.stringify({ ...metadata, nativeDependencies: receipts, build: manifest.build, manifestSha256: hash(await readFile(join(output, 'manifest.json'))), complete: true }, null, 2) + '\n')
console.log(JSON.stringify({ archive: archiveName, sha256: hash(archiveBytes), sourceCommit, arch }))
