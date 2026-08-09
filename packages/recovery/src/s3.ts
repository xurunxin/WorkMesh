import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  GetObjectLegalHoldCommand,
  GetObjectLockConfigurationCommand,
  GetObjectRetentionCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { encryptReadable, readableFromSdkBody, sha256 } from './crypto.js'
import type {
  RecoveryDeleteMarker,
  RecoveryObjectVersion,
  RestoreObjectMapping,
} from './types.js'

export type RecoveryS3Config = Readonly<{
  bucket: string
  clientConfig: S3ClientConfig
}>

type ListedObject = Readonly<{
  key: string
  versionId: string | null
  isLatest: boolean
  lastModified: Date | undefined
  etag: string | undefined
  sourceListOrdinal: number
}>

const errorName = (error: unknown): string => error instanceof Error ? error.name : 'UnknownError'
const isMissingBucket = (error: unknown): boolean => ['NotFound', 'NoSuchBucket'].includes(errorName(error))

export const s3Client = (config: S3ClientConfig): S3Client => new S3Client(config)

const listVersions = async (
  client: S3Client,
  bucket: string,
): Promise<Readonly<{ objects: readonly ListedObject[]; deleteMarkers: readonly RecoveryDeleteMarker[] }>> => {
  const objects: ListedObject[] = []
  const deleteMarkers: RecoveryDeleteMarker[] = []
  let keyMarker: string | undefined
  let versionIdMarker: string | undefined
  let ordinal = 0
  do {
    const page = await client.send(new ListObjectVersionsCommand({
      Bucket: bucket,
      KeyMarker: keyMarker,
      VersionIdMarker: versionIdMarker,
    }))
    for (const version of page.Versions ?? []) {
      if (!version.Key) throw new Error('RECOVERY_OBJECT_KEY_MISSING')
      objects.push({
        key: version.Key,
        versionId: version.VersionId ?? null,
        isLatest: version.IsLatest ?? false,
        lastModified: version.LastModified,
        etag: version.ETag,
        sourceListOrdinal: ordinal++,
      })
    }
    for (const marker of page.DeleteMarkers ?? []) {
      if (!marker.Key || !marker.VersionId) throw new Error('RECOVERY_DELETE_MARKER_IDENTITY_MISSING')
      deleteMarkers.push({
        sourceKey: marker.Key,
        sourceVersionId: marker.VersionId,
        sourceListOrdinal: ordinal++,
        isLatest: marker.IsLatest ?? false,
        lastModified: marker.LastModified?.toISOString() ?? null,
      })
    }
    keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined
    versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined
    if (page.IsTruncated && !keyMarker) throw new Error('RECOVERY_OBJECT_LIST_CURSOR_MISSING')
  } while (keyMarker !== undefined)
  return { objects, deleteMarkers }
}

const objectLockEnabled = async (client: S3Client, bucket: string): Promise<boolean> => {
  try {
    const result = await client.send(new GetObjectLockConfigurationCommand({ Bucket: bucket }))
    return result.ObjectLockConfiguration?.ObjectLockEnabled === 'Enabled'
  } catch (error) {
    if (['ObjectLockConfigurationNotFoundError', 'NoSuchObjectLockConfiguration', 'NotFound'].includes(errorName(error))) {
      return false
    }
    throw error
  }
}

const missingObjectLockDetail = (error: unknown): boolean => [
  'NoSuchObjectLockConfiguration',
  'NoSuchRetention',
  'NoSuchLegalHold',
  'NotFound',
].includes(errorName(error))

export const inspectSourceBucket = async (
  client: S3Client,
  bucket: string,
): Promise<Readonly<{
  versioning: 'Enabled' | 'Suspended' | 'Disabled'
  objectLockEnabled: boolean
  objects: readonly ListedObject[]
  deleteMarkers: readonly RecoveryDeleteMarker[]
}>> => {
  await client.send(new HeadBucketCommand({ Bucket: bucket }))
  const [versioning, locked, listed] = await Promise.all([
    client.send(new GetBucketVersioningCommand({ Bucket: bucket })),
    objectLockEnabled(client, bucket),
    listVersions(client, bucket),
  ])
  return {
    versioning: versioning.Status ?? 'Disabled',
    objectLockEnabled: locked,
    ...listed,
  }
}

