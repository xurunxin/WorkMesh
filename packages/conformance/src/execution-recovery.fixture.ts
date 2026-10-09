import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:https'
import { once } from 'node:events'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { WorkMeshClient } from '@workmesh/agent-sdk'
import { createMcpCoverageFixture, type Execution } from './mcp-coverage.fixture.js'

const execFileAsync = promisify(execFile)
export const saveExecutionEvidence = (name: string, value: unknown) => {
  const root = resolve(import.meta.dirname, '../../../ci-logs/execution-recovery')
  mkdirSync(root, { recursive: true })
  writeFileSync(resolve(root, name), JSON.stringify(value, null, 2) + '\n')
}
const redact = (value: string) => value.replace(/wm[ips]_[A-Za-z0-9_-]+/g, '[credential]')

export async function createExecutionRecoveryFixture() {
  const fixture = await createMcpCoverageFixture()
  const ownedModels: ReturnType<typeof createServer>[] = []
  // Public pairing allows one agentSlug per Team. This explicit privileged
  // adversarial fixture preserves real Agent/principal/Team authority while
  // giving another Connection an independently valid credential and alias.
  const pairSameAgent = async () => {
    const token = `wmi_${randomBytes(32).toString('base64url')}`
    const hash = createHash('sha256').update(token).digest('hex')
    const id = randomUUID()
    await fixture.db.query(`INSERT INTO agent_connections
      (id,workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,delegation_id,name,agent_slug,
       client_type,status,requested_capabilities,granted_capabilities,grant_agent_delegate,skill_version,skill_sha256,created_by_actor_id)
      SELECT $1,workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,delegation_id,$2,$3,
        client_type,'active',requested_capabilities,granted_capabilities,grant_agent_delegate,skill_version,skill_sha256,created_by_actor_id
      FROM agent_connections WHERE id=$4`, [id, `M1 other Connection ${id}`, `m1-same-agent-${id}`, fixture.connectionId])
    await fixture.db.query(`INSERT INTO agent_connection_credentials(connection_id,token_hash,fingerprint_prefix,status)
      VALUES($1,$2,$3,'active')`, [id, hash, hash.slice(0, 12)])
    await fixture.db.query(`INSERT INTO agent_installation_tokens
      (agent_id,token_hash,expires_at,created_by_actor_id,origin_kind,origin_connection_id)
      VALUES($1,$2,clock_timestamp()+interval '1 day',$3,'connection',$4)`, [fixture.agentId, hash, fixture.humanActorId, id])
    return { id, token, client: new WorkMeshClient({ baseUrl: fixture.baseUrl, coordinationToken: token, installationToken: token }) }
  }
  // No public second-native-credential issuance operation exists. This privileged,
  // explicit test setup creates two native credentials for the same real Agent.
  const nativeInstallation = async () => {
    const token = `wmi_${randomBytes(32).toString('base64url')}`
    const row = (await fixture.db.query<{ id: string }>(`INSERT INTO agent_installation_tokens
      (agent_id,token_hash,expires_at,created_by_actor_id,origin_kind)
      VALUES($1,$2,clock_timestamp()+interval '1 day',$3,'native') RETURNING id`,
    [fixture.agentId, createHash('sha256').update(token).digest('hex'), fixture.humanActorId])).rows[0]!
    return { id: row.id, token, client: new WorkMeshClient({ baseUrl: fixture.baseUrl, installationToken: token }) }
  }
  const refreshExecution = async (execution: Execution, installationToken: string) => {
    const client = new WorkMeshClient({ baseUrl: fixture.baseUrl, installationToken })
    const { sessionToken } = await client.refreshSessionToken(execution.sessionId, installationToken, { idempotencyKey: randomUUID() })
    return { ...execution, token: sessionToken, client: new WorkMeshClient({ baseUrl: fixture.baseUrl, sessionToken }) }
  }
  const facts = async () => {
    const tables = ['agent_connections', 'agent_connection_credentials', 'agent_installation_tokens', 'agent_session_tokens',
      'agent_sessions', 'delegations', 'leases', 'agent_plan_versions', 'agent_plan_steps', 'approvals', 'agent_activities',
      'api_idempotency_keys', 'auth_idempotency_records', 'domain_events', 'outbox_events', 'workbench_conversations',
      'workbench_turns', 'workbench_runner_attempts', 'workbench_messages', 'workbench_execution_waits']
    const result: Record<string, { count: string; fingerprint: string }> = {}
    for (const table of tables) result[table] = (await fixture.db.query<{ count: string; fingerprint: string }>(
      `SELECT count(*)::text AS count,md5(coalesce(string_agg(to_jsonb(fact)::text,'' ORDER BY to_jsonb(fact)::text),'')) AS fingerprint FROM ${table} fact`)).rows[0]!
    return result
  }
  const createPi = async (execution: Execution, wait: { state: 'awaiting_approval' | 'awaiting_input' | 'blocked'; reason: string; approval?: { id: string; actionPayloadHash: string } } | null,
    beforeWaitTool?: (conversationId: string) => Promise<void>) => {
    let phase: 'wait' | 'continue' | 'stop' = wait ? 'wait' : 'continue'
    let phaseCalls = 0
    const captures: Array<{ phase: string; tools: string[]; returnedToolCalls: string[]; receivedToolResults: string[]; receivedMessages: string }> = []
    const model = createServer({ key: readFileSync(new URL('./fixtures/model-test-key.pem', import.meta.url)), cert: readFileSync(new URL('./fixtures/model-test-ca.pem', import.meta.url)) }, async (request, response) => {
      let body = ''; for await (const chunk of request) body += String(chunk)
      const input = JSON.parse(body) as { tools: Array<{ function: { name: string } }>; messages: Array<{ role: string; content?: unknown }> }
      const call = phaseCalls++
      if (phase === 'wait' && call === 0 && beforeWaitTool) await beforeWaitTool(conversationId)
      const consumeFirst = phase === 'continue' && wait?.approval !== undefined
      let name: string | null = phase === 'wait' && call === 0 ? 'workmesh_wait'
        : phase === 'continue' && call === 0 && consumeFirst ? 'workmesh_consume_approval'
        : phase === 'continue' && call === (consumeFirst ? 1 : 0) ? 'workmesh_complete_session' : null
      let args: unknown = wait
      if (name === 'workmesh_consume_approval' && wait?.approval) {
        const approval = (await fixture.db.query<{ revision: number }>('SELECT revision FROM approvals WHERE id=$1', [wait.approval.id])).rows[0]!
        args = { approvalId: wait.approval.id, ifMatch: approval.revision, actionPayloadHash: wait.approval.actionPayloadHash }
      } else if (name === 'workmesh_complete_session') {
        const state = (await fixture.db.query<{ revision: number }>('SELECT revision FROM agent_sessions WHERE id=$1', [execution.sessionId])).rows[0]!
        args = { ifMatch: state.revision, summary: 'M1 continuation completed after its verified Human trigger', noArtifactReason: 'Deterministic lifecycle conformance; no product artifact was produced.' }
      }
      captures.push({ phase, tools: input.tools.map(tool => tool.function.name), returnedToolCalls: phase === 'stop' ? [] : name ? [name] : [],
        receivedMessages: redact(JSON.stringify(input.messages)),
        receivedToolResults: input.messages.filter(message => message.role === 'tool').map(message => redact(JSON.stringify(message.content))) })
      if (phase === 'stop') {
        const current = await execution.client.getSession<{ revision: number }>(execution.sessionId)
        await fixture.human('POST', `/api/v1/agent-sessions/${execution.sessionId}/signals`, { signal: 'stop', reason: 'M1 Stop during model execution' }, current.revision)
        name = null
        await new Promise(done => setTimeout(done, 1_500))
      }
      if (response.destroyed) return
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      const delta = name ? { role: 'assistant', tool_calls: [{ index: 0, id: `m1-call-${phase}-${call}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }
        : { role: 'assistant', content: 'M1 public execution reply.' }
      for (const [part, finish] of [[delta, null], [{}, name ? 'tool_calls' : 'stop']] as const)
        response.write(`data: ${JSON.stringify({ id: `m1-${phase}-${call}`, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'm1-model', choices: [{ index: 0, delta: part, finish_reason: finish }] })}\n\n`)
      response.end('data: [DONE]\n\n')
    })
    ownedModels.push(model)
    model.listen(0, '127.0.0.1'); await once(model, 'listening')
    const address = model.address(); if (!address || typeof address === 'string') throw new Error('M1 model listener missing')
    const previousAllowlist = process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST
    process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST = '127.0.0.1'
    let conversationId: string, turnId: string
    try {
      const connection = await fixture.human<{ id: string }>('POST', '/api/v1/workbench/llm-connections', { scope: 'workspace', name: `M1 HTTPS deterministic model ${randomUUID()}`, apiType: 'openai-completions', baseUrl: `https://127.0.0.1:${address.port}/v1`, secretMaterial: 'm1-public-fixture-model-key' })
      const selected = await fixture.human<{ id: string }>('POST', `/api/v1/workbench/llm-connections/${connection.id}/models`, { externalModelId: 'm1-model', displayName: 'M1 model', enabled: true, capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: false, contextWindowTokens: 32768, maxOutputTokens: 2048 } }, 1)
      const conversation = await fixture.human<{ id: string }>('POST', '/api/v1/workbench/conversations', { title: 'M1 lifecycle', workItemId: execution.workItemId, agentSessionId: execution.sessionId, llmConnectionId: connection.id, llmModelId: selected.id })
      conversationId = conversation.id
      turnId = (await fixture.human<{ turn: { id: string } }>('POST', `/api/v1/workbench/conversations/${conversationId}/turns`, { messageMarkdown: 'Use your exact lifecycle tools, record a public reply and complete only after authorized continuation.' }, 1)).turn.id
    } finally {
      if (previousAllowlist === undefined) delete process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST
      else process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST = previousAllowlist
    }
    const run = async (nextPhase: typeof phase) => {
      phase = nextPhase; phaseCalls = 0
      const runnerRoot = resolve(import.meta.dirname, '../../../apps/agent-runner')
      const env: NodeJS.ProcessEnv = { ...process.env, WORKMESH_EXECUTION_WAITS_ENABLED: 'true', WORKMESH_API_URL: fixture.baseUrl,
        WORKMESH_AGENT_INSTALLATION_TOKEN: fixture.connectionToken, WORKMESH_AGENT_SESSION_ID: execution.sessionId,
        NODE_EXTRA_CA_CERTS: resolve(import.meta.dirname, 'fixtures/model-test-ca.pem') }
      delete env.DATABASE_URL; delete env.WORKMESH_MASTER_KEY; delete env.WORKMESH_BOOTSTRAP_TOKEN
      try {
        const result = await execFileAsync(process.execPath, [resolve(runnerRoot, 'node_modules/tsx/dist/cli.mjs'), resolve(runnerRoot, 'src/run-session.ts'), '--once'], { cwd: runnerRoot, env, timeout: 60_000, maxBuffer: 1_000_000 })
        saveExecutionEvidence(`pi-${execution.sessionId}-${phase}.json`, { captures, stdout: redact(result.stdout), stderr: redact(result.stderr), turnId, conversationId, executionSessionId: execution.sessionId })
        return result
      } catch (error) {
        const failed = error as Error & { stdout?: string; stderr?: string; code?: number }
        saveExecutionEvidence(`pi-${execution.sessionId}-${phase}-failed.json`, { captures, code: failed.code, message: redact(failed.message), stdout: redact(failed.stdout ?? ''), stderr: redact(failed.stderr ?? '') })
        throw error
      }
    }
    return { captures, conversationId, turnId, run }
  }
  return { ...fixture, pairSameAgent, nativeInstallation, refreshExecution, facts, createPi,
    close: async () => {
      for (const model of ownedModels) { model.closeAllConnections(); if (model.listening) await new Promise<void>((done, reject) => model.close(error => error ? reject(error) : done())) }
      await fixture.close()
      saveExecutionEvidence('owned-models-cleanup.json', { ownedListenerCount: ownedModels.length, allOwnedModelsClosed: ownedModels.every(model => !model.listening) })
    } }
}
