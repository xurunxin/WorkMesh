import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { PoolClient } from 'pg'
import {
  canonicalJson,
  decryptPayloadToFile,
  equalHex,
  hmacSha256,
  parse32ByteKey,
  sha256,
  verifyEncryptedPayload,
} from './crypto.js'
import { readVerifiedManifest } from './manifest.js'
import {
  assertEmptyTargetDatabase,
  openRecoveryDatabase,
  readDatabaseCounts,
  readSchemaLedger,
  remapArchiveVersions,
  restoreCustomDump,
  targetFingerprint,
  verifyDatabaseSecrets,
} from './postgres.js'
import {
  applyLatestDeleteMarkers,
  ensureEmptyTargetBucket,
  inspectSourceBucket,
  restoreObjectVersion,
  s3Client,
  verifyRestoredObject,
  type RecoveryS3Config,
} from './s3.js'
import type {
  RecoveryCount,
  RecoveryManifestV1,
  RecoveryObjectVersion,
  RecoveryReportV1,
  RestoreJournalV1,
  RestoreObjectMapping,
} from './types.js'

export type RestoreRecoveryBundleInput = Readonly<{
  bundleDirectory: string
  targetDatabaseUrl: string
  targetS3: RecoveryS3Config
  backupEncryptionKey: string
  masterKey: string
  failureInjector?: (
    phase: 'after_object_upload' | 'after_object' | 'after_delete_marker' | 'before_database' | 'after_database',
    context: Readonly<{ restoredObjects: number }>,
  ) => Promise<void>
}>

const sameCounts = (left: readonly RecoveryCount[], right: readonly RecoveryCount[]): boolean => (
  left.length === right.length && left.every((entry, index) => (
    entry.name === right[index]?.name && entry.count === right[index]?.count
  ))
)

const sameLedger = (
  left: RecoveryManifestV1['source']['schemaLedger'],
  right: RecoveryManifestV1['source']['schemaLedger'],
): boolean => left.length === right.length && left.every((entry, index) => {
  const candidate = right[index]
  return candidate !== undefined
    && entry.version === candidate.version
    && entry.checksumSha256 === candidate.checksumSha256
    && entry.executionMode === candidate.executionMode
})

const errorReport = (error: unknown): Readonly<{ code: string; message: string }> => {
  const message = error instanceof Error ? error.message : String(error)
  return { code: /^[A-Z0-9_]+/.exec(message)?.[0] ?? 'RECOVERY_RESTORE_FAILED', message: message.slice(0, 4_000) }
}

const writeFailureReport = async (
  bundleDirectory: string,
  startedAt: Date,
  error: unknown,
  context: Readonly<{ manifestSha256?: string; sourceBuildSha?: string; targetId?: string }> = {},
): Promise<void> => {
  const report: RecoveryReportV1 = {
    schemaVersion: 1,
    status: 'failed',
    startedAt: startedAt.toISOString(),
    endedAt: new Date().toISOString(),
    manifestSha256: context.manifestSha256,
    sourceBuildSha: context.sourceBuildSha,
    error: errorReport(error),
  }
  const target = context.targetId ? context.targetId.slice(0, 16) : 'preflight'
  const failedReportPath = join(bundleDirectory, `recovery-report-${target}-failed-${Date.now()}.json`)
  await writeFile(failedReportPath, canonicalJson(report), { encoding: 'utf8', flag: 'wx', mode: 0o600 }).catch(() => undefined)
}

