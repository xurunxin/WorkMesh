import { createServer } from 'node:http'
import { once } from 'node:events'
import { expect, it } from 'vitest'
import { replyToPiCompaction } from './pi-compaction.fixture.js'

it('serves SDK compaction without consuming a business call or echoing its conversation', async () => {
  const business: unknown[] = []
  const server = createServer(async (request, response) => {
    const bytes: Buffer[] = []
    for await (const part of request) bytes.push(Buffer.from(part))
    const input: unknown = JSON.parse(Buffer.concat(bytes).toString('utf8'))
    if (replyToPiCompaction(input, response)) return
    if (!input || typeof input !== 'object' || !('tools' in input) || !Array.isArray(input.tools) || !input.tools.length) {
      response.writeHead(422); response.end('unrecognized tool-free request'); return
    }
    business.push(input)
    response.end(JSON.stringify({ scriptedBusinessCall: business.length }))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture listener missing')
  const url = `http://127.0.0.1:${address.port}`
  const post = (body: unknown) => fetch(url, { method: 'POST', body: JSON.stringify(body) })
  try {
    const privateConversation = 'private fixture operational context'
    for (const role of ['system', 'developer']) {
      const summary = await post({ messages: [{ role, content: 'You are a context summarization assistant. Your task is to read a conversation.' },
        { role: 'user', content: [{ type: 'text', text: `<conversation>\n${privateConversation}\n</conversation>` }] }] })
      const wire = await summary.text()
      expect(summary.status).toBe(200)
      expect(summary.headers.get('content-type')).toBe('text/event-stream')
      expect(wire).toContain('[DONE]')
      expect(wire).toContain('"finish_reason":"stop"')
      expect(wire).not.toContain(privateConversation)
      expect(wire).not.toContain('tool_calls')
      expect(business).toHaveLength(0)
    }
    const unknown = await post({ messages: [{ role: 'user', content: 'an ordinary business prompt' }] })
    expect(unknown.status).toBe(422); await unknown.text()
    expect(business).toHaveLength(0)
    const input = { tools: [{ type: 'function', function: { name: 'workmesh_complete_session' } }],
      messages: [{ role: 'system', content: 'You are a context summarization assistant.' },
        { role: 'user', content: '<conversation>business context</conversation>' }] }
    const actual = await post(input)
    expect(await actual.json()).toEqual({ scriptedBusinessCall: 1 })
    expect(business).toEqual([input])
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close') }
})
