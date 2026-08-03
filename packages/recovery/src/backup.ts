import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { loadReleaseInfo } from '@workmesh/config'
import type { PoolClient } from 'pg'
import { canonicalJson, encryptFile, parse32ByteKey, sha256, verifyEncryptedPayload } from './crypto.js'
import { writeManifest } from './manifest.js'
import {
  assertMaintenanceWindow,
  createCustomDump,
  openRecoveryDatabase,
  postgresServerVersion,
  readDatabaseCounts,
  readSchemaLedger,
  verifyDatabaseSecrets,
} from './postgres.js'
import { exportBucket, s3Client, type RecoveryS3Config } from './s3.js'
import type { RecoveryManifestV1, RecoveryObjectVersion } from './types.js'

export type CreateRecoveryBundleInput = Readonly<{
  databaseUrl: string
  outputDirectory: string
  backupEncryptionKey: string
  masterKey: string
  buildSha: string
  s3: RecoveryS3Config
}>

const errorReport = (error: unknown): Readonly<{ code: string; message: string }> => {
  const message = error instanceof Error ? error.message : String(error)
  const code = /^[A-Z0-9_]+/.exec(message)?.[0] ?? 'RECOVERY_BACKUP_FAILED'
  return { code, message: message.slice(0, 4_000) }
}

const currentObject = (objects: readonly RecoveryObjectVersion[], key: string): RecoveryObjectVersion | undefined => (
  objects.find(object => object.sourceKey === key && object.isLatest)
)

const validateObjectReferences = async (
  client: PoolClient,
  objects: readonly RecoveryObjectVersion[],
): Promise<void> => {
  const artifacts = await client.query<{
    id: string
    storageKey: string
    checksum: string | null
    sizeBytes: string | null
    mimeType: string | null
  }>(`
    SELECT id,storage_key AS "storageKey",checksum,size_bytes::text AS "sizeBytes",mime_type AS "mimeType"
      FROM artifacts
     WHERE storage_key IS NOT NULL
     ORDER BY id
  `)
  for (const artifact of artifacts.rows) {
    const object = currentObject(objects, artifact.storageKey)
    if (!object) throw new Error(`RECOVERY_ARTIFACT_OBJECT_MISSING:${artifact.id}`)
    if (artifact.checksum && artifact.checksum !== `sha256:${object.payload.plaintextSha256}`) {
      throw new Error(`RECOVERY_ARTIFACT_CHECKSUM_MISMATCH:${artifact.id}`)
    }
    if (artifact.sizeBytes !== null && Number(artifact.sizeBytes) !== object.payload.plaintextBytes) {
      throw new Error(`RECOVERY_ARTIFACT_SIZE_MISMATCH:${artifact.id}`)
    }
    if (artifact.mimeType !== null && artifact.mimeType !== object.contentType) {
      throw new Error(`RECOVERY_ARTIFACT_MIME_MISMATCH:${artifact.id}`)
    }
  }

  const uploadIntents = await client.query<{ id: string; storageKey: string; expectedChecksum: string; sizeBytes: string }>(`
    SELECT id,storage_key AS "storageKey",expected_checksum AS "expectedChecksum",size_bytes::text AS "sizeBytes"
      FROM artifact_upload_intents
     WHERE status IN ('uploaded','verified')
     ORDER BY id
  `)
  for (const intent of uploadIntents.rows) {
    const object = currentObject(objects, intent.storageKey)
    if (!object) throw new Error(`RECOVERY_UPLOAD_OBJECT_MISSING:${intent.id}`)
    if (intent.expectedChecksum !== `sha256:${object.payload.plaintextSha256}`) {
      throw new Error(`RECOVERY_UPLOAD_CHECKSUM_MISMATCH:${intent.id}`)
    }
    if (Number(intent.sizeBytes) !== object.payload.plaintextBytes) {
      throw new Error(`RECOVERY_UPLOAD_SIZE_MISMATCH:${intent.id}`)
    }
  }

  const archives = await client.query<{ id: string; objectKey: string; objectVersionId: string }>(`
    SELECT id,object_key AS "objectKey",object_version_id AS "objectVersionId"
      FROM event_archive_segments
     WHERE object_version_id IS NOT NULL
     ORDER BY id
  `)
  for (const archive of archives.rows) {
    if (!objects.some(object => object.sourceKey === archive.objectKey && object.sourceVersionId === archive.objectVersionId)) {
      throw new Error(`RECOVERY_ARCHIVE_OBJECT_VERSION_MISSING:${archive.id}`)
    }
  }
}