const writeJournal = async (
  path: string,
  hmacPath: string,
  journal: RestoreJournalV1,
  backupKey: Buffer,
): Promise<void> => {
  const body = canonicalJson(journal)
  const temporary = `${path}.tmp`
  const temporaryHmac = `${hmacPath}.tmp`
  await writeFile(temporary, body, { encoding: 'utf8', mode: 0o600 })
  await writeFile(temporaryHmac, `${hmacSha256(backupKey, body)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, path)
  await rename(temporaryHmac, hmacPath)
}

const readJournal = async (
  path: string,
  hmacPath: string,
  backupKey: Buffer,
): Promise<RestoreJournalV1 | undefined> => {
  try {
    const [body, signature] = await Promise.all([readFile(path, 'utf8'), readFile(hmacPath, 'utf8')])
    if (!equalHex(hmacSha256(backupKey, body), signature.trim())) throw new Error('RECOVERY_RESTORE_JOURNAL_AUTHENTICATION_FAILED')
    const value = JSON.parse(body) as RestoreJournalV1
    if (value.schemaVersion !== 1 || !Array.isArray(value.mappings) || !Array.isArray(value.deleteMarkerKeys)) {
      throw new Error('RECOVERY_RESTORE_JOURNAL_INVALID')
    }
    return value
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

const objectSort = (left: RecoveryObjectVersion, right: RecoveryObjectVersion): number => {
  const key = left.sourceKey.localeCompare(right.sourceKey)
  if (key !== 0) return key
  const time = (left.lastModified ?? '').localeCompare(right.lastModified ?? '')
  if (time !== 0) return time
  return right.sourceListOrdinal - left.sourceListOrdinal
}

const mappingFor = (
  mappings: readonly RestoreObjectMapping[],
  object: RecoveryObjectVersion,
): RestoreObjectMapping | undefined => mappings.find(mapping => (
  mapping.sourceKey === object.sourceKey && mapping.sourceVersionId === object.sourceVersionId
))

const reconcileJournalBucket = async (
  client: ReturnType<typeof s3Client>,
  bucket: string,
  journal: RestoreJournalV1,
  manifest: RecoveryManifestV1,
): Promise<RestoreJournalV1> => {
  const inventory = await inspectSourceBucket(client, bucket)
  const mappedVersions = new Set(journal.mappings.map(mapping => mapping.targetVersionId))
  if (journal.mappings.some(mapping => !inventory.objects.some(object => object.versionId === mapping.targetVersionId))) {
    throw new Error('RECOVERY_TARGET_BUCKET_JOURNAL_MISMATCH')
  }
  const unmatched = inventory.objects.filter(object => object.versionId === null || !mappedVersions.has(object.versionId))
  if (unmatched.length > 1) throw new Error('RECOVERY_TARGET_BUCKET_JOURNAL_MISMATCH')
  let mappings = journal.mappings
  const orphan = unmatched[0]
  if (orphan) {
    const next = [...manifest.objects].sort(objectSort).find(object => !mappingFor(mappings, object))
    if (!next || orphan.versionId === null || orphan.key !== next.sourceKey) {
      throw new Error('RECOVERY_TARGET_BUCKET_JOURNAL_MISMATCH')
    }
    const recovered: RestoreObjectMapping = {
      sourceKey: next.sourceKey,
      sourceVersionId: next.sourceVersionId,
      targetVersionId: orphan.versionId,
    }
    await verifyRestoredObject(client, bucket, next, recovered)
    mappings = [...mappings, recovered]
  }

  const allowedLatestMarkers = new Set(manifest.deleteMarkers.filter(marker => marker.isLatest).map(marker => marker.sourceKey))
  const actualLatestMarkers = inventory.deleteMarkers.filter(marker => marker.isLatest)
  if (actualLatestMarkers.some(marker => !allowedLatestMarkers.has(marker.sourceKey))) {
    throw new Error('RECOVERY_TARGET_BUCKET_JOURNAL_MISMATCH')
  }
  const deleteMarkerKeys = [...new Set(actualLatestMarkers.map(marker => marker.sourceKey))].sort()
  if (journal.deleteMarkerKeys.some(key => !deleteMarkerKeys.includes(key))) {
    throw new Error('RECOVERY_TARGET_BUCKET_JOURNAL_MISMATCH')
  }
  return { ...journal, mappings, deleteMarkerKeys }
}

const databaseMatchesManifest = async (
  client: PoolClient,
  manifest: RecoveryManifestV1,
): Promise<boolean> => {
  try {
    const counts = await readDatabaseCounts(client)
    const ledger = await readSchemaLedger(client)
    return sameCounts(counts, manifest.source.databaseCounts) && sameLedger(ledger, manifest.source.schemaLedger)
  } catch {
    return false
  }
}

const verifyDatabaseObjectReferences = async (
  client: PoolClient,
  manifest: RecoveryManifestV1,
  mappings: readonly RestoreObjectMapping[],
): Promise<Readonly<{ artifactObjects: number; archiveObjects: number }>> => {
  const artifacts = await client.query<{ id: string; storageKey: string; checksum: string | null }>(`
    SELECT id,storage_key AS "storageKey",checksum FROM artifacts WHERE storage_key IS NOT NULL ORDER BY id
  `)
  for (const artifact of artifacts.rows) {
    const source = manifest.objects.find(object => object.sourceKey === artifact.storageKey && object.isLatest)
    if (!source || !mappingFor(mappings, source)) throw new Error(`RECOVERY_RESTORED_ARTIFACT_MISSING:${artifact.id}`)
    if (artifact.checksum && artifact.checksum !== `sha256:${source.payload.plaintextSha256}`) {
      throw new Error(`RECOVERY_RESTORED_ARTIFACT_CHECKSUM_MISMATCH:${artifact.id}`)
    }
  }
  const archives = await client.query<{ id: string; objectKey: string; objectVersionId: string }>(`
    SELECT id,object_key AS "objectKey",object_version_id AS "objectVersionId"
      FROM event_archive_segments WHERE object_version_id IS NOT NULL ORDER BY id
  `)
  for (const archive of archives.rows) {
    if (!mappings.some(mapping => mapping.sourceKey === archive.objectKey && mapping.targetVersionId === archive.objectVersionId)) {
      throw new Error(`RECOVERY_RESTORED_ARCHIVE_MISSING:${archive.id}`)
    }
  }
  return { artifactObjects: artifacts.rowCount ?? 0, archiveObjects: archives.rowCount ?? 0 }
}

export const restoreRecoveryBundle = async (input: RestoreRecoveryBundleInput): Promise<RecoveryReportV1> => {
  const startedAt = new Date()
  const bundleDirectory = resolve(input.bundleDirectory)
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'workmesh-recovery-restore-'))
  let backupKey: Buffer
  let masterKey: Buffer
  let manifest: RecoveryManifestV1
  let manifestSha256: string
  try {
    backupKey = parse32ByteKey(input.backupEncryptionKey, 'WORKMESH_BACKUP_ENCRYPTION_KEY')
    if (!/^[a-f0-9]{64}$/i.test(input.masterKey)) throw new Error('WORKMESH_MASTER_KEY_INVALID')
    masterKey = parse32ByteKey(input.masterKey, 'WORKMESH_MASTER_KEY')
    const verified = await readVerifiedManifest(bundleDirectory, backupKey)
    manifest = verified.manifest
    manifestSha256 = verified.manifestSha256
    if (sha256(backupKey) !== manifest.encryption.backupKeyFingerprintSha256) {
      throw new Error('RECOVERY_BACKUP_ENCRYPTION_KEY_MISMATCH')
    }
    if (sha256(masterKey) !== manifest.encryption.masterKeyFingerprintSha256) {
      throw new Error('RECOVERY_MASTER_KEY_MISMATCH')
    }
    // Authenticate the manifest and validate every encrypted payload before the
    // restore is allowed to create a bucket, upload an object, or load the dump.
    // This also makes a completed restore replay detect a damaged bundle instead
    // of silently trusting its journal.
    for (const payload of [manifest.database.payload, ...manifest.objects.map(object => object.payload)]) {
      await verifyEncryptedPayload(bundleDirectory, payload)
    }
  } catch (error) {
    await writeFailureReport(bundleDirectory, startedAt, error)
    await rm(temporaryDirectory, { recursive: true, force: true })
    throw error
  }
  const endpoint = String(input.targetS3.clientConfig.endpoint ?? '')
  const targetId = targetFingerprint(input.targetDatabaseUrl, `${endpoint}|${input.targetS3.bucket}`)
  const journalPath = join(bundleDirectory, `restore-journal-${targetId.slice(0, 16)}.json`)
  const journalHmacPath = `${journalPath}.hmac-sha256`
  const reportPath = join(bundleDirectory, `recovery-report-${targetId.slice(0, 16)}.json`)
  let database: Awaited<ReturnType<typeof openRecoveryDatabase>> | undefined
  let client: ReturnType<typeof s3Client> | undefined
  try {
    const existingJournal = await readJournal(journalPath, journalHmacPath, backupKey)
    let journal = existingJournal ?? {
      schemaVersion: 1,
      manifestSha256,
      targetFingerprintSha256: targetId,
      mappings: [],
      deleteMarkerKeys: [],
      databaseRestored: false,
    } satisfies RestoreJournalV1
    if (journal.manifestSha256 !== manifestSha256 || journal.targetFingerprintSha256 !== targetId) {
      throw new Error('RECOVERY_RESTORE_JOURNAL_TARGET_MISMATCH')
    }
    database = await openRecoveryDatabase(input.targetDatabaseUrl)
    client = s3Client(input.targetS3.clientConfig)
    const targetHasDatabase = await databaseMatchesManifest(database.client, manifest)
    if (!journal.databaseRestored && targetHasDatabase) {
      if (!existingJournal) throw new Error('RECOVERY_TARGET_DATABASE_NOT_EMPTY')
      journal = { ...journal, databaseRestored: true }
      await writeJournal(journalPath, journalHmacPath, journal, backupKey)
    } else if (!journal.databaseRestored) {
      await assertEmptyTargetDatabase(database.client)
    } else if (!targetHasDatabase) {
      throw new Error('RECOVERY_TARGET_DATABASE_JOURNAL_MISMATCH')
    }

    const targetRegion = input.targetS3.clientConfig.region
    if (typeof targetRegion !== 'string') throw new Error('RECOVERY_TARGET_S3_REGION_INVALID')
    await ensureEmptyTargetBucket(
      client,
      input.targetS3.bucket,
      targetRegion,
      manifest.source.objectLockEnabled,
      existingJournal !== undefined,
    )
    if (existingJournal) {
      const reconciled = await reconcileJournalBucket(client, input.targetS3.bucket, journal, manifest)
      if (
        reconciled.mappings.length !== journal.mappings.length
        || reconciled.deleteMarkerKeys.length !== journal.deleteMarkerKeys.length
      ) {
        journal = reconciled
        await writeJournal(journalPath, journalHmacPath, journal, backupKey)
      }
    }
    if (!existingJournal) await writeJournal(journalPath, journalHmacPath, journal, backupKey)

    for (const object of [...manifest.objects].sort(objectSort)) {
      const existing = mappingFor(journal.mappings, object)
      if (existing) {
        await verifyRestoredObject(client, input.targetS3.bucket, object, existing)
        continue
      }
      const plaintextPath = join(temporaryDirectory, `${sha256(`${object.sourceKey}\u0000${object.sourceVersionId ?? 'null'}`)}.bin`)
      await decryptPayloadToFile(bundleDirectory, object.payload, plaintextPath, backupKey)
      const mapping = await restoreObjectVersion(client, input.targetS3.bucket, object, plaintextPath)
      await verifyRestoredObject(client, input.targetS3.bucket, object, mapping)
      await input.failureInjector?.('after_object_upload', { restoredObjects: journal.mappings.length })
      journal = { ...journal, mappings: [...journal.mappings, mapping] }
      await writeJournal(journalPath, journalHmacPath, journal, backupKey)
      await input.failureInjector?.('after_object', { restoredObjects: journal.mappings.length })
    }

    const latestDeleteKeys = manifest.deleteMarkers.filter(marker => marker.isLatest).map(marker => marker.sourceKey).sort()
    for (const key of latestDeleteKeys) {
      if (journal.deleteMarkerKeys.includes(key)) continue
      const applied = await applyLatestDeleteMarkers(
        client,
        input.targetS3.bucket,
        manifest.deleteMarkers.filter(marker => marker.isLatest && marker.sourceKey === key),
      )
      if (applied !== 1) throw new Error('RECOVERY_TARGET_DELETE_MARKER_COUNT_MISMATCH')
      await input.failureInjector?.('after_delete_marker', { restoredObjects: journal.mappings.length })
      journal = { ...journal, deleteMarkerKeys: [...journal.deleteMarkerKeys, key].sort() }
      await writeJournal(journalPath, journalHmacPath, journal, backupKey)
    }

    if (!journal.databaseRestored) {
      await input.failureInjector?.('before_database', { restoredObjects: journal.mappings.length })
      const dumpPath = join(temporaryDirectory, 'database.dump')
      await decryptPayloadToFile(bundleDirectory, manifest.database.payload, dumpPath, backupKey)
      await restoreCustomDump(input.targetDatabaseUrl, dumpPath)
      journal = { ...journal, databaseRestored: true }
      await writeJournal(journalPath, journalHmacPath, journal, backupKey)
      await input.failureInjector?.('after_database', { restoredObjects: journal.mappings.length })
    }

    await remapArchiveVersions(database.client, journal.mappings)
    const counts = await readDatabaseCounts(database.client)
    const ledger = await readSchemaLedger(database.client)
    const secrets = await verifyDatabaseSecrets(database.client, input.masterKey, masterKey)
    const references = await verifyDatabaseObjectReferences(database.client, manifest, journal.mappings)
    if (!sameCounts(counts, manifest.source.databaseCounts)) throw new Error('RECOVERY_DATABASE_COUNT_MISMATCH')
    if (!sameLedger(ledger, manifest.source.schemaLedger)) throw new Error('RECOVERY_SCHEMA_LEDGER_MISMATCH')
    if (secrets.providerRows !== manifest.secretVerification.providerRows) throw new Error('RECOVERY_PROVIDER_SECRET_COUNT_MISMATCH')
    if (secrets.webhookRows !== manifest.secretVerification.webhookRows) throw new Error('RECOVERY_WEBHOOK_SECRET_COUNT_MISMATCH')
    const report: RecoveryReportV1 = {
      schemaVersion: 1,
      status: 'passed',
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      manifestSha256,
      sourceBuildSha: manifest.workmesh.buildSha,
      targetDatabaseCounts: counts,
      restoredObjectVersions: journal.mappings.length,
      restoredDeleteMarkers: journal.deleteMarkerKeys.length,
      artifactObjectsVerified: references.artifactObjects,
      archiveObjectsVerified: references.archiveObjects,
      providerSecretsVerified: secrets.providerRows,
      webhookSecretsVerified: secrets.webhookRows,
    }
    await writeFile(reportPath, canonicalJson(report), { encoding: 'utf8', mode: 0o600 })
    return report
  } catch (error) {
    await writeFailureReport(bundleDirectory, startedAt, error, {
      manifestSha256,
      sourceBuildSha: manifest.workmesh.buildSha,
      targetId,
    })
    throw error
  } finally {
    try {
      client?.destroy()
      if (database) await database.release()
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  }
}

export const targetRecoveryS3ConfigFromEnvironment = (env: NodeJS.ProcessEnv = process.env): RecoveryS3Config => {
  const bucket = env.RECOVERY_TARGET_S3_BUCKET
  const accessKeyId = env.RECOVERY_TARGET_S3_ACCESS_KEY_ID
  const secretAccessKey = env.RECOVERY_TARGET_S3_SECRET_ACCESS_KEY
  if (!bucket || !accessKeyId || !secretAccessKey) throw new Error('RECOVERY_TARGET_S3_CONFIGURATION_REQUIRED')
  return {
    bucket,
    clientConfig: {
      endpoint: env.RECOVERY_TARGET_S3_ENDPOINT,
      region: env.RECOVERY_TARGET_S3_REGION ?? 'us-east-1',
      forcePathStyle: env.RECOVERY_TARGET_S3_FORCE_PATH_STYLE !== 'false',
      credentials: { accessKeyId, secretAccessKey },
    },
  }
}
