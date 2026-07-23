import { applyMigrations, createDb } from '../src/index.js'
const db=createDb(); await applyMigrations(db); await db.end(); console.log('migrations applied')
