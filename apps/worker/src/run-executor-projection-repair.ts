import { idSchema } from '@workmesh/contracts'
import { createDb } from '@workmesh/db'
import { rebuildWorkItemExecutorProjections } from './session-lifecycle.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
new URL(databaseUrl)

const workspaceId = process.env.WORKMESH_REPAIR_WORKSPACE_ID
  ? idSchema.parse(process.env.WORKMESH_REPAIR_WORKSPACE_ID)
  : undefined
const workItemId = process.env.WORKMESH_REPAIR_WORK_ITEM_ID
  ? idSchema.parse(process.env.WORKMESH_REPAIR_WORK_ITEM_ID)
  : undefined
if (workItemId && !workspaceId) {
  throw new Error('WORKMESH_REPAIR_WORKSPACE_ID is required with WORKMESH_REPAIR_WORK_ITEM_ID')
}

const db = createDb(databaseUrl)
try {
  const rebuilt = await rebuildWorkItemExecutorProjections(db,workspaceId,workItemId)
  console.log(JSON.stringify({ status: 'passed', rebuilt, workspaceId: workspaceId ?? null, workItemId: workItemId ?? null }))
} finally {
  await db.end()
}
