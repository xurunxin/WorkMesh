import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { WorkMeshClient, WorkMeshSdkError } from '@workmesh/agent-sdk'
import { agentConnectionCurrentIdentitySchema, readSafeAgentConnectionError } from '@workmesh/contracts'
import { expectationSchema, type Expectation } from '../../../apps/connector/src/config.js'
import { checkConnection, validateBootstrap } from '../../../apps/connector/src/protocol.js'

export async function runAgent(input: { expectation: Expectation; token: string }) {
  const expected = expectationSchema.parse(input.expectation)
  assert.match(input.token, /^wmi_[A-Za-z0-9_-]{43}$/)
  const fingerprint = createHash('sha256').update(input.token).digest('hex').slice(0, 12)
  const sdk = new WorkMeshClient({ baseUrl: expected.deploymentUrl,
    coordinationToken: input.token, installationToken: input.token,
    fetch: (url, init) => fetch(url, { ...init, redirect: 'error' }),
  })
  const checkIdentity = (value: unknown) => {
    const identity = agentConnectionCurrentIdentitySchema.parse(value)
    checkConnection(identity.connection, expected, fingerprint)
    assert.equal(identity.authenticated_credential.status, 'active')
    assert.equal(identity.authenticated_credential.fingerprint_prefix, fingerprint)
    assert.equal(identity.authenticated_credential.overlap_until, null)
    assert.equal(identity.connection.id, expected.connectionId)
    assert.equal(identity.connection.workspace_id, expected.workspaceId)
    assert.equal(identity.agent_actor_id, expected.agentActorId)
    assert.equal(identity.team_id, expected.teamId)
    assert.equal(identity.principal_human_actor_id, expected.principalHumanActorId)
    assert.deepEqual([...identity.granted_capabilities].sort(), [...expected.capabilities].sort())
    return identity
  }
  checkIdentity(await sdk.getCurrentAgentConnectionIdentity())
  const projects = await sdk.listProjects({ teamId: expected.teamId }, { limit: 1 })
  const client = new Client({ name: 'workmesh-docs-reader', version: '1.0.0' })
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(expected.mcpUrl), {
      requestInit: { redirect: 'error', headers: { 'X-WorkMesh-Installation-Token': input.token } },
    }))
    const call = async (name: string) => {
      const response = await client.callTool({ name, arguments: {} })
      if (response.isError) throw new Error(`MCP tool failed: ${name}`)
      return z.object({ data: z.unknown() }).parse(response.structuredContent).data
    }
    const rawVerify = await call('verify_connection')
    const verified = z.object({ connectionIdentity: z.unknown(), bootstrap: z.object({ verified: z.literal(true) }) }).parse(rawVerify)
    checkIdentity(verified.connectionIdentity)
    const rawContext = await call('get_workmesh_context')
    validateBootstrap({ verify: rawVerify, context: rawContext }, expected, fingerprint)
    const context = z.object({ team: z.object({ id: z.string().uuid() }), allowedOperations: z.array(z.string()) }).parse(rawContext)
    assert.equal(context.team.id, expected.teamId)
    const tools = await client.listTools()
    assert.ok(tools.tools.some(tool => tool.name === 'verify_connection'))
    return { connectionId: expected.connectionId, teamId: context.team.id,
      toolCount: tools.tools.length, projectCount: projects.items.length, sdkVerified: true, mcpVerified: true }
  } finally {
    await client.close()
  }
}

export function formatAgentFailure(error: unknown): string {
  if (!(error instanceof WorkMeshSdkError)) return 'Agent 接入失败，请核清单、凭据和服务状态'
  const safe = readSafeAgentConnectionError({ code: error.code, details: error.details, correlationId: error.correlationId, ...error.recovery })
  if (!safe) return 'Agent 接入失败，请核清单、凭据和服务状态'
  return `Agent 接入失败：${safe.code} HTTP ${error.status}`
    + (safe.recovery ? `\n客户端动作：${safe.recovery.next_action}\n人工动作：${safe.recovery.human_action}` : '')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const file = process.env.WORKMESH_EXPECTATION_FILE
    const token = process.env.WORKMESH_INSTALLATION_TOKEN
    if (!file || !token) throw new Error('需要已批准清单与秘密注入')
    const expectation = expectationSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
    console.log(JSON.stringify(await runAgent({ expectation, token })))
  } catch (error) {
    // 原始验证错误可能包含输入，不输出对象或响应正文。
    console.error(formatAgentFailure(error))
    process.exitCode = 1
  }
}
