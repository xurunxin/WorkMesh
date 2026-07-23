const databaseUrl = process.env.DATABASE_URL

if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) {
  throw new Error('Integration tests require RUN_INTEGRATION=1 and DATABASE_URL pointing at a dedicated test database.')
}

const databaseName = new URL(databaseUrl).pathname.slice(1)
if (!/(^|[_-])test(?:[_-]|$)/i.test(databaseName)) {
  throw new Error(`Refusing to run destructive integration tests against non-test database "${databaseName}". Use a database name containing "test".`)
}
