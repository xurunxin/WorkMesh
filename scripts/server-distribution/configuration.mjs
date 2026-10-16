import { fail } from './manifest.mjs'

const targets = { postgres: '/var/lib/postgresql/data', redis: '/data', minio: '/data' }
const volumeBindings = document => Object.entries(targets).map(([role, target]) => {
  const mounts = document?.services?.[role]?.volumes?.filter(mount => mount.target === target) ?? []
  const mount = mounts[0]
  const name = document?.volumes?.[mount?.source]?.name
  if (mounts.length !== 1 || mount.type !== 'volume' || mount.read_only === true
    || typeof name !== 'string' || !name) fail('INSTALL_DATA_BINDINGS_INVALID')
  return { role, target, name }
})

// A version upgrade retains the data namespace and keys. Changing them needs
// an explicit migration; a successful work-item read alone cannot prove that
// existing artifacts or encrypted provider secrets survived such a change.
export function assertStableDataBindings(previous, next, options) {
  if (options.previousProfile !== options.nextProfile) fail('INSTALL_PROFILE_CHANGE_REQUIRES_MIGRATION')
  if (JSON.stringify(volumeBindings(previous)) !== JSON.stringify(volumeBindings(next))) fail('INSTALL_DATA_BINDINGS_CHANGED')
  const before = previous?.services?.api?.environment
  const after = next?.services?.api?.environment
  for (const name of ['DATABASE_URL', 'WORKMESH_MASTER_KEY', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'AUTH_RATE_LIMIT_HMAC_KEY']) {
    if (typeof before?.[name] !== 'string' || !before[name] || typeof after?.[name] !== 'string' || !after[name]) fail('INSTALL_DATA_BINDINGS_INVALID')
    if (before[name] !== after[name]) fail('INSTALL_DATA_BINDINGS_CHANGED')
  }
  if ((before.AUTH_RATE_LIMIT_REDIS_PREFIX ?? 'authrl') !== (after.AUTH_RATE_LIMIT_REDIS_PREFIX ?? 'authrl')
    || !options.previousBackupKey || options.previousBackupKey !== options.nextBackupKey) fail('INSTALL_DATA_BINDINGS_CHANGED')
}