export const exportBucket = async (
  client: S3Client,
  bucket: string,
  bundleDirectory: string,
  backupKey: Buffer,
): Promise<Readonly<{
  versioning: 'Enabled' | 'Suspended' | 'Disabled'
  objectLockEnabled: boolean
  objects: readonly RecoveryObjectVersion[]
  deleteMarkers: readonly RecoveryDeleteMarker[]
}>> => {
  const inventory = await inspectSourceBucket(client, bucket)
  const exported: RecoveryObjectVersion[] = []
  for (const [index, object] of inventory.objects.entries()) {
    const identity = `${object.key}\u0000${object.versionId ?? 'null'}`
    const relativePath = `objects/${String(index + 1).padStart(8, '0')}-${sha256(identity).slice(0, 24)}.bin.enc`
    const response = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: object.key,
      VersionId: object.versionId ?? undefined,
    }))
    let retentionMode: 'GOVERNANCE' | 'COMPLIANCE' | null = null
    let retainUntil: string | null = null
    let legalHold: 'ON' | 'OFF' | null = null
    if (inventory.objectLockEnabled && object.versionId) {
      try {
        const retention = await client.send(new GetObjectRetentionCommand({ Bucket: bucket, Key: object.key, VersionId: object.versionId }))
        retentionMode = retention.Retention?.Mode ?? null
        retainUntil = retention.Retention?.RetainUntilDate?.toISOString() ?? null
      } catch (error) {
        if (!missingObjectLockDetail(error)) throw error
      }
      try {
        const hold = await client.send(new GetObjectLegalHoldCommand({ Bucket: bucket, Key: object.key, VersionId: object.versionId }))
        legalHold = hold.LegalHold?.Status ?? null
      } catch (error) {
        if (!missingObjectLockDetail(error)) throw error
      }
    }
    const encrypted = await encryptReadable(
      readableFromSdkBody(response.Body),
      join(bundleDirectory, relativePath),
      backupKey,
      randomBytes(12),
    )
    exported.push({
      kind: 'object',
      sourceKey: object.key,
      sourceVersionId: object.versionId,
      sourceListOrdinal: object.sourceListOrdinal,
      isLatest: object.isLatest,
      lastModified: object.lastModified?.toISOString() ?? null,
      etag: object.etag ?? null,
      contentType: response.ContentType ?? null,
      metadata: Object.freeze({ ...(response.Metadata ?? {}) }),
      retentionMode,
      retainUntil,
      legalHold,
      payload: { ...encrypted, path: relativePath },
    })
  }
  return { ...inventory, objects: exported }
}

export const ensureEmptyTargetBucket = async (
  client: S3Client,
  bucket: string,
  region: string,
  requireObjectLock: boolean,
  allowExistingVersions: boolean,
): Promise<void> => {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
  } catch (error) {
    if (!isMissingBucket(error)) throw error
    await client.send(new CreateBucketCommand({
      Bucket: bucket,
      ObjectLockEnabledForBucket: requireObjectLock || undefined,
      CreateBucketConfiguration: region === 'us-east-1' ? undefined : { LocationConstraint: region as never },
    }))
  }
  await client.send(new PutBucketVersioningCommand({
    Bucket: bucket,
    VersioningConfiguration: { Status: 'Enabled' },
  }))
  if (requireObjectLock && !(await objectLockEnabled(client, bucket))) {
    throw new Error('RECOVERY_TARGET_OBJECT_LOCK_REQUIRED')
  }
  if (!allowExistingVersions) {
    const existing = await listVersions(client, bucket)
    if (existing.objects.length > 0 || existing.deleteMarkers.length > 0) {
      throw new Error('RECOVERY_TARGET_BUCKET_NOT_EMPTY')
    }
  }
}

