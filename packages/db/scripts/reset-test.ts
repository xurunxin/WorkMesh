import { createDb, applyMigrations } from '../src/index.js'

const databaseUrl = process.env.DATABASE_URL

if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) {
  throw new Error('Test database reset requires RUN_INTEGRATION=1 and DATABASE_URL.')
}

const databaseName = new URL(databaseUrl).pathname.slice(1)
if (!/(^|[_-])test(?:[_-]|$)/i.test(databaseName)) {
  throw new Error(`Refusing to reset non-test database "${databaseName}".`)
}

const db = createDb(databaseUrl)
try {
  await applyMigrations(db)
  await db.query('TRUNCATE platform_installation, workspaces CASCADE')
} finally {
  await db.end()
}
