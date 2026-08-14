export type RecoveryLedgerEntry = Readonly<{
  version: string
  checksumSha256: string
  appliedAt: string
  executionMode: string
}>

export type RecoveryCount = Readonly<{ name: string; count: number }>

export type EncryptedPayload = Readonly<{
  path: string
  plaintextSha256: string
  ciphertextSha256: string
  plaintextBytes: number
  ciphertextBytes: number
  ivBase64: string
  authTagBase64: string
}>

export type RecoveryObjectVersion = Readonly<{
  kind: 'object'
  sourceKey: string
  sourceVersionId: string | null
  sourceListOrdinal: number
  isLatest: boolean
  lastModified: string | null
  etag: string | null
  contentType: string | null
  metadata: Readonly<Record<string, string>>
  retentionMode: 'GOVERNANCE' | 'COMPLIANCE' | null
  retainUntil: string | null
  legalHold: 'ON' | 'OFF' | null
  payload: EncryptedPayload
}>

export type RecoveryDeleteMarker = Readonly<{
  sourceKey: string
  sourceVersionId: string
  sourceListOrdinal: number
  isLatest: boolean
  lastModified: string | null
}>

export type RecoveryManifestV1 = Readonly<{
  format: 'workmesh-recovery-bundle'
  schemaVersion: 1
  createdAt: string
  workmesh: Readonly<{
    serverVersion: string
    buildSha: string
    schemaBaseline: number
  }>
  source: Readonly<{
    postgresServerVersion: string
    bucket: string
    bucketVersioning: 'Enabled' | 'Suspended' | 'Disabled'
    objectLockEnabled: boolean
    schemaLedger: readonly RecoveryLedgerEntry[]
    databaseCounts: readonly RecoveryCount[]
    objectVersionCount: number
    deleteMarkerCount: number
  }>
  encryption: Readonly<{
    algorithm: 'aes-256-gcm'
    backupKeyFingerprintSha256: string
    masterKeyFingerprintSha256: string
    requiredKeyBytes: 32
    webhookKeyVersions: readonly string[]
  }>
  secretVerification: Readonly<{
    providerRows: number
    webhookRows: number
  }>
  database: Readonly<{
    kind: 'postgresql-custom-dump'
    payload: EncryptedPayload
  }>
  objects: readonly RecoveryObjectVersion[]
  deleteMarkers: readonly RecoveryDeleteMarker[]
}>

export type RestoreObjectMapping = Readonly<{
  sourceKey: string
  sourceVersionId: string | null
  targetVersionId: string
}>

export type RestoreJournalV1 = Readonly<{
  schemaVersion: 1
  manifestSha256: string
  targetFingerprintSha256: string
  mappings: readonly RestoreObjectMapping[]
  deleteMarkerKeys: readonly string[]
  databaseRestored: boolean
}>

export type RecoveryReportV1 = Readonly<{
  schemaVersion: 1
  status: 'passed' | 'failed'
  startedAt: string
  endedAt: string
  manifestSha256?: string
  sourceBuildSha?: string
  targetDatabaseCounts?: readonly RecoveryCount[]
  restoredObjectVersions?: number
  restoredDeleteMarkers?: number
  artifactObjectsVerified?: number
  archiveObjectsVerified?: number
  providerSecretsVerified?: number
  webhookSecretsVerified?: number
  error?: Readonly<{ code: string; message: string }>
}>
