import {
  CreateBucketCommand,
  DeleteObjectCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createDb, applyMigrations, installWorkspace, tokenHash } from '@workmesh/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRecoveryBundle } from '../src/backup.js'
import { restoreRecoveryBundle } from '../src/restore.js'

const enabled = process.env.RUN_RECOVERY_INTEGRATION === '1'
const sourceDatabaseUrl = process.env.RECOVERY_SOURCE_DATABASE_URL
const targetDatabaseUrl = process.env.RECOVERY_TARGET_DATABASE_URL
const endpoint = process.env.RECOVERY_TEST_S3_ENDPOINT
const accessKeyId = process.env.RECOVERY_TEST_S3_ACCESS_KEY_ID
const secretAccessKey = process.env.RECOVERY_TEST_S3_SECRET_ACCESS_KEY
const toolContainer = process.env.WORKMESH_POSTGRES_TOOL_CONTAINER

if (enabled && (!sourceDatabaseUrl || !targetDatabaseUrl || !endpoint || !accessKeyId || !secretAccessKey || !toolContainer)) {
  throw new Error('Recovery integration requires source/target test databases, S3 settings, and a PostgreSQL tool container')
}
for (const databaseUrl of [sourceDatabaseUrl, targetDatabaseUrl]) {
  if (enabled && databaseUrl && !/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) {
    throw new Error('Recovery integration databases must include test in their names')
  }
}

const suite = enabled ? describe : describe.skip
const suffix = process.env.RECOVERY_TEST_SUFFIX ?? randomUUID().replaceAll('-', '')
const sourceBucket = process.env.RECOVERY_SOURCE_S3_BUCKET ?? `recovery-source-${suffix}`
const targetBucket = process.env.RECOVERY_TARGET_S3_BUCKET ?? `recovery-target-${suffix}`
const masterKey = '0123456789abcdef'.repeat(4)
const backupKey = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1)).toString('base64url')
const buildSha = 'b'.repeat(40)
const recoveryAgentToken = 'workmesh-recovery-agent-session-token'
const credentials = { accessKeyId: accessKeyId ?? 'disabled', secretAccessKey: secretAccessKey ?? 'disabled' }
const clientConfig = { endpoint, region: 'us-east-1', forcePathStyle: true, credentials }
const s3 = new S3Client(clientConfig)
let bundleDirectory = ''

const resetDatabase = async (databaseUrl: string, migrate: boolean): Promise<void> => {
  const db = createDb(databaseUrl)
  try {
    await db.query('DROP SCHEMA public CASCADE')
    await db.query('CREATE SCHEMA public')
    if (migrate) await applyMigrations(db)
  } finally {
    await db.end()
  }
}

const sha = (body: Buffer): string => `sha256:${createHash('sha256').update(body).digest('hex')}`

const encryptedWebhook = (secret: string): Readonly<{ ciphertext: Buffer; iv: Buffer; authTag: Buffer }> => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(masterKey, 'hex'), iv)
  return {
    ciphertext: Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]),
    iv,
    authTag: cipher.getAuthTag(),
  }
}

