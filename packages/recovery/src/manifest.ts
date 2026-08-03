import { readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { canonicalJson, equalHex, hmacSha256, sha256 } from './crypto.js'
import type { RecoveryManifestV1 } from './types.js'

const sha256Pattern = /^[a-f0-9]{64}$/
const buildShaPattern = /^[a-f0-9]{40}$/

const safePayloadPath = (bundleDirectory: string, payloadPath: string): void => {
  if (!/^[A-Za-z0-9._/-]+$/.test(payloadPath)) throw new Error('RECOVERY_PAYLOAD_PATH_INVALID')
  const root = resolve(bundleDirectory)
  const target = resolve(bundleDirectory, payloadPath)
  const child = relative(root, target)
  if (!child || child.startsWith('..') || resolve(root, child) !== target) throw new Error('RECOVERY_PAYLOAD_PATH_INVALID')
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

const isNonNegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const isStringOrNull = (value: unknown): value is string | null => typeof value === 'string' || value === null
const isIsoDateOrNull = (value: unknown): value is string | null => value === null || (
  typeof value === 'string' && Number.isFinite(Date.parse(value))
)

const isBase64Bytes = (value: unknown, bytes: number): value is string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false
  const decoded = Buffer.from(value, 'base64')
  return decoded.length === bytes && decoded.toString('base64') === value
}

const validatePayload = (value: unknown, bundleDirectory: string): void => {
  if (
    !isRecord(value)
    || typeof value.path !== 'string'
    || typeof value.plaintextSha256 !== 'string'
    || !sha256Pattern.test(value.plaintextSha256)
    || typeof value.ciphertextSha256 !== 'string'
    || !sha256Pattern.test(value.ciphertextSha256)
    || !isNonNegativeInteger(value.plaintextBytes)
    || !isNonNegativeInteger(value.ciphertextBytes)
    || !isBase64Bytes(value.ivBase64, 12)
    || !isBase64Bytes(value.authTagBase64, 16)
  ) {
    throw new Error('RECOVERY_MANIFEST_INVALID')
  }
  safePayloadPath(bundleDirectory, value.path)
}

const validateLedger = (value: unknown): boolean => Array.isArray(value) && value.every(entry => (
  isRecord(entry)
  && typeof entry.version === 'string'
  && typeof entry.checksumSha256 === 'string'
  && sha256Pattern.test(entry.checksumSha256)
  && typeof entry.appliedAt === 'string'
  && Number.isFinite(Date.parse(entry.appliedAt))
  && typeof entry.executionMode === 'string'
))

const validateCounts = (value: unknown): boolean => Array.isArray(value) && value.every(entry => (
  isRecord(entry) && typeof entry.name === 'string' && isNonNegativeInteger(entry.count)
))

export const validateManifest = (value: unknown, bundleDirectory: string): RecoveryManifestV1 => {
  if (!isRecord(value) || value.format !== 'workmesh-recovery-bundle' || value.schemaVersion !== 1) {
    throw new Error('RECOVERY_MANIFEST_VERSION_UNSUPPORTED')
  }
  if (
    !isRecord(value.workmesh)
    || value.workmesh.serverVersion !== '1.0.0'
    || value.workmesh.schemaBaseline !== 1
  ) {
    throw new Error('RECOVERY_WORKMESH_VERSION_INCOMPATIBLE')
  }
  if (
    typeof value.createdAt !== 'string'
    || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.workmesh.buildSha !== 'string'
    || !buildShaPattern.test(value.workmesh.buildSha)
    || !isRecord(value.source)
    || typeof value.source.postgresServerVersion !== 'string'
    || typeof value.source.bucket !== 'string'
    || !['Enabled', 'Suspended', 'Disabled'].includes(String(value.source.bucketVersioning))
    || typeof value.source.objectLockEnabled !== 'boolean'
    || !validateLedger(value.source.schemaLedger)
    || !validateCounts(value.source.databaseCounts)
    || !isNonNegativeInteger(value.source.objectVersionCount)
    || !isNonNegativeInteger(value.source.deleteMarkerCount)
    || !isRecord(value.encryption)
    || value.encryption.algorithm !== 'aes-256-gcm'
    || typeof value.encryption.backupKeyFingerprintSha256 !== 'string'
    || !sha256Pattern.test(value.encryption.backupKeyFingerprintSha256)
    || typeof value.encryption.masterKeyFingerprintSha256 !== 'string'
    || !sha256Pattern.test(value.encryption.masterKeyFingerprintSha256)
    || value.encryption.requiredKeyBytes !== 32
    || !Array.isArray(value.encryption.webhookKeyVersions)
    || !value.encryption.webhookKeyVersions.every(item => typeof item === 'string')
    || !isRecord(value.secretVerification)
    || !isNonNegativeInteger(value.secretVerification.providerRows)
    || !isNonNegativeInteger(value.secretVerification.webhookRows)
    || !isRecord(value.database)
    || value.database.kind !== 'postgresql-custom-dump'
    || !Array.isArray(value.objects)
    || !Array.isArray(value.deleteMarkers)
    || value.source.objectVersionCount !== value.objects.length
    || value.source.deleteMarkerCount !== value.deleteMarkers.length
  ) {
    throw new Error('RECOVERY_MANIFEST_INVALID')
  }
  validatePayload(value.database.payload, bundleDirectory)
  for (const object of value.objects) {
    if (
      !isRecord(object)
      || object.kind !== 'object'
      || typeof object.sourceKey !== 'string'
      || !isStringOrNull(object.sourceVersionId)
      || !isNonNegativeInteger(object.sourceListOrdinal)
      || typeof object.isLatest !== 'boolean'
      || !isIsoDateOrNull(object.lastModified)
      || !isStringOrNull(object.etag)
      || !isStringOrNull(object.contentType)
      || !isRecord(object.metadata)
      || !Object.values(object.metadata).every(item => typeof item === 'string')
      || ![null, 'GOVERNANCE', 'COMPLIANCE'].includes(object.retentionMode as null | string)
      || !isIsoDateOrNull(object.retainUntil)
      || ![null, 'ON', 'OFF'].includes(object.legalHold as null | string)
    ) {
      throw new Error('RECOVERY_MANIFEST_INVALID')
    }
    validatePayload(object.payload, bundleDirectory)
  }
  for (const marker of value.deleteMarkers) {
    if (
      !isRecord(marker)
      || typeof marker.sourceKey !== 'string'
      || typeof marker.sourceVersionId !== 'string'
      || !isNonNegativeInteger(marker.sourceListOrdinal)
      || typeof marker.isLatest !== 'boolean'
      || !isIsoDateOrNull(marker.lastModified)
    ) {
      throw new Error('RECOVERY_MANIFEST_INVALID')
    }
  }
  return value as RecoveryManifestV1
}

export const writeManifest = async (
  bundleDirectory: string,
  manifest: RecoveryManifestV1,
  backupKey: Buffer,
): Promise<string> => {
  const body = canonicalJson(manifest)
  const digest = sha256(body)
  await writeFile(join(bundleDirectory, 'manifest.json'), body, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  await writeFile(join(bundleDirectory, 'manifest.sha256'), `${digest}  manifest.json\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  await writeFile(join(bundleDirectory, 'manifest.hmac-sha256'), `${hmacSha256(backupKey, body)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  return digest
}

export const readVerifiedManifest = async (
  bundleDirectory: string,
  backupKey: Buffer,
): Promise<Readonly<{ manifest: RecoveryManifestV1; manifestSha256: string }>> => {
  const [body, digestFile, hmacFile] = await Promise.all([
    readFile(join(bundleDirectory, 'manifest.json'), 'utf8'),
    readFile(join(bundleDirectory, 'manifest.sha256'), 'utf8'),
    readFile(join(bundleDirectory, 'manifest.hmac-sha256'), 'utf8'),
  ])
  const digest = sha256(body)
  const expectedDigest = digestFile.trim().split(/\s+/)[0] ?? ''
  if (!equalHex(digest, expectedDigest)) throw new Error('RECOVERY_MANIFEST_CHECKSUM_MISMATCH')
  if (!equalHex(hmacSha256(backupKey, body), hmacFile.trim())) throw new Error('RECOVERY_MANIFEST_AUTHENTICATION_FAILED')
  return { manifest: validateManifest(JSON.parse(body) as unknown, bundleDirectory), manifestSha256: digest }
}
