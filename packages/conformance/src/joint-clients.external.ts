import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createWorkMeshMcpHttpServer } from '../../../apps/mcp/src/http.js'
import { createJointModel, type JointModelCall } from './joint-clients.model.js'
import { createOpenCodeRuntime } from './joint-clients.drivers.js'
import { jointEvidenceRoot, saveJointEvidence } from './joint-clients.reporter.js'

export async function createExternalConsumer(options: { baseUrl: string; installationToken?: string; sessionToken?: string; allowedTools: string[] }) {
  if (options.allowedTools.some(name => ['request_artifact_upload', 'download_verified_artifact'].includes(name)))
    throw new Error('M5_EXTERNAL_SIGNED_TRANSPORT_TOOLS_FORBIDDEN')
  const executable = process.env.M5_CLIENT_EXECUTABLE
  if (!executable) throw new Error('M5_CLIENT_EXECUTABLE_REQUIRED')
  const accessToken = randomUUID()
  const requests: Array<{ method?: string; path?: string }> = []
  const mcp = await createWorkMeshMcpHttpServer({ baseUrl: options.baseUrl, mode: 'read-write',
    ...(options.sessionToken ? { sessionToken: options.sessionToken, accessToken } : { coordination: true }) })
  mcp.listen(0, '127.0.0.1'); await once(mcp, 'listening')
  mcp.on('request', request => { requests.push({ method: request.method, path: request.url }); saveJointEvidence('opencode-mcp-live.json', { requests }) })
  let pending: { name: string; args: Record<string, unknown>; sent: boolean } | undefined
  const model = await createJointModel(async input => {
    if (!pending || pending.sent) return null
    pending.sent = true
    const name = input.tools?.find(tool => tool.function.name.endsWith(`_${pending!.name}`))?.function.name
    if (!name) throw new Error(`M5_OPENCODE_TOOL_NOT_EXPOSED:${pending.name}`)
    return { name, arguments: pending.args } satisfies JointModelCall
  })
  let driver: Awaited<ReturnType<typeof createOpenCodeRuntime>> | undefined
  try {
    driver = await createOpenCodeRuntime({ executable, evidenceRoot: jointEvidenceRoot(), modelUrl: model.url,
      mcpUrl: `http://127.0.0.1:${(mcp.address() as { port: number }).port}/mcp`,
      mcpHeaders: options.sessionToken ? { Authorization: `Bearer ${accessToken}` } : { 'X-WorkMesh-Installation-Token': options.installationToken! }, allowedTools: options.allowedTools })
  } catch (error) { mcp.closeAllConnections(); await new Promise<void>(done => mcp.close(() => done())); await model.close(); throw error }
  return { driver, model, invoke: async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    pending = { name, args, sent: false }; const before = model.captures.length
    const output = await driver!.run()
    const captures = model.captures.slice(before)
    saveJointEvidence(`opencode-${name}-${randomUUID()}.json`, { ...output, captures, actualClient: 'opencode', scope: options.sessionToken ? 'E' : 'C' })
    const results = captures.at(-1)?.results
    if (!pending.sent || !results?.length) throw new Error('M5_OPENCODE_MODEL_DID_NOT_RECEIVE_TOOL_RESULT')
    const result = results.at(-1)
    const parsed: unknown = typeof result === 'string' ? JSON.parse(result) : result
    if (parsed && typeof parsed === 'object' && 'error' in parsed) throw new Error(JSON.stringify(parsed))
    return (parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed) as T
  }, close: async () => {
    saveJointEvidence(`opencode-resources-${randomUUID()}.json`, await driver!.close())
    mcp.closeAllConnections(); await new Promise<void>(done => mcp.close(() => done())); await model.close()
  } }
}