const seedSource = async (): Promise<Readonly<{ artifactVersionId: string; archiveVersionId: string }>> => {
  const db = createDb(sourceDatabaseUrl!)
  try {
    const installation = await installWorkspace(db, {
      workspaceName: 'Recovery integration',
      workspaceSlug: `recovery-${suffix}`,
      adminName: 'Recovery Admin',
      email: `recovery-${suffix}@example.test`,
      password: 'Recovery-test-password-2026!',
    })
    const agentActor = (await db.query<{ id: string }>(
      "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Recovery Agent') RETURNING id",
      [installation.workspaceId],
    )).rows[0]!.id
    const capabilities = ['work:read', 'work:write']
    const agent = (await db.query<{ id: string }>(
      "INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,requested_capabilities,approved_capabilities) VALUES($1,$2,'recovery-agent','Recovery Agent',$3,$3) RETURNING id",
      [installation.workspaceId, agentActor, capabilities],
    )).rows[0]!.id
    await db.query(
      'INSERT INTO agent_team_access(workspace_id,agent_id,team_id,approved_capabilities,granted_by_actor_id) VALUES($1,$2,$3,$4,$5)',
      [installation.workspaceId, agent, installation.teamId, capabilities, installation.actorId],
    )
    const installationToken = (await db.query<{ id: string }>(
      'INSERT INTO agent_installation_tokens(agent_id,token_hash,created_by_actor_id) VALUES($1,$2,$3) RETURNING id',
      [agent, tokenHash('workmesh-recovery-installation-token'), installation.actorId],
    )).rows[0]!.id
    const status = (await db.query<{ id: string }>('SELECT id FROM workflow_states WHERE team_id=$1 ORDER BY position LIMIT 1', [installation.teamId])).rows[0]!.id
    const workItem = (await db.query<{ id: string }>(`
      INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id)
      VALUES($1,$2,1,'Recovery fixture',$3,$4) RETURNING id
    `, [installation.workspaceId, installation.teamId, status, installation.actorId])).rows[0]!.id
    const delegation = (await db.query<{ id: string }>(`
      INSERT INTO delegations(
        workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,
        role,scope_type,scope_id,permissions_snapshot,capability_scope
      ) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6,$7,$8) RETURNING id
    `, [
      installation.workspaceId,
      installation.teamId,
      agent,
      agentActor,
      installation.actorId,
      workItem,
      capabilities,
      { workspaceId: installation.workspaceId, teamIds: [installation.teamId], projectIds: [], workItemIds: [workItem], repositoryIds: [], capabilities },
    ])).rows[0]!.id
    const session = (await db.query<{ id: string }>(`
      INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id
    `, [installation.workspaceId, installation.teamId, agent, agentActor, delegation, workItem])).rows[0]!.id
    await db.query(`
      INSERT INTO agent_session_tokens(
        session_id,agent_id,installation_token_id,token_hash,exchange_nonce_hash,expires_at,exchanged_at,issued_by_actor_id
      ) VALUES($1,$2,$3,$4,$5,now()+interval '24 hours',now(),$6)
    `, [session, agent, installationToken, tokenHash(recoveryAgentToken), tokenHash(`recovery-exchange-${suffix}`), installation.actorId])

    const artifactBody = Buffer.from('WorkMesh recovery artifact fixture')
    const artifactKey = `artifacts/${suffix}/report.txt`
    const artifactUpload = await s3.send(new PutObjectCommand({
      Bucket: sourceBucket,
      Key: artifactKey,
      Body: artifactBody,
      ContentType: 'text/plain',
      Metadata: { workmeshchecksum: sha(artifactBody) },
    }))
    if (!artifactUpload.VersionId) throw new Error('SOURCE_ARTIFACT_VERSION_MISSING')
    await db.query(`
      INSERT INTO artifacts(
        workspace_id,session_id,work_item_id,producer_actor_id,type,title,storage_key,mime_type,
        size_bytes,checksum,source_tool,metadata
      ) VALUES($1,$2,$3,$4,'file','Recovery report',$5,'text/plain',$6,$7,'recovery-integration','{}')
    `, [installation.workspaceId, session, workItem, agentActor, artifactKey, artifactBody.length, sha(artifactBody)])

    const archiveBody = Buffer.from('compressed archive fixture bytes')
    const archiveKey = `retention/events/${suffix}.ndjson.gz`
    const retainUntil = new Date(Date.now() + 367 * 86_400_000)
    const archiveUpload = await s3.send(new PutObjectCommand({
      Bucket: sourceBucket,
      Key: archiveKey,
      Body: archiveBody,
      ContentType: 'application/gzip',
      Metadata: { workmeshchecksum: sha(archiveBody) },
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: retainUntil,
    }))
    if (!archiveUpload.VersionId) throw new Error('SOURCE_ARCHIVE_VERSION_MISSING')
    const fixedCutoffAt = new Date(Date.now() - 100 * 86_400_000)
    await db.query(`
      INSERT INTO event_archive_segments(
        workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,object_key,object_version_id,
        object_size_bytes,object_sha256,snapshot_digest,metadata,state,retain_until,uploaded_at,
        verified_at,membership_state
      ) VALUES($1,1,1,$2,1,$3,$4,$5,$6,$7,$8,'verified',$9,now(),now(),'exact')
    `, [
      installation.workspaceId,
      fixedCutoffAt,
      archiveKey,
      archiveUpload.VersionId,
      archiveBody.length,
      sha(archiveBody),
      sha(Buffer.from('snapshot')),
      { fixedCutoffAt: fixedCutoffAt.toISOString() },
      retainUntil,
    ])

    const serviceActor = (await db.query<{ id: string }>(
      "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'service','Recovery Provider') RETURNING id",
      [installation.workspaceId],
    )).rows[0]!.id
    await db.query(`
      INSERT INTO provider_connections(
        workspace_id,provider,external_account_id,display_name,installation_id,service_actor_id,
        webhook_secret_ciphertext,credentials_ciphertext
      ) VALUES($1,'github','recovery-provider','Recovery Provider','42',$2,
        pgp_sym_encrypt('provider-webhook-secret',$3),pgp_sym_encrypt('{"privateKey":"fixture"}',$3))
    `, [installation.workspaceId, serviceActor, masterKey])
    const endpointId = (await db.query<{ id: string }>(
      'INSERT INTO agent_webhook_endpoints(agent_id,url) VALUES($1,$2) RETURNING id',
      [agent, 'https://agent.example.test/webhook'],
    )).rows[0]!.id
    const encrypted = encryptedWebhook('agent-webhook-secret')
    await db.query(`
      INSERT INTO agent_webhook_secrets(endpoint_id,version,secret_ciphertext,iv,auth_tag,key_version,status,created_by_actor_id)
      VALUES($1,1,$2,$3,$4,'1','active',$5)
    `, [endpointId, encrypted.ciphertext, encrypted.iv, encrypted.authTag, installation.actorId])

    const deletedBody = Buffer.from('deleted historical object')
    await s3.send(new PutObjectCommand({ Bucket: sourceBucket, Key: `deleted/${suffix}.txt`, Body: deletedBody }))
    await s3.send(new DeleteObjectCommand({ Bucket: sourceBucket, Key: `deleted/${suffix}.txt` }))
    return { artifactVersionId: artifactUpload.VersionId, archiveVersionId: archiveUpload.VersionId }
  } finally {
    await db.end()
  }
}

