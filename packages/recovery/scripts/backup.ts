import { createRecoveryBundle, recoveryS3ConfigFromEnvironment } from '../src/backup.js'

const outputDirectory = process.argv[2]
if (!outputDirectory) throw new Error('Usage: pnpm db:backup <new-bundle-directory>')
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED')

const result = await createRecoveryBundle({
  databaseUrl,
  outputDirectory,
  backupEncryptionKey: process.env.WORKMESH_BACKUP_ENCRYPTION_KEY ?? '',
  masterKey: process.env.WORKMESH_MASTER_KEY ?? '',
  buildSha: process.env.WORKMESH_BUILD_SHA ?? '',
  s3: recoveryS3ConfigFromEnvironment(),
})
process.stdout.write(`${JSON.stringify({ status: 'passed', manifestSha256: result.manifestSha256, outputDirectory: result.outputDirectory })}\n`)
