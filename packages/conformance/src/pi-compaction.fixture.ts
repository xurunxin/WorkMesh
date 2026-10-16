import type { ServerResponse } from 'node:http'

const summarizationPrefix = 'You are a context summarization assistant.'
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && value.every(part => record(part) && part.type === 'text' && typeof part.text === 'string'))
    return value.map(part => (part as { text: string }).text).join('\n')
  return undefined
}

// Pi 0.87.1 sends a standalone, tool-free request for context compaction. It
// must not consume the scripted business-tool call or masquerade as its result.
export function replyToPiCompaction(input: unknown, response: ServerResponse): boolean {
  if (!record(input) || (input.tools !== undefined && (!Array.isArray(input.tools) || input.tools.length !== 0))
    || !Array.isArray(input.messages)) return false
  const messages = input.messages.filter(record)
  const recognized = messages.some(message => ['system', 'developer'].includes(String(message.role))
    && text(message.content)?.startsWith(summarizationPrefix))
    && messages.some(message => message.role === 'user' && text(message.content)?.startsWith('<conversation>'))
  if (!recognized) return false
  const content = 'Test fixture context summary. Continue using the current approved WorkMesh tools.'
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  for (const [delta, finish] of [[{ role: 'assistant', content }, null], [{}, 'stop']] as const)
    response.write(`data: ${JSON.stringify({ id: 'pi-fixture-summary', object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000), model: 'm2-model', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
  response.write(`data: ${JSON.stringify({ id: 'pi-fixture-summary', object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000), model: 'm2-model', choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`)
  response.end('data: [DONE]\n\n')
  return true
}
