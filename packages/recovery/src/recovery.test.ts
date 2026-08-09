import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import {
  canonicalJson,
  decryptPayloadToFile,
  encryptReadable,
  parse32ByteKey,
  sha256,
  verifyEncryptedPayload,
} from './crypto.js'
import { readVerifiedManifest, validateManifest, writeManifest } from './manifest.js'
import { targetFingerprint } from './postgres.js'
import type { RecoveryManifestV1 } from './types.js'

const directories: string[] = []
const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'workmesh-recovery-unit-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

const manifestFixture = (payload: RecoveryManifestV1['database']['payload']): RecoveryManifestV1 => ({
  format: 'workmesh-recovery-bundle',
  schemaVersion: 1,
  createdAt: '2026-08-03T00:00:00.000Z',
  workmesh: { serverVersion: '1.0.0', buildSha: 'a'.repeat(40), schemaBaseline: 1 },
  source: {
    postgresServerVersion: '16.9',
    bucket: 'source',
    bucketVersioning: 'Enabled',
    objectLockEnabled: false,
    schemaLedger: [],
    databaseCounts: [],
    objectVersionCount: 0,
    deleteMarkerCount: 0,
  },
  encryption: {
    algorithm: 'aes-256-gcm',
    backupKeyFingerprintSha256: sha256(Buffer.alloc(32, 1)),
    masterKeyFingerprintSha256: sha256(Buffer.alloc(32, 2)),
    requiredKeyBytes: 32,
    webhookKeyVersions: [],
  },
  secretVerification: { providerRows: 0, webhookRows: 0 },
  database: { kind: 'postgresql-custom-dump', payload },
  objects: [],
  deleteMarkers: [],
})

describe('recovery bundle cryptography and manifest', () => {
  it('round-trips a streaming AES-GCM payload with both digests', async () => {
    const directory = await temporaryDirectory()
    const key = randomBytes(32)
    const encrypted = await encryptReadable(
      Readable.from([Buffer.from('database-'), Buffer.from('dump')]),
      join(directory, 'payload.enc'),
      key,
      Buffer.alloc(12, 3),
    )
    const payload = { ...encrypted, path: 'payload.enc' }
    await decryptPayloadToFile(directory, payload, join(directory, 'restored.dump'), key)
    expect(await readFile(join(directory, 'restored.dump'), 'utf8')).toBe('database-dump')
    expect(payload.plaintextSha256).toBe(sha256('database-dump'))
  })

  it('authenticates the manifest and rejects ciphertext tampering before decryption', async () => {
    const directory = await temporaryDirectory()
    const key = Buffer.alloc(32, 1)
    const encrypted = await encryptReadable(Readable.from('dump'), join(directory, 'database.dump.enc'), key, Buffer.alloc(12, 4))
    const manifest = manifestFixture({ ...encrypted, path: 'database.dump.enc' })
    await writeManifest(directory, manifest, key)
    await expect(readVerifiedManifest(directory, key)).resolves.toMatchObject({ manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
    await expect(readVerifiedManifest(directory, Buffer.alloc(32, 9))).rejects.toThrow('RECOVERY_MANIFEST_AUTHENTICATION_FAILED')

    await writeFile(join(directory, 'manifest.json'), canonicalJson({ ...manifest, createdAt: 'tampered' }))
    await expect(readVerifiedManifest(directory, key)).rejects.toThrow('RECOVERY_MANIFEST_CHECKSUM_MISMATCH')
  })

  it('rejects a traversal payload path and non-canonical keys', () => {
    const payload = {
      path: '../database.dump.enc',
      plaintextSha256: 'a'.repeat(64),
      ciphertextSha256: 'b'.repeat(64),
      plaintextBytes: 1,
      ciphertextBytes: 1,
      ivBase64: Buffer.alloc(12).toString('base64'),
      authTagBase64: Buffer.alloc(16).toString('base64'),
    }
    expect(() => validateManifest(manifestFixture(payload), 'C:/safe')).toThrow('RECOVERY_PAYLOAD_PATH_INVALID')
    expect(() => parse32ByteKey('not-a-key', 'TEST_KEY')).toThrow('TEST_KEY_INVALID')
  })

  it('rejects malformed authenticated payload metadata before reading files', () => {
    const payload = {
      path: 'database.dump.enc',
      plaintextSha256: 'a'.repeat(64),
      ciphertextSha256: 'b'.repeat(64),
      plaintextBytes: 1,
      ciphertextBytes: -1,
      ivBase64: 'not-base64',
      authTagBase64: Buffer.alloc(16).toString('base64'),
    }
    expect(() => validateManifest(manifestFixture(payload), 'C:/safe')).toThrow('RECOVERY_MANIFEST_INVALID')
  })

  it('rejects unsupported bundle and WorkMesh versions', () => {
    const payload = {
      path: 'database.dump.enc',
      plaintextSha256: 'a'.repeat(64),
      ciphertextSha256: 'b'.repeat(64),
      plaintextBytes: 1,
      ciphertextBytes: 1,
      ivBase64: Buffer.alloc(12).toString('base64'),
      authTagBase64: Buffer.alloc(16).toString('base64'),
    }
    expect(() => validateManifest({ ...manifestFixture(payload), schemaVersion: 2 }, 'C:/safe'))
      .toThrow('RECOVERY_MANIFEST_VERSION_UNSUPPORTED')
    expect(() => validateManifest({
      ...manifestFixture(payload),
      workmesh: { serverVersion: '2.0.0', buildSha: 'a'.repeat(40), schemaBaseline: 2 },
    }, 'C:/safe')).toThrow('RECOVERY_WORKMESH_VERSION_INCOMPATIBLE')
  })

  it('reports a missing encrypted payload with its bundle path', async () => {
    const directory = await temporaryDirectory()
    await expect(verifyEncryptedPayload(directory, {
      path: 'objects/missing.enc',
      plaintextSha256: 'a'.repeat(64),
      ciphertextSha256: 'b'.repeat(64),
      plaintextBytes: 1,
      ciphertextBytes: 1,
      ivBase64: Buffer.alloc(12).toString('base64'),
      authTagBase64: Buffer.alloc(16).toString('base64'),
    })).rejects.toThrow('RECOVERY_PAYLOAD_MISSING:objects/missing.enc')
  })

  it('does not include database credentials in a restore target fingerprint', () => {
    const first = targetFingerprint('postgres://user:secret@db.example/workmesh', 'https://s3/target')
    const second = targetFingerprint('postgres://other:different@db.example/workmesh', 'https://s3/target')
    expect(first).toBe(second)
  })
})
