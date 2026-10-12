import type { FastifyRequest } from 'fastify'
import type { ZodError } from 'zod'
import { agentConnectionErrorRecovery, errorBody } from '@workmesh/contracts'

export function isAgentConnectionIngress(request: FastifyRequest, code?: string): boolean {
  const path = request.routeOptions.url ?? ''
  return path === '/.well-known/workmesh-agent'
    || path.startsWith('/api/v1/agent-connections')
    || path.startsWith('/api/v1/agent-enrollment')
    // C 的其他业务拒绝保留 M0–M5 恢复机制；这里只补安装身份认证失败。
    || (code === 'UNAUTHENTICATED' && request.headers['x-workmesh-installation-token'] !== undefined)
}

export function agentConnectionValidationDetails(error: ZodError) {
  // 只披露公开 schema 的字段名；Zod 的原错误消息可能包含提交的未知枚举值。
  const fields = new Set(['pairingCode', 'agentSlug', 'client', 'type', 'name', 'version',
    'enrollmentToken', 'slug', 'manifest', 'requestedCapabilities', 'teamId',
    'clientType', 'principalHumanActorId', 'grantAgentDelegate', 'notes'])
  return { issues: error.issues.map(issue => ({ code: issue.code,
    path: issue.path.map(part => typeof part === 'number' || fields.has(part) ? part : 'field'),
  })) }
}

export function agentConnectionErrorBody(request: FastifyRequest, ...args: Parameters<typeof errorBody>) {
  const response = errorBody(...args)
  if (!isAgentConnectionIngress(request, args[0])) return response
  const details = args[3]
  const reason = details && typeof details === 'object' && 'reason' in details ? details.reason : undefined
  return { error: { ...response.error, ...agentConnectionErrorRecovery(args[0], reason) } }
}
