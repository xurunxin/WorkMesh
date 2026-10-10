import { createServer } from 'node:https'
import { readFileSync } from 'node:fs'
import { once } from 'node:events'
import { createHash, randomUUID } from 'node:crypto'
import type { Duplex } from 'node:stream'
import { saveJointEvidence } from './joint-clients.reporter.js'

export type JointModelInput = { tools?: Array<{ function: { name: string } }>; messages: Array<{ role: string; content?: unknown; tool_call_id?: string }> }
export type JointModelCall = { name: string; arguments: Record<string, unknown> }
export async function createJointModel(next: (input: JointModelInput, sequence: number) => Promise<JointModelCall | null>) {
  const modelId = randomUUID()
  const captures: Array<{ sequence: number; tools: string[]; results: unknown[]; call: JointModelCall | null }> = []
  const auxiliary: Array<{ at: string; path?: string; kind: 'no-tool-request' }> = []
  const transport = { requests: [] as Array<{ at: string; method?: string; path?: string; bytes?: number; rawSha256?: string; status?: number }>,
    tlsConnections: [] as Array<{ at: string; protocol: string | null }>, errors: [] as Array<{ at: string; stage: string; code?: string; name: string }> }
  const saveTransport = () => saveJointEvidence(`model-transport-${modelId}.json`, transport)
  const sockets = new Set<Duplex>()
  const server = createServer({ key: readFileSync(new URL('./fixtures/model-test-key.pem', import.meta.url)), cert: readFileSync(new URL('./fixtures/model-test-ca.pem', import.meta.url)) }, async (request, response) => {
    const observed: (typeof transport.requests)[number] = { at: new Date().toISOString(), method: request.method, path: request.url }
    transport.requests.push(observed); saveTransport()
    try {
      // Decode after concatenation: a network chunk may end inside a UTF-8 character.
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array))
      const bytes = Buffer.concat(chunks), raw = bytes.toString('utf8')
      observed.bytes = bytes.length; observed.rawSha256 = createHash('sha256').update(bytes).digest('hex'); saveTransport()
      const input = JSON.parse(raw) as JointModelInput
      saveJointEvidence(`model-live-${modelId}.json`, { requestPath: request.url, sequence: captures.length, tools: input.tools?.map(tool => tool.function.name), publicToolResults: input.messages.filter(item => item.role === 'tool').map(item => item.content) })
      // Native clients also ask this model for session titles without a tool registry.
      // Keep these observed requests separate from the controlled tool sequence.
      const isAuxiliary = !input.tools?.length && !input.messages.some(item => item.role === 'tool')
      if (isAuxiliary) auxiliary.push({ at: new Date().toISOString(), path: request.url, kind: 'no-tool-request' })
      const call = isAuxiliary ? null : await next(input, captures.length)
      if (call && !input.tools?.some(tool => tool.function.name === call.name)) throw new Error(`M5_MODEL_TOOL_MISSING:${call.name}`)
      if (!isAuxiliary) captures.push({ sequence: captures.length, tools: input.tools?.map(tool => tool.function.name) ?? [], results: input.messages.filter(item => item.role === 'tool').map(item => item.content), call })
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      observed.status = 200; saveTransport()
      const id = randomUUID(), delta = call ? { role: 'assistant', tool_calls: [{ index: 0, id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } }] } : { role: 'assistant', content: 'M5 public result verified.' }
      for (const [part, finish] of [[delta, null], [{}, call ? 'tool_calls' : 'stop']] as const)
        response.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'controlled', choices: [{ index: 0, delta: part, finish_reason: finish }] })}\n\n`)
      response.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`)
      response.end('data: [DONE]\n\n')
    } catch (error) { observed.status = 500; saveTransport(); saveJointEvidence(`model-error-${modelId}.json`, { error: String(error) }); response.writeHead(500); response.end(JSON.stringify({ error: { message: String(error) } })) }
  })
  server.on('secureConnection', socket => { transport.tlsConnections.push({ at: new Date().toISOString(), protocol: socket.getProtocol() }); saveTransport() })
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
  for (const stage of ['tlsClientError', 'clientError'] as const) server.on(stage, (error: Error & { code?: string }, socket: Duplex) => {
    transport.errors.push({ at: new Date().toISOString(), stage, code: error.code, name: error.name }); saveTransport(); socket.destroy()
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  return { captures, transport, auxiliary, url: `https://127.0.0.1:${(server.address() as { port: number }).port}/v1`, close: async () => {
    for (const socket of sockets) socket.destroy()
    server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()))
    saveJointEvidence(`model-${randomUUID()}.json`, { captures, transport, auxiliary, closed: !server.listening })
  } }
}
