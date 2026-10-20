import { fail } from './manifest.mjs'

export function readMcpReply(body, id, contentType = '') {
  let messages
  if (contentType.toLowerCase().includes('text/event-stream') || /^(?:data:|event:|:)/.test(body.trimStart())) {
    const frames = body.replace(/\r\n/g, '\n').split('\n\n')
    messages = frames.flatMap(frame => {
      const data = frame.split('\n').filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).replace(/^ /, '')).join('\n')
      return data ? [JSON.parse(data)] : []
    })
  } else messages = [JSON.parse(body)]
  const matching = messages.filter(message => message && typeof message === 'object'
    && message.jsonrpc === '2.0' && message.id === id)
  if (matching.length !== 1) fail('INSTALL_BUSINESS_VALIDATION_FAILED')
  return matching[0]
}

export function mcpReplyStatus(reply) {
  const code = reply?.result?.structuredContent?.error?.code
  const known = ['FORBIDDEN', 'NOT_FOUND', 'UNAUTHORIZED', 'AUTH_INVALID_CREDENTIALS', 'AUTH_RATE_LIMITED',
    'AUTH_INSTALLATION_EXPIRED', 'AUTH_INSTALLATION_REVOKED', 'INSTALLATION_TOKEN_REQUIRED',
    'MCP_DISCOVERY_UNAVAILABLE', 'SESSION_BINDING_MISMATCH', 'AGENT_CONNECTION_REVOKED',
    'AGENT_SESSION_TOKEN_REQUIRED', 'VALIDATION_ERROR', 'INTERNAL_ERROR', 'UPSTREAM_ERROR']
  return { rpcError: Number.isInteger(reply?.error?.code) && reply.error.code >= -32768 && reply.error.code <= -32000
    ? reply.error.code : null, toolError: reply?.result?.isError === true,
  toolCode: known.includes(code) ? code : (code === undefined ? null : 'unknown') }
}
