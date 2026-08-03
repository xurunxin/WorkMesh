import { restoreRecoveryBundle, targetRecoveryS3ConfigFromEnvironment } from '../src/restore.js'

const bundleDirectory = process.argv[2]
if (!bundleDirectory) throw new Error('Usage: pnpm db:restore <bundle-directory>')
const targetDatabaseUrl = process.env.RECOVERY_TARGET_DATABASE_URL
if (!targetDatabaseUrl) throw new Error('RECOVERY_TARGET_DATABASE_URL_REQUIRED')

const report = await restoreRecoveryBundle({
  bundleDirectory,
  targetDatabaseUrl,
  targetS3: targetRecoveryS3ConfigFromEnvironment(),
  backupEncryptionKey: process.env.WORKMESH_BACKUP_ENCRYPTION_KEY ?? '',
  masterKey: process.env.WORKMESH_MASTER_KEY ?? '',
})
process.stdout.write(`${JSON.stringify(report)}\n`)