export const createRecoveryBundle = async (input: CreateRecoveryBundleInput): Promise<Readonly<{
  manifest: RecoveryManifestV1
  manifestSha256: string
  outputDirectory: string
}>> => {
  const startedAt = new Date()
  const outputDirectory = resolve(input.outputDirectory)
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'workmesh-recovery-backup-'))
  let outputDirectoryCreated = false
  let database: Awaited<ReturnType<typeof openRecoveryDatabase>> | undefined
  let client: ReturnType<typeof s3Client> | undefined
  try {
    await mkdir(outputDirectory, { recursive: false, mode: 0o700 })
    outputDirectoryCreated = true
    const backupKey = parse32ByteKey(input.backupEncryptionKey, 'WORKMESH_BACKUP_ENCRYPTION_KEY')
    if (!/^[a-f0-9]{64}$/i.test(input.masterKey)) throw new Error('WORKMESH_MASTER_KEY_INVALID')
    const masterKey = parse32ByteKey(input.masterKey, 'WORKMESH_MASTER_KEY')
    if (!/^[a-f0-9]{40}$/.test(input.buildSha)) throw new Error('WORKMESH_BUILD_SHA_INVALID')
    database = await openRecoveryDatabase(input.databaseUrl)
    client = s3Client(input.s3.clientConfig)
    await assertMaintenanceWindow(database.client)
    // One advisory-lock-owning PoolClient is intentionally serialized. The pg
    // client does not permit overlapping queries on the same connection.
    const ledger = await readSchemaLedger(database.client)
    const counts = await readDatabaseCounts(database.client)
    const serverVersion = await postgresServerVersion(database.client)
    const secretVerification = await verifyDatabaseSecrets(database.client, input.masterKey, masterKey)
    const dumpPath = join(temporaryDirectory, 'database.dump')
    await createCustomDump(input.databaseUrl, dumpPath)
    const databasePayloadPath = 'database/database.dump.enc'
    const encryptedDump = await encryptFile(
      dumpPath,
      join(outputDirectory, databasePayloadPath),
      backupKey,
      randomBytes(12),
    )
    const bucket = await exportBucket(client, input.s3.bucket, outputDirectory, backupKey)
    await validateObjectReferences(database.client, bucket.objects)
    const release = loadReleaseInfo({ WORKMESH_BUILD_SHA: input.buildSha })
    const manifest: RecoveryManifestV1 = {
      format: 'workmesh-recovery-bundle',
      schemaVersion: 1,
      createdAt: startedAt.toISOString(),
      workmesh: {
        serverVersion: release.serverVersion,
        buildSha: release.buildSha,
        schemaBaseline: release.schemaBaseline,
      },
      source: {
        postgresServerVersion: serverVersion,
        bucket: input.s3.bucket,
        bucketVersioning: bucket.versioning,
        objectLockEnabled: bucket.objectLockEnabled,
        schemaLedger: ledger,
        databaseCounts: counts,
        objectVersionCount: bucket.objects.length,
        deleteMarkerCount: bucket.deleteMarkers.length,
      },
      encryption: {
        algorithm: 'aes-256-gcm',
        backupKeyFingerprintSha256: sha256(backupKey),
        masterKeyFingerprintSha256: sha256(masterKey),
        requiredKeyBytes: 32,
        webhookKeyVersions: secretVerification.webhookKeyVersions,
      },
      secretVerification: {
        providerRows: secretVerification.providerRows,
        webhookRows: secretVerification.webhookRows,
      },
      database: {
        kind: 'postgresql-custom-dump',
        payload: { ...encryptedDump, path: databasePayloadPath },
      },
      objects: bucket.objects,
      deleteMarkers: bucket.deleteMarkers,
    }
    for (const payload of [manifest.database.payload, ...manifest.objects.map(object => object.payload)]) {
      await verifyEncryptedPayload(outputDirectory, payload)
    }
    const manifestSha256 = await writeManifest(outputDirectory, manifest, backupKey)
    await writeFile(join(outputDirectory, 'backup-report.json'), canonicalJson({
      schemaVersion: 1,
      status: 'passed',
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      manifestSha256,
      outputDirectory: basename(outputDirectory),
      databaseCounts: counts,
      objectVersionCount: bucket.objects.length,
      deleteMarkerCount: bucket.deleteMarkers.length,
      providerSecretsVerified: secretVerification.providerRows,
      webhookSecretsVerified: secretVerification.webhookRows,
    }), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    return { manifest, manifestSha256, outputDirectory }
  } catch (error) {
    if (outputDirectoryCreated) {
      await writeFile(join(outputDirectory, 'failure.json'), canonicalJson({
        schemaVersion: 1,
        status: 'failed',
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
        error: errorReport(error),
      }), { encoding: 'utf8', flag: 'wx', mode: 0o600 }).catch(() => undefined)
    }
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

export const recoveryS3ConfigFromEnvironment = (env: NodeJS.ProcessEnv = process.env): RecoveryS3Config => {
  const bucket = env.S3_BUCKET
  const accessKeyId = env.S3_ACCESS_KEY_ID
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY
  if (!bucket || !accessKeyId || !secretAccessKey) throw new Error('RECOVERY_S3_CONFIGURATION_REQUIRED')
  return {
    bucket,
    clientConfig: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION ?? 'us-east-1',
      forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false',
      credentials: { accessKeyId, secretAccessKey },
    },
  }
}
