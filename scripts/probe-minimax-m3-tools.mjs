// Live, credential-safe conformance probe. Prints metadata only, never prompts,
// model text, arguments, credential values, or upstream error bodies.
const key = process.env.MINIMAX_CN_API_KEY
if (!key) { console.error('MINIMAX_CN_API_KEY is unavailable'); process.exit(2) }

const root = 'https://api.minimax.cn/v1'
const model = 'MiniMax-M3'
const issue = { id: 'WM-PROBE-1', title: 'Conformance probe' }
const definition = {
  name: 'lookup_issue', description: 'Look up one test issue by its ID',
  parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
}
let failures = 0
async function post(path, body) {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 60_000)
  try {
    const response = await fetch(root + path, {
      method: 'POST', redirect: 'error', signal: abort.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => null)
    return { status: response.status, payload }
  } finally { clearTimeout(timer) }
}
function record(protocol, stage, result) {
  if (result.accepted === false || result.hasAssistantText === false || result.error || result.httpStatus !== 200) failures++
  console.log(JSON.stringify({ protocol, stage, ...result }))
}
function validArguments(raw) {
  try { return JSON.parse(raw)?.id === issue.id } catch { return false }
}

try {
  const first = await post('/chat/completions', {
    model, max_tokens: 512,
    messages: [{ role: 'user', content: `Call lookup_issue with id ${issue.id}, then state its title.` }],
    tools: [{ type: 'function', function: definition }], tool_choice: 'required',
  })
  const assistant = first.payload?.choices?.[0]?.message
  const toolCall = assistant?.tool_calls?.[0]
  const accepted = first.status === 200 && toolCall?.function?.name === definition.name
    && validArguments(toolCall.function.arguments)
  record('chat', 'tool_call', { httpStatus: first.status, accepted, toolCallCount: assistant?.tool_calls?.length ?? 0 })
  if (accepted) {
    const second = await post('/chat/completions', {
      model, max_tokens: 512,
      messages: [
        { role: 'user', content: `Call lookup_issue with id ${issue.id}, then state its title.` },
        assistant,
        { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(issue) },
      ],
      tools: [{ type: 'function', function: definition }],
    })
    record('chat', 'tool_result', {
      httpStatus: second.status,
      hasAssistantText: typeof second.payload?.choices?.[0]?.message?.content === 'string'
        && second.payload.choices[0].message.content.trim().length > 0,
      finishReason: second.payload?.choices?.[0]?.finish_reason ?? null,
    })
  }
} catch (error) { record('chat', 'error', { error: error?.name === 'AbortError' ? 'timeout' : 'request_failed' }) }

try {
  const first = await post('/responses', {
    model, max_output_tokens: 512,
    input: `Call lookup_issue with id ${issue.id}, then state its title.`,
    tools: [{ type: 'function', ...definition }], tool_choice: 'required',
  })
  const toolCall = first.payload?.output?.find(item => item.type === 'function_call')
  const accepted = first.status === 200 && toolCall?.name === definition.name
    && validArguments(toolCall.arguments)
  record('responses', 'tool_call', {
    httpStatus: first.status, accepted, responseStatus: first.payload?.status ?? null,
    toolCallCount: first.payload?.output?.filter(item => item.type === 'function_call').length ?? 0,
  })
  if (accepted) {
    const second = await post('/responses', {
      model, max_output_tokens: 512,
      input: [
        { role: 'user', content: `Call lookup_issue with id ${issue.id}, then state its title.` },
        { type: 'function_call', call_id: toolCall.call_id, name: toolCall.name, arguments: toolCall.arguments },
        { type: 'function_call_output', call_id: toolCall.call_id, output: JSON.stringify(issue) },
      ],
      tools: [{ type: 'function', ...definition }],
    })
    record('responses', 'tool_result', {
      httpStatus: second.status, responseStatus: second.payload?.status ?? null,
      hasAssistantText: typeof second.payload?.output_text === 'string'
        && second.payload.output_text.trim().length > 0,
    })
  }
} catch (error) { record('responses', 'error', { error: error?.name === 'AbortError' ? 'timeout' : 'request_failed' }) }
if (failures) process.exitCode = 1
