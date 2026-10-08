import { createDb } from '../../../../packages/db/src/index.js'
import { FakeGitProvider } from '../../../../packages/git-provider/src/index.js'
import { createProviderActionWorker } from '../../../worker/src/provider-actions.js'

export async function resolveReadinessContext(actionId: string) {
  const db = createDb()
  try {
    const action = (await db.query<{ connection_id: string; external_id: string; payload: { baseSha: string; baseBranch: string } }>(
      'SELECT a.connection_id,r.external_id,a.payload FROM provider_actions a JOIN repositories r ON r.id=a.repository_id WHERE a.id=$1', [actionId],
    )).rows[0]!
    const provider = new FakeGitProvider()
    provider.seedRepository(action.connection_id, action.external_id, action.payload.baseBranch, action.payload.baseSha)
    provider.seedRepositoryFiles(action.connection_id, action.external_id, action.payload.baseSha, { 'AGENTS.md': '# 固定测试仓库指导原件\n' })
    const worker = createProviderActionWorker({ db, resolveProvider: () => provider, workerId: `a2-e2e-${actionId}` })
    await worker.tick()
    const status = (await db.query('SELECT status FROM provider_actions WHERE id=$1', [actionId])).rows[0]?.status
    if (status !== 'completed') throw Error(`A2 context action not completed: ${String(status)}`)
  } finally { await db.end() }
}
