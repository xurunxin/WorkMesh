import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { createJointModel, type JointModelCall } from './joint-clients.model.js'
import { createOpenCodeRuntime } from './joint-clients.drivers.js'
import { jointEvidenceRoot, saveJointEvidence } from './joint-clients.reporter.js'

export async function createExternalConsumer(options: { baseUrl: string; installationToken?: string; sessionToken?: string; allowedTools: string[]; beforeToolSend?: () => Promise<void> }) {
  if (options.allowedTools.some(name => ['request_artifact_upload', 'download_verified_artifact'].includes(name)))
    throw new Error('M5_EXTERNAL_SIGNED_TRANSPORT_TOOLS_FORBIDDEN')
  const executable = process.env.M5_CLIENT_EXECUTABLE
  if (!executable) throw new Error('M5_CLIENT_EXECUTABLE_REQUIRED')
  const accessToken = randomUUID()
  const listenerId = randomUUID()
  const requests: Array<{ pid: number; method?: string; path?: string }> = []
  const processes: Array<{ pid: number | undefined; url?: string; startedAt: string; nativeExit?: number | null }> = []
  const startMcp = async (port = 0) => {
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
      M5_SERVICE_KIND: 'mcp', M5_SERVICE_PORT: String(port), M5_SERVICE_API_URL: options.baseUrl,
      ...(options.sessionToken ? { M5_SERVICE_SESSION_TOKEN: options.sessionToken, M5_SERVICE_ACCESS_TOKEN: accessToken } : {}) }
    const child = spawn(process.execPath, [resolve(import.meta.dirname, '../../../node_modules/tsx/dist/cli.mjs'), resolve(import.meta.dirname, 'joint-clients.service.ts')], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    const row: (typeof processes)[number] & { servicePid?: number } = { pid: child.pid, startedAt: new Date().toISOString() }; processes.push(row)
    saveJointEvidence(`mcp-processes-${listenerId}.json`, { processes, requests, owner: 'M5 current fixture' })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.once('exit', code => { row.nativeExit = code; saveJointEvidence(`mcp-exit-${listenerId}-${child.pid}.json`, { ...row, stderr }) })
    const url = await new Promise<string>((done, reject) => {
      let buffered = ''; const deadline = setTimeout(() => reject(new Error('M5_MCP_CHILD_READY_TIMEOUT')), 20_000)
      child.stdout.on('data', (chunk: Buffer) => {
        buffered += chunk.toString('utf8')
        let newline: number
        while ((newline = buffered.indexOf('\n')) >= 0) {
          const line = buffered.slice(0, newline); buffered = buffered.slice(newline + 1)
          try {
            const value = JSON.parse(line) as { m5Service?: string; url?: string; m5Request?: boolean; pid: number; method?: string; path?: string }
            if (value.m5Service === 'mcp' && value.url) { row.url = value.url; row.servicePid = value.pid; clearTimeout(deadline); done(value.url) }
            if (value.m5Request) requests.push({ pid: value.pid, method: value.method, path: value.path })
            saveJointEvidence(`mcp-processes-${listenerId}.json`, { processes, requests })
          } catch { /* unrelated/partial diagnostics never constitute readiness */ }
        }
      })
      child.once('exit', code => { row.nativeExit = code; clearTimeout(deadline); reject(new Error(`M5_MCP_CHILD_EXIT:${code}`)) })
    })
    return { url, child, close: async () => { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.stdin.end(); await exited } } }
  }
  let mcp = await startMcp()
  let pending: { name: string; args: Record<string, unknown>; sent: boolean } | undefined
  const model = await createJointModel(async input => {
    if (!pending || pending.sent) return null
    const name = input.tools?.find(tool => tool.function.name.endsWith(`_${pending!.name}`))?.function.name
    if (!name) throw new Error(`M5_OPENCODE_TOOL_NOT_EXPOSED:${pending.name}`)
    await options.beforeToolSend?.()
    pending.sent = true
    return { name, arguments: pending.args } satisfies JointModelCall
  })
  let driver: Awaited<ReturnType<typeof createOpenCodeRuntime>> | undefined
  try {
    driver = await createOpenCodeRuntime({ executable, evidenceRoot: jointEvidenceRoot(), modelUrl: model.url,
      mcpUrl: mcp.url + '/mcp',
      mcpHeaders: options.sessionToken ? { Authorization: `Bearer ${accessToken}` } : { 'X-WorkMesh-Installation-Token': options.installationToken! }, allowedTools: options.allowedTools })
  } catch (error) { await mcp.close(); await model.close(); throw error }
  return { driver, model, invoke: async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    pending = { name, args, sent: false }; const before = model.captures.length
    const output = await driver!.run()
    const captures = model.captures.slice(before)
    saveJointEvidence(`opencode-${name}-${randomUUID()}.json`, { ...output, captures, actualClient: 'opencode', scope: options.sessionToken ? 'E' : 'C' })
    const results = captures.at(-1)?.results
    if (!pending.sent || !results?.length) throw new Error('M5_OPENCODE_MODEL_DID_NOT_RECEIVE_TOOL_RESULT')
    const result = results.at(-1)
    const parsed: unknown = typeof result === 'string' ? JSON.parse(result) : result
    if (parsed && typeof parsed === 'object' && 'error' in parsed && parsed.error !== null) throw new Error(JSON.stringify(parsed))
    return (parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed) as T
  }, restartMcp: async () => {
    const port = Number(new URL(mcp.url).port), previousPid = mcp.child.pid
    await mcp.close(); mcp = await startMcp(port)
    saveJointEvidence(`mcp-restart-${listenerId}.json`, { previousPid, currentPid: mcp.child.pid, sameUrl: mcp.url, processes })
  }, close: async () => {
    saveJointEvidence(`opencode-resources-${randomUUID()}.json`, await driver!.close())
    await mcp.close(); await model.close()
    saveJointEvidence(`mcp-processes-${listenerId}.json`, { processes, requests, closed: true })
  } }
}