export const restoreObjectVersion = async (
  client: S3Client,
  bucket: string,
  object: RecoveryObjectVersion,
  plaintextPath: string,
): Promise<RestoreObjectMapping> => {
  const retainUntil = object.retainUntil ? new Date(object.retainUntil) : undefined
  const activeRetention = retainUntil && retainUntil > new Date() ? retainUntil : undefined
  const uploaded = await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: object.sourceKey,
    Body: createReadStream(plaintextPath),
    ContentType: object.contentType ?? undefined,
    Metadata: { ...object.metadata },
    ObjectLockMode: activeRetention ? object.retentionMode ?? undefined : undefined,
    ObjectLockRetainUntilDate: activeRetention,
    ObjectLockLegalHoldStatus: object.legalHold ?? undefined,
  }))
  await rm(plaintextPath, { force: true })
  if (!uploaded.VersionId) throw new Error('RECOVERY_TARGET_VERSION_ID_MISSING')
  return {
    sourceKey: object.sourceKey,
    sourceVersionId: object.sourceVersionId,
    targetVersionId: uploaded.VersionId,
  }
}

export const verifyRestoredObject = async (
  client: S3Client,
  bucket: string,
  object: RecoveryObjectVersion,
  mapping: RestoreObjectMapping,
): Promise<void> => {
  const head = await client.send(new HeadObjectCommand({
    Bucket: bucket,
    Key: object.sourceKey,
    VersionId: mapping.targetVersionId,
  }))
  if (head.ContentLength !== object.payload.plaintextBytes || (head.ContentType ?? null) !== object.contentType) {
    throw new Error(`RECOVERY_TARGET_OBJECT_METADATA_MISMATCH:${object.sourceKey}`)
  }
  const expectedMetadata = Object.fromEntries(
    Object.entries(object.metadata)
      .map(([key, value]): [string, string] => [key.toLowerCase(), value])
      .sort((left, right) => left[0].localeCompare(right[0])),
  )
  const actualMetadata = Object.fromEntries(
    Object.entries(head.Metadata ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  )
  if (JSON.stringify(actualMetadata) !== JSON.stringify(expectedMetadata)) {
    throw new Error(`RECOVERY_TARGET_OBJECT_USER_METADATA_MISMATCH:${object.sourceKey}`)
  }
  const body = await client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: object.sourceKey,
    VersionId: mapping.targetVersionId,
  }))
  const hash = createHash('sha256')
  for await (const chunk of body.Body as AsyncIterable<Uint8Array>) hash.update(Buffer.from(chunk))
  if (hash.digest('hex') !== object.payload.plaintextSha256) {
    throw new Error(`RECOVERY_TARGET_OBJECT_CHECKSUM_MISMATCH:${object.sourceKey}`)
  }
  const retainUntil = object.retainUntil ? new Date(object.retainUntil) : undefined
  if (retainUntil && retainUntil > new Date()) {
    const retention = await client.send(new GetObjectRetentionCommand({
      Bucket: bucket,
      Key: object.sourceKey,
      VersionId: mapping.targetVersionId,
    }))
    if (
      retention.Retention?.Mode !== object.retentionMode
      || retention.Retention.RetainUntilDate?.toISOString() !== retainUntil.toISOString()
    ) {
      throw new Error(`RECOVERY_TARGET_OBJECT_RETENTION_MISMATCH:${object.sourceKey}`)
    }
  }
  if (object.legalHold !== null) {
    const legalHold = await client.send(new GetObjectLegalHoldCommand({
      Bucket: bucket,
      Key: object.sourceKey,
      VersionId: mapping.targetVersionId,
    }))
    if (legalHold.LegalHold?.Status !== object.legalHold) {
      throw new Error(`RECOVERY_TARGET_OBJECT_LEGAL_HOLD_MISMATCH:${object.sourceKey}`)
    }
  }
}

export const applyLatestDeleteMarkers = async (
  client: S3Client,
  bucket: string,
  markers: readonly RecoveryDeleteMarker[],
): Promise<number> => {
  let applied = 0
  for (const marker of markers.filter(candidate => candidate.isLatest)) {
    const result = await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: marker.sourceKey }))
    if (!result.VersionId || !result.DeleteMarker) throw new Error('RECOVERY_TARGET_DELETE_MARKER_MISSING')
    applied += 1
  }
  return applied
}
