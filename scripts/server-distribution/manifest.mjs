import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, lstat, realpath } from 'node:fs/promises'
import path from 'node:path'

export const hash = bytes => createHash('sha256').update(bytes).digest('hex')
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}'
}
export async function fileHash(file) {
  const digest = createHash('sha256')
  for await (const block of createReadStream(file)) digest.update(block)
  return digest.digest('hex')
}
export function fail(code) { throw new Error(code) }
const keys = (object, expected) => object && !Array.isArray(object) && typeof object === 'object'
  && Object.keys(object).sort().join(',') === expected.sort().join(',')
const hex = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value)
export function validateManifest(value) {
  if (!keys(value, ['format', 'release', 'arch', 'source', 'images', 'files', 'chunks', 'bootstrapChunks', 'migrationLedger', 'installerImage', 'installerArchiveImage', 'tools', 'runtimeFingerprint'])
    || value.format !== 'workmesh-server-distribution' || !/^[a-z0-9][a-z0-9.-]{0,63}$/.test(value.release)
    || !['amd64', 'arm64'].includes(value.arch) || !keys(value.source, ['commit', 'tree'])
    || !hex(value.source.commit, 40) || !hex(value.source.tree, 40)) fail('INSTALL_MANIFEST_INVALID')
  if (!hex(value.runtimeFingerprint, 64)) fail('INSTALL_RUNTIME_FINGERPRINT_INVALID')
  const roles = ['api', 'worker', 'mcp', 'lite', 'installer', 'postgres', 'redis', 'minio']
  if (!keys(value.tools, ['producerNode', 'producerDocker', 'installerNode', 'installerDocker', 'installerCompose', 'pgDump', 'pgRestore'])
    || Object.values(value.tools).some(version => typeof version !== 'string' || !version || version.length > 512 || /[\r\n\0]/.test(version))) fail('INSTALL_TOOLS_INVALID')
  if (!keys(value.images, roles) || value.installerImage !== value.images.installer.id
    || value.installerArchiveImage !== value.images.installer.archiveId) fail('INSTALL_IMAGES_INVALID')
  for (const [role, image] of Object.entries(value.images)) {
    if (!keys(image, ['id', 'archiveId', 'reference', 'revision']) || !/^sha256:[a-f0-9]{64}$/.test(image.id)
      || !/^sha256:[a-f0-9]{64}$/.test(image.archiveId)
      || !/^[a-z0-9][a-z0-9/_.:@-]+$/.test(image.reference)
      || (['api', 'worker', 'mcp', 'lite', 'installer'].includes(role) && image.revision !== value.source.commit)
      || typeof image.revision !== 'string') fail('INSTALL_IMAGES_INVALID')
  }
  if (!Array.isArray(value.files) || !Array.isArray(value.chunks) || !value.chunks.length
    || !Array.isArray(value.bootstrapChunks) || !value.bootstrapChunks.length
    || value.chunks.length > 1000 || !Array.isArray(value.migrationLedger) || !value.migrationLedger.length)
    fail('INSTALL_MANIFEST_INVALID')
  const seen = new Map()
  for (const entry of [...value.files, ...value.chunks, ...value.bootstrapChunks]) {
    if (!keys(entry, ['path', 'sha256', 'bytes']) || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(entry.path)
      || entry.path.split('/').some(part => !part || part === '.' || part === '..')
      || !hex(entry.sha256, 64) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1
      || entry.bytes > 64 * 1024 * 1024 || (seen.has(entry.path) && seen.get(entry.path) !== JSON.stringify(entry))) fail('INSTALL_FILES_INVALID')
    seen.set(entry.path, JSON.stringify(entry))
  }
  if (value.files.map(file => file.path).sort().join(',') !== 'config.example.json,docker-compose.lite.yml,docker-compose.production.yml,install.sh')
    fail('INSTALL_FILES_INVALID')
  for (const entry of value.migrationLedger) {
    if (!keys(entry, ['version', 'checksumSha256']) || !/^[a-zA-Z0-9_]+$/.test(entry.version)
      || !hex(entry.checksumSha256, 64)) fail('INSTALL_LEDGER_INVALID')
  }
  if (new Set(value.migrationLedger.map(row => row.version)).size !== value.migrationLedger.length)
    fail('INSTALL_LEDGER_INVALID')
  return value
}

export async function verifyBundle(directory, expectedSha) {
  const root = await realpath(directory)
  const bytes = await readFile(path.join(root, 'manifest.json'))
  if (!hex(expectedSha, 64) || hash(bytes) !== expectedSha) fail('INSTALL_MANIFEST_DIGEST_MISMATCH')
  let manifest
  try { manifest = validateManifest(JSON.parse(bytes.toString('utf8'))) }
  catch (error) { if (error.message.startsWith('INSTALL_')) throw error; fail('INSTALL_MANIFEST_INVALID') }
  for (const entry of [...manifest.files, ...manifest.chunks, ...manifest.bootstrapChunks]) {
    const file = path.join(root, entry.path)
    const info = await lstat(file)
    if (!info.isFile() || info.isSymbolicLink() || await realpath(file) !== file
      || info.size !== entry.bytes || await fileHash(file) !== entry.sha256) fail('INSTALL_FILE_DIGEST_MISMATCH')
  }
  return manifest
}

// Program rollback is allowed only for an exact, checksummed ledger. A prefix,
// unknown migration or changed checksum is never interpreted as compatibility.
export function assertCompatibleLedger(actual, expected) {
  const normalize = rows => rows.map(row => ({ version: row.version, checksumSha256: row.checksumSha256 }))
    .sort((a, b) => a.version.localeCompare(b.version))
  if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(expected))) fail('INSTALL_INCOMPATIBLE_LEDGER_RESTORE_REQUIRED')
}
export function assertCompatibleProgram(previous, candidate) {
  if (previous.runtimeFingerprint !== candidate.runtimeFingerprint
    || ['postgres', 'redis', 'minio'].some(role => previous.images[role].id !== candidate.images[role].id))
    fail('INSTALL_INCOMPATIBLE_PROGRAM_RESTORE_REQUIRED')
}
