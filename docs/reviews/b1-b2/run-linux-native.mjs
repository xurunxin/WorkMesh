import { execFileSync, spawn } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const out = resolve(root, 'docs/reviews/b1-b2/evidence', process.argv[2] ?? 'linux-native-01')
mkdirSync(out, { recursive: true })
const temporary = mkdtempSync(join(tmpdir(), 'workmesh-b1-b2-linux-'))
const name = 'b1b2-01a11ac2-linux-native-' + randomUUID().slice(0, 8)
const resources = { name, temporary, image: 'node:22.19.0-bookworm', source: [], id: null, cleaned: false, temporaryCleaned: false }
const save = () => writeFileSync(join(out, 'resources.json'), JSON.stringify(resources, null, 2) + '\n')
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true }).trim()
let activeChild
const stop = () => activeChild?.kill('SIGTERM')
process.on('SIGINT', stop); process.on('SIGTERM', stop)
function copy(path) {
  const source = resolve(root, path), target = join(temporary, path)
  if (['node_modules', 'dist', '.turbo'].includes(path.split('/').at(-1))) return
  try {
    const entries = readdirSync(source, { withFileTypes: true }); mkdirSync(target, { recursive: true })
    for (const entry of entries) copy(path + '/' + entry.name)
  } catch (error) {
    if (error.code !== 'ENOTDIR') throw error
    const bytes = readFileSync(source); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes)
    resources.source.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
}
try {
  for (const path of ['apps/connector', 'packages/contracts', 'skills/workmesh/public-key.pem', 'apps/web/public/skills/workmesh-1.1.0.md',
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json', 'vitest.config.ts',
    'scripts/test-connector-linux.sh', 'scripts/connector-secret-probe.mts']) copy(path)
  save()
  resources.id = docker('run', '-d', '--name', name, '--label', 'workmesh.task=01a11ac2-b1-b2', resources.image, 'sleep', 'infinity'); save()
  docker('exec', name, 'mkdir', '-p', '/workspace')
  docker('cp', temporary + '/.', name + ':/workspace')
  const child = spawn('docker', ['exec', '-w', '/workspace', name, 'bash', '-lc',
    'set -euo pipefail; apt-get update; apt-get install -y gnome-keyring dbus-x11 sudo; corepack enable; corepack prepare pnpm@9.15.4 --activate; pnpm install --frozen-lockfile; dbus-run-session -- bash scripts/test-connector-linux.sh'], { windowsHide: true })
  activeChild = child
  let output = ''
  child.stdout.on('data', b => { output += b.toString() }); child.stderr.on('data', b => { output += b.toString() })
  const code = await new Promise((resolve, reject) => { child.on('close', resolve); child.on('error', reject) })
  activeChild = undefined
  writeFileSync(join(out, 'native.log'), output.replace(/\bwm[a-z]_[A-Za-z0-9_-]{43,}/g, '[已隐藏]'))
  resources.exitCode = code; process.exitCode = code === 0 ? 0 : 1
  console.log(`Linux 实际后端验证：exit=${code}`)
  if (code !== 0) console.log(output.slice(-2500).replace(/\bwm[a-z]_[A-Za-z0-9_-]{43,}/g, '[已隐藏]'))
} finally {
  process.off('SIGINT', stop); process.off('SIGTERM', stop)
  if (resources.id) { try { docker('rm', '-f', '-v', resources.id); resources.cleaned = true } catch { resources.cleanupError = '容器清理失败，保留 ID 待核查' } }
  const target = resolve(temporary), boundary = resolve(tmpdir()) + '\\'
  if (process.platform === 'win32' && !target.toLowerCase().startsWith(boundary.toLowerCase())) throw new Error('临时路径超出边界')
  rmSync(target, { recursive: true, force: true }); resources.temporaryCleaned = true; save()
}
