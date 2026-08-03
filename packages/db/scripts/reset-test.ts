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
  // Integration suites intentionally exercise arbitrary legacy endpoints. A
  // reset must therefore rebuild the dedicated test schema from the v1
  // baseline instead of asking the production upgrader to accept whichever
  // fixture endpoint the previous suite left behind.
  await db.query('DROP SCHEMA public CASCADE')
  await db.query('CREATE SCHEMA public')
  await applyMigrations(db)
} finally {
  await db.end()
}
