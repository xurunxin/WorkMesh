import { createAdmin, createDb } from '../src/index.js'

const [email, password, displayName = 'Admin'] = process.argv.slice(2)
if (!email || !password) throw new Error('Usage: pnpm db:create-admin <email> <password> [name]')

const db = createDb()
try {
  const admin = await createAdmin(db, { email, password, displayName })
  console.log(admin.actorId)
} finally {
  await db.end()
}
