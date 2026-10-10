import { randomUUID } from 'node:crypto'
import { createServer } from 'node:https'
import { createServer as createReceiver } from 'node:http'
import { once } from 'node:events'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { WorkMeshClient } from '@workmesh/agent-sdk'
import type {Capability} from '@workmesh/contracts'
import type {loadFeatureConfig} from '@workmesh/config'
import { createMcpCoverageFixture, type Execution } from './mcp-coverage.fixture.js'
import { createAgentWebhookWorker, signWebhook, signaturesMatch } from '../../../apps/worker/src/agent-webhook.js'

const exec = promisify(execFile)
const redact = (text: string) => text.replace(/wm[ips]_[A-Za-z0-9_-]+/g, '[credential]')
export const savePlanningEvidence = (name: string, value: unknown) => {
  const root = resolve(import.meta.dirname, '../../../ci-logs/planning-collaboration')
  mkdirSync(root, { recursive: true })
  writeFileSync(resolve(root, name), redact(JSON.stringify(value, null, 2)) + '\n')
}
export type ModelCall = { name: string; arguments: Record<string, unknown> }

export async function createPlanningCollaborationFixture(options:{capabilities?:Capability[];features?:Parameters<typeof loadFeatureConfig>[0]}={}) {
  const fixture = await createMcpCoverageFixture(options)
  const models: ReturnType<typeof createServer>[] = []
  const receivers: ReturnType<typeof createReceiver>[] = []
  const delivered = new Map<string, { exchangeToken: string }>()
  const deliveries = new Set<string>()
  let duplicateDeliveries = 0
  const worker = () => createAgentWebhookWorker({ db: fixture.db, allowPrivateAgentWebhooks: true })
  const receive = async (sessionId: string, installationToken: string): Promise<Execution> => {
    await worker().tick()
    const payload = delivered.get(sessionId)
    if (!payload?.exchangeToken) throw new Error('Signed HTTP target delivery missing')
    const count = deliveries.size
    // A fresh worker represents restart; durable delivered rows cannot be reclaimed.
    await worker().tick()
    if (deliveries.size !== count) throw new Error('Webhook restart redelivered settled work')
    const delivery = (await fixture.db.query<{ work_item_id: string }>('SELECT work_item_id FROM agent_sessions WHERE id=$1', [sessionId])).rows[0]!
    const client = new WorkMeshClient({ baseUrl: fixture.baseUrl, installationToken })
    const exchange = await client.exchangeSessionToken(sessionId, payload.exchangeToken, installationToken)
    await client.acknowledge(sessionId, { summary: 'M2 exact target accepted', externalUrls: [] })
    const session = await client.getSession<{ revision: number }>(sessionId)
    await client.transitionState(sessionId, 'executing', 'M2 lifecycle', { ifMatch: session.revision })
    return { sessionId, workItemId: delivery.work_item_id, token: exchange.sessionToken, client }
  }
  const attachReceiver = async (target: {agentId:string;token:string}) => {
    let secret: Buffer | undefined
    const receiver = createReceiver(async (request, response) => {
      try {
        let raw = ''; for await (const chunk of request) raw += String(chunk)
        const timestamp = Number(request.headers['workmesh-timestamp'])
        const signature = request.headers['workmesh-signature']
        if (!secret || typeof signature !== 'string' || !Number.isFinite(timestamp) || Math.abs(Date.now()/1000-timestamp)>300 || !signaturesMatch(signWebhook(secret,timestamp,raw),signature)) {
          response.writeHead(401); response.end(); return
        }
        const deliveryId = String(request.headers['workmesh-delivery-id'])
        if (deliveries.has(deliveryId)) { duplicateDeliveries++; response.writeHead(409); response.end(); return }
        const envelope = JSON.parse(raw) as { events: Array<{ type: string; payload: { sessionId: string; exchangeToken: string } }> }
        for (const event of envelope.events) if (event.type==='agent.session.created') delivered.set(event.payload.sessionId,event.payload)
        savePlanningEvidence(`delivery-${deliveryId}.json`,{ deliveryId, events: envelope.events.map(event=>({type:event.type,sessionId:event.payload.sessionId})), hmacVerified: true, timestampInWindow: true, port: (receiver.address() as {port:number}).port })
        deliveries.add(deliveryId); response.writeHead(204); response.end()
      } catch { response.writeHead(400); response.end() }
    })
    receivers.push(receiver); receiver.listen(0,'127.0.0.1'); await once(receiver,'listening')
    const address = receiver.address(); if (!address || typeof address==='string') throw new Error('Missing owned webhook listener')
    const previous = process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS
    process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS = 'true'
    try {
      const endpoint = await fixture.human<{ id: string }>('POST', `/api/v1/agents/${target.agentId}/webhook-endpoints`, { url: `http://127.0.0.1:${address.port}/m2-controlled-recipient` })
      const definition = (await fixture.db.query<{ revision: number }>('SELECT revision FROM agent_definitions WHERE id=$1', [target.agentId])).rows[0]!
      const rotated = await fixture.human<{ secret: string }>('POST', `/api/v1/agents/${target.agentId}/webhook-endpoints/${endpoint.id}/rotate-secret`, {}, definition.revision)
      secret = Buffer.from(rotated.secret)
      savePlanningEvidence(`receiver-${target.agentId}.json`, { agentId: target.agentId, endpointId: endpoint.id, port: address.port, owned: true, transport: 'http-loopback', hmacVerificationEnabled: true })
    } finally {
      if (previous === undefined) delete process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS
      else process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS = previous
    }
    return target
  }
  const registerTarget = async (capabilities:Capability[]=['work:read','work:write','artifact:write']) => attachReceiver(await fixture.pairTarget(capabilities))
  const registerCurrentReceiver = async () => attachReceiver({agentId:fixture.agentId,token:fixture.connectionToken})
  const runnerProxy = async (options:{loseFailResponse?:boolean;afterSettlement?:()=>Promise<void>;afterResponse?:(path:string,status:number)=>Promise<void>}) => {
    const proxy=createReceiver(async(request,response)=>{
      try {
        const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk))
        const headers:Record<string,string>={}
        for(const [name,value] of Object.entries(request.headers))if(value && !['host','connection','content-length'].includes(name))headers[name]=Array.isArray(value)?value.join(','):value
        const upstream=await fetch(fixture.baseUrl+(request.url??'/'),{method:request.method,headers,
          ...(['GET','HEAD'].includes(request.method??'GET')?{}:{body:Buffer.concat(chunks)})})
        const body=Buffer.from(await upstream.arrayBuffer())
        await options.afterResponse?.(request.url??'/',upstream.status)
        if(request.url?.endsWith('/settle') && upstream.ok)await options.afterSettlement?.()
        if(options.loseFailResponse && request.url?.endsWith('/fail')) {
          savePlanningEvidence(`fail-response-loss-${randomUUID()}.json`,{upstreamStatus:upstream.status,responseDestroyedAfterUpstreamCommit:true})
          response.destroy();return
        }
        response.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')??'application/json'});response.end(body)
      } catch {response.destroy()}
    })
    receivers.push(proxy);proxy.listen(0,'127.0.0.1');await once(proxy,'listening')
    return `http://127.0.0.1:${(proxy.address() as {port:number}).port}`
  }
  const pi = async (execution: Execution, installationToken: string, calls: Array<() => Promise<ModelCall>>, options:{apiUrl?:string;beforeRun?:()=>Promise<void>;contextHuman?:typeof fixture.human}={}) => {
    const captures: Array<{ tools: string[]; results: string[]; messages: string; call: ModelCall | null }> = []
    const model = createServer({ key: readFileSync(new URL('./fixtures/model-test-key.pem', import.meta.url)), cert: readFileSync(new URL('./fixtures/model-test-ca.pem', import.meta.url)) }, async (request, response) => {
      try {
      let body = ''; for await (const chunk of request) body += String(chunk)
      const input = JSON.parse(body) as { tools: Array<{ function: { name: string } }>; messages: Array<{ role: string; content?: unknown }> }
      const call = await calls[captures.length]?.() ?? null
      captures.push({ tools: input.tools.map(tool => tool.function.name), messages: redact(JSON.stringify(input.messages)), results: input.messages.filter(item => item.role === 'tool').map(item => redact(JSON.stringify(item.content))), call })
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      const delta = call ? { role: 'assistant', tool_calls: [{ index: 0, id: `m2-call-${captures.length}`, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } }] } : { role: 'assistant', content: 'M2 verified operational result.' }
      for (const [part, finish] of [[delta, null], [{}, call ? 'tool_calls' : 'stop']] as const)
        response.write(`data: ${JSON.stringify({ id: `m2-${captures.length}`, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model: 'm2-model', choices: [{ index: 0, delta: part, finish_reason: finish }] })}\n\n`)
      response.write(`data: ${JSON.stringify({ id: `m2-${captures.length}`, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model: 'm2-model', choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`)
      response.end('data: [DONE]\n\n')
      } catch (error) { response.writeHead(500); response.end(JSON.stringify({ error: { message: String(error) } })) }
    })
    models.push(model); model.listen(0, '127.0.0.1'); await once(model, 'listening')
    const address = model.address(); if (!address || typeof address === 'string') throw new Error('Missing model listener')
    const previous = process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST
    process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST = '127.0.0.1'
    try {
      const connection = await fixture.human<{ id: string }>('POST', '/api/v1/workbench/llm-connections', { scope: 'workspace', name: `M2 ${randomUUID()}`, apiType: 'openai-completions', baseUrl: `https://127.0.0.1:${address.port}/v1`, secretMaterial: 'm2-public-fixture-key' })
      const selected = await fixture.human<{ id: string }>('POST', `/api/v1/workbench/llm-connections/${connection.id}/models`, { externalModelId: 'm2-model', displayName: 'M2 model', enabled: true, capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: false, contextWindowTokens: 32768, maxOutputTokens: 2048 } }, 1)
      const contextHuman = options.contextHuman ?? fixture.human
      const conversation = await contextHuman<{ id: string }>('POST', '/api/v1/workbench/conversations', { title: 'M2 verified lifecycle', workItemId: execution.workItemId, agentSessionId: execution.sessionId, llmConnectionId: connection.id, llmModelId: selected.id })
      const queued = await contextHuman<{ turn: { id: string } }>('POST', `/api/v1/workbench/conversations/${conversation.id}/turns`, { messageMarkdown: 'Use the exact approved tools and produce auditable evidence.' }, 1)
      const root = resolve(import.meta.dirname, '../../../apps/agent-runner')
      const env: NodeJS.ProcessEnv = { ...process.env, WORKMESH_API_URL: options.apiUrl??fixture.baseUrl, WORKMESH_AGENT_INSTALLATION_TOKEN: installationToken, WORKMESH_AGENT_SESSION_ID: execution.sessionId, NODE_EXTRA_CA_CERTS: resolve(import.meta.dirname, 'fixtures/model-test-ca.pem') }
      delete env.DATABASE_URL; delete env.WORKMESH_MASTER_KEY; delete env.WORKMESH_BOOTSTRAP_TOKEN
      await options.beforeRun?.()
      const argv = [resolve(root, 'node_modules/tsx/dist/cli.mjs'), resolve(root, 'src/run-session.ts'), '--once']
      const startedAt = new Date().toISOString(), started = performance.now()
      try {
        const running = exec(process.execPath, argv, { cwd: root, env, timeout: 60_000, maxBuffer: 1_000_000 })
        savePlanningEvidence(`pi-${queued.turn.id}-process.json`, { pid: running.child.pid, argv: [process.execPath, ...argv], startedAt, turnId: queued.turn.id, sessionId: execution.sessionId, owned: true })
        const output = await running
        savePlanningEvidence(`pi-${queued.turn.id}.json`, { captures, stdout: output.stdout, stderr: output.stderr, turnId: queued.turn.id, sessionId: execution.sessionId, pid: running.child.pid, nativeExit: 0, startedAt, endedAt: new Date().toISOString(), runtimeMs: performance.now() - started })
        return captures
      } catch (error) {
        const failure = error as Error & { stdout?: string; stderr?: string; code?: number }
        savePlanningEvidence(`pi-${queued.turn.id}-failed.json`, { captures, code: failure.code, message: failure.message, stdout: failure.stdout, stderr: failure.stderr })
        throw error
      }
    } finally {
      if (previous === undefined) delete process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST
      else process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST = previous
    }
  }
  return { ...fixture, receive, attachReceiver, registerTarget, registerCurrentReceiver, pi,
    loseFailResponse:()=>runnerProxy({loseFailResponse:true}),afterSettlement:(afterSettlement:()=>Promise<void>)=>runnerProxy({afterSettlement}),
    afterResponse:(afterResponse:(path:string,status:number)=>Promise<void>)=>runnerProxy({afterResponse}),
    webhookWorker: worker, deliveryCounts:()=>({accepted:deliveries.size,duplicates:duplicateDeliveries}), close: async () => {
    for (const receiver of receivers) { receiver.closeAllConnections(); if (receiver.listening) await new Promise<void>((done,reject)=>receiver.close(error=>error?reject(error):done())) }
    for (const model of models) { model.closeAllConnections(); if (model.listening) await new Promise<void>((done, reject) => model.close(error => error ? reject(error) : done())) }
    await fixture.close()
    savePlanningEvidence('cleanup.json', { modelCount: models.length, modelsClosed: models.every(model => !model.listening), receiverCount: receivers.length, receiversClosed: receivers.every(receiver=>!receiver.listening), signedDeliveryCount: deliveries.size, duplicateDeliveries })
  } }
}