suite('complete WorkMesh recovery bundle', () => {
  beforeAll(async () => {
    process.env.WORKMESH_MAINTENANCE_CONFIRMED = '1'
    bundleDirectory = await mkdtemp(join(tmpdir(), 'workmesh-recovery-bundle-parent-'))
    await resetDatabase(sourceDatabaseUrl!, true)
    await resetDatabase(targetDatabaseUrl!, false)
    await s3.send(new CreateBucketCommand({ Bucket: sourceBucket, ObjectLockEnabledForBucket: true }))
    await s3.send(new PutBucketVersioningCommand({ Bucket: sourceBucket, VersioningConfiguration: { Status: 'Enabled' } }))
    await seedSource()
  }, 300_000)

  afterAll(async () => {
    s3.destroy()
    await rm(bundleDirectory, { recursive: true, force: true })
    delete process.env.WORKMESH_MAINTENANCE_CONFIRMED
  })

  it('backs up, safely resumes an interrupted empty-target restore, and verifies all state', async () => {
    const bundle = join(bundleDirectory, 'bundle')
    const backup = await createRecoveryBundle({
      databaseUrl: sourceDatabaseUrl!,
      outputDirectory: bundle,
      backupEncryptionKey: backupKey,
      masterKey,
      buildSha,
      s3: { bucket: sourceBucket, clientConfig },
    })
    expect(backup.manifest.source.objectVersionCount).toBe(3)
    expect(backup.manifest.source.deleteMarkerCount).toBe(1)
    expect(backup.manifest.secretVerification).toEqual({ providerRows: 1, webhookRows: 1 })

    await expect(restoreRecoveryBundle({
      bundleDirectory: bundle,
      targetDatabaseUrl: targetDatabaseUrl!,
      targetS3: { bucket: targetBucket, clientConfig },
      backupEncryptionKey: Buffer.alloc(32, 7).toString('base64url'),
      masterKey,
    })).rejects.toThrow('RECOVERY_MANIFEST_AUTHENTICATION_FAILED')

    await expect(restoreRecoveryBundle({
      bundleDirectory: bundle,
      targetDatabaseUrl: targetDatabaseUrl!,
      targetS3: { bucket: targetBucket, clientConfig },
      backupEncryptionKey: backupKey,
      masterKey: 'f'.repeat(64),
    })).rejects.toThrow('RECOVERY_MASTER_KEY_MISMATCH')

    let interrupted = false
    await expect(restoreRecoveryBundle({
      bundleDirectory: bundle,
      targetDatabaseUrl: targetDatabaseUrl!,
      targetS3: { bucket: targetBucket, clientConfig },
      backupEncryptionKey: backupKey,
      masterKey,
      failureInjector: async (phase, context) => {
        if (!interrupted && phase === 'after_object_upload' && context.restoredObjects === 0) {
          interrupted = true
          throw new Error('SIMULATED_OBJECT_RESTORE_INTERRUPTION')
        }
      },
    })).rejects.toThrow('SIMULATED_OBJECT_RESTORE_INTERRUPTION')

    let markerInterrupted = false
    await expect(restoreRecoveryBundle({
      bundleDirectory: bundle,
      targetDatabaseUrl: targetDatabaseUrl!,
      targetS3: { bucket: targetBucket, clientConfig },
      backupEncryptionKey: backupKey,
      masterKey,
      failureInjector: async (phase) => {
        if (!markerInterrupted && phase === 'after_delete_marker') {
          markerInterrupted = true
          throw new Error('SIMULATED_DELETE_MARKER_INTERRUPTION')
        }
      },
    })).rejects.toThrow('SIMULATED_DELETE_MARKER_INTERRUPTION')

    const report = await restoreRecoveryBundle({
      bundleDirectory: bundle,
      targetDatabaseUrl: targetDatabaseUrl!,
      targetS3: { bucket: targetBucket, clientConfig },
      backupEncryptionKey: backupKey,
      masterKey,
    })
    expect(report).toMatchObject({
      status: 'passed',
      restoredObjectVersions: 3,
      restoredDeleteMarkers: 1,
      artifactObjectsVerified: 1,
      archiveObjectsVerified: 1,
      providerSecretsVerified: 1,
      webhookSecretsVerified: 1,
    })
    const evidencePath = process.env.RECOVERY_TEST_REPORT_PATH
    if (evidencePath) {
      await mkdir(dirname(evidencePath), { recursive: true })
      await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    }

    const target = createDb(targetDatabaseUrl!)
    try {
      const archive = await target.query<{ objectVersionId: string }>(
        'SELECT object_version_id AS "objectVersionId" FROM event_archive_segments',
      )
      expect(archive.rows[0]?.objectVersionId).toBeTruthy()
      expect(backup.manifest.objects.some(object => object.sourceVersionId === archive.rows[0]?.objectVersionId)).toBe(false)
    } finally {
      await target.end()
    }

    await expect(restoreRecoveryBundle({
      bundleDirectory: bundle,
      targetDatabaseUrl: targetDatabaseUrl!,
      targetS3: { bucket: targetBucket, clientConfig },
      backupEncryptionKey: backupKey,
      masterKey,
    })).resolves.toMatchObject({ status: 'passed' })

    for (const name of await readdir(bundle)) {
      if (name.startsWith('restore-journal-')) await rm(join(bundle, name), { force: true })
    }
    await expect(restoreRecoveryBundle({
      bundleDirectory: bundle,
      targetDatabaseUrl: targetDatabaseUrl!,
      targetS3: { bucket: targetBucket, clientConfig },
      backupEncryptionKey: backupKey,
      masterKey,
    })).rejects.toThrow('RECOVERY_TARGET_DATABASE_NOT_EMPTY')

    const objectPayload = backup.manifest.objects[0]!.payload
    const objectPayloadPath = join(bundle, objectPayload.path)
    const missingObjectPath = `${objectPayloadPath}.missing`
    await rename(objectPayloadPath, missingObjectPath)
    await expect(restoreRecoveryBundle({
      bundleDirectory: bundle,
      targetDatabaseUrl: targetDatabaseUrl!,
      targetS3: { bucket: targetBucket, clientConfig },
      backupEncryptionKey: backupKey,
      masterKey,
    })).rejects.toThrow(`RECOVERY_PAYLOAD_MISSING:${objectPayload.path}`)
    await rename(missingObjectPath, objectPayloadPath)

    const dump = backup.manifest.database.payload
    const encryptedDumpPath = join(bundle, dump.path)
    const originalDump = await readFile(encryptedDumpPath)
    await writeFile(encryptedDumpPath, originalDump.subarray(0, originalDump.length - 1))
    await expect(restoreRecoveryBundle({
      bundleDirectory: bundle,
      targetDatabaseUrl: targetDatabaseUrl!,
      targetS3: { bucket: targetBucket, clientConfig },
      backupEncryptionKey: backupKey,
      masterKey,
    })).rejects.toThrow('RECOVERY_PAYLOAD_CIPHERTEXT_MISMATCH')
    await writeFile(encryptedDumpPath, originalDump)
  }, 300_000)
})
