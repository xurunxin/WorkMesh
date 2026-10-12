import { z } from 'zod'

export const agentConnectionSupportedClients = ['codex', 'opencode', 'pi', 'generic_mcp'] as const
export const agentConnectionErrorReasonSchema = z.enum([
  'agent_slug_mismatch', 'client_type_mismatch', 'enrollment_client_type_denied',
])

const safeInstruction = z.string().min(1).max(1_000)
  .refine(value => !/[\u0000-\u001f\u007f-\u009f]|wm[ipes]_[A-Za-z0-9_-]{43}/.test(value), '恢复指令包含不安全内容')
export const agentConnectionErrorRecoverySchema = z.object({
  next_action: safeInstruction,
  human_action: safeInstruction,
  supported_clients: z.array(z.enum(agentConnectionSupportedClients)).min(1).max(4)
    .refine(values => new Set(values).size === values.length, '客户端类型不可重复').optional(),
})
export type AgentConnectionErrorRecovery = z.infer<typeof agentConnectionErrorRecoverySchema>

const instruction = (next_action: string, human_action = '无需人工操作'): AgentConnectionErrorRecovery => ({ next_action, human_action })
const newPairing = instruction(
  '停止兑换，保留原 pending 和旧配置。取得新配对清单后，按连接器显式放弃旧 pending 的流程重新接入。',
  '请管理员签发与当前 Agent 和客户端匹配的新配对清单。',
)
const originalRequest = instruction('保留原 pending。只用原 key、正文和客户端上下文重放原请求；缺失原身份时停止并请求新配对。',
  '原请求身份已丢失时，请管理员签发新配对清单。')
const permissionDenied = instruction('停止原动作，保留当前配置；不要换身份、扩大权限或重试被拒绝的资源。',
  '请有管理权限的 Human 核对本次接入需要的授权。')
const enrollmentUnavailable = instruction('停止本次 enrollment，保留原请求身份；不要用新 key 重领已提交的响应。',
  '请管理员签发符合当前 Agent 和客户端的新 enrollment 授权。')

export const agentConnectionErrorRecoveryCatalog: Readonly<Record<string, AgentConnectionErrorRecovery>> = Object.freeze({
  VALIDATION_ERROR: instruction('按公开接入 schema 核对字段和真实客户端类型；已存在 pending 时保留原正文，不直接改写它。'),
  IDEMPOTENCY_KEY_REQUIRED: instruction('发送前持久保存请求 key、精确正文和客户端上下文；已有 pending 时使用其中的原 key。'),
  IDEMPOTENCY_KEY_REUSED: instruction('停止本次发送，核对原 pending 与原正文。不要改变正文后复用原 key，也不要换 key 冒充原请求重放。',
    '无法恢复原请求身份时，请管理员签发新配对清单。'),
  IDEMPOTENCY_REPLAY_EXPIRED: newPairing,
  IDEMPOTENCY_REPLAY_UNAVAILABLE: instruction('保留原 pending 和旧配置，停止重领凭据；报告错误码和 correlationId。',
    '请管理员检查认证响应重放服务的可用性。'),
  AGENT_CONNECTION_PAIRING_INVALID: instruction('核对受保护输入中的完整配对码及兑换端点。安装 Token 不能兑换；不要猜测代码或改变已有 pending。',
    '输入仍不正确时，请管理员提供新的匹配配对清单。'),
  AGENT_CONNECTION_PAIRING_EXPIRED: newPairing,
  AGENT_CONNECTION_PAIRING_LOCKED: newPairing,
  AGENT_CONNECTION_PAIRING_CONSUMED: originalRequest,
  AGENT_CONNECTION_REVOKED: newPairing,
  AGENT_CONNECTION_NOT_FOUND: newPairing,
  AGENT_CONNECTION_TEAM_MISMATCH: newPairing,
  AGENT_CONNECTION_INSTALLATION_MISMATCH: newPairing,
  AGENT_CONNECTION_PRIVILEGE_ESCALATION: permissionDenied,
  UNAUTHENTICATED: instruction('停止接入，核对凭据用途和当前有效性。不要把配对码当安装 Token，不因拒绝而刷新或更换身份。',
    '请管理员核对当前 Connection 的授权与凭据状态。'),
  FORBIDDEN: permissionDenied,
  CAPABILITY_DENIED: permissionDenied,
  RESOURCE_SCOPE_DENIED: permissionDenied,
  SESSION_SCOPE_DENIED: permissionDenied,
  CSRF_FAILED: instruction('使用当前 Human 会话及对应 CSRF 值；不要使用 Agent 凭据代替 Human 管理身份。'),
  REVISION_CONFLICT: instruction('读取当前 Connection 或 policy 及其 revision，重新核对本次意图；只有明确的新动作才使用新 key 和当前 If-Match。'),
  IF_MATCH_REQUIRED: instruction('读取当前 Connection 或 policy 的 revision，在明确的管理动作中携带对应 If-Match。'),
  INVALID_STATE_TRANSITION: instruction('停止原动作，读取当前 Connection 状态；不要用重试覆盖已改变的连接生命周期。', '请管理员根据当前状态确定连接管理动作。'),
  CONFLICT: instruction('停止原动作，读取当前授权范围内的连接信息并核对原请求身份；不要盲目重复创建。', '请管理员确定当前应使用的连接清单。'),
  FEATURE_DISABLED: instruction('停止使用该部署尚未启用的接入入口。', '请部署管理员确认接入功能开关。'),
  AUTH_RATE_LIMITED: instruction('等待响应头 Retry-After 指定的完整时间，再按已有重试预算重放原 key、正文和客户端上下文。'),
  AUTH_RATE_LIMIT_UNAVAILABLE: instruction('保留原请求身份，遵守 Retry-After 和已有重试预算；不要绕过认证限流服务。',
    '请部署管理员恢复认证限流存储的可用性。'),
  AGENT_ENROLLMENT_POLICY_INVALID: enrollmentUnavailable,
  AGENT_ENROLLMENT_POLICY_REVOKED: enrollmentUnavailable,
  AGENT_ENROLLMENT_POLICY_EXPIRED: enrollmentUnavailable,
  AGENT_ENROLLMENT_POLICY_EXHAUSTED: enrollmentUnavailable,
  AGENT_ENROLLMENT_POLICY_NOT_FOUND: enrollmentUnavailable,
  AGENT_SLUG_CONFLICT: instruction('停止 enrollment；已有 Agent 不可用同一 slug 重建或隐式重新激活。',
    '请管理员确定该 Agent 应使用的注册身份。'),
  NOT_FOUND: instruction('停止本次接入，核对管理员提供的端点和清单；不要枚举其他连接。', '请管理员确认接入端点和清单。'),
  INTERNAL_ERROR: instruction('保留原 pending 和旧配置，停止新增请求身份；报告错误码和 correlationId。',
    '请部署管理员根据 correlationId 检查接入服务。'),
})

export function agentConnectionErrorRecovery(code: string, reason?: unknown): AgentConnectionErrorRecovery {
  if (code === 'AGENT_CONNECTION_CLIENT_TYPE_MISMATCH') {
    const actions = reason === 'agent_slug_mismatch'
      ? instruction('停止兑换。配对的 Agent slug 绑定不一致，supported_clients 不能修复它；保留原 pending 和旧配置。',
          '请管理员签发与当前 Agent slug 匹配的新配对清单。')
      : reason === 'enrollment_client_type_denied'
        ? instruction('停止 enrollment。supported_clients 只说明部署支持，不表示当前 policy 允许；不要轮换类型猜测授权。',
            '请管理员提供允许当前真实客户端类型的 enrollment 授权。')
        : instruction('核对真实客户端类型和 supported_clients。该列表不能修复 Agent slug 绑定；保留原 pending，不自动改类型或换 key。',
            '请管理员签发与真实客户端类型和 Agent slug 匹配的新配对清单。')
    return { ...actions, supported_clients: [...agentConnectionSupportedClients] }
  }
  return { ...(Object.hasOwn(agentConnectionErrorRecoveryCatalog, code) ? agentConnectionErrorRecoveryCatalog[code]! : agentConnectionErrorRecoveryCatalog.INTERNAL_ERROR!) }
}

export function readAgentConnectionErrorRecovery(value: unknown): AgentConnectionErrorRecovery | undefined {
  const parsed = agentConnectionErrorRecoverySchema.safeParse(value)
  const identity = z.object({ code: z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/), details: z.unknown().optional() }).safeParse(value)
  if (!parsed.success || !identity.success) return undefined
  const details = identity.data.details
  const reason = details && typeof details === 'object' && 'reason' in details ? details.reason : undefined
  if (identity.data.code === 'AGENT_CONNECTION_CLIENT_TYPE_MISMATCH' && !agentConnectionErrorReasonSchema.safeParse(reason).success)
    return undefined
  const expected = agentConnectionErrorRecovery(identity.data.code, reason)
  return parsed.data.next_action === expected.next_action && parsed.data.human_action === expected.human_action
    && JSON.stringify(parsed.data.supported_clients) === JSON.stringify(expected.supported_clients) ? parsed.data : undefined
}

// 每个消费者都核对本地目录，避免上游自由指令、秘密或终端控制符进入恢复字段。
export function readSafeAgentConnectionError(value: unknown): { code: string; recovery?: AgentConnectionErrorRecovery; correlationId?: string } | undefined {
  const parsed = z.object({ code: z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/),
    details: z.unknown().optional(),
    correlationId: z.unknown().optional(),
  }).safeParse(value)
  if (!parsed.success) return undefined
  const recovery = readAgentConnectionErrorRecovery(value)
  const trace = z.string().regex(/^[A-Za-z0-9._:/-]{1,200}$/).safeParse(parsed.data.correlationId)
  const correlationId = trace.success && !/wm[ipes]_[A-Za-z0-9_-]{43}/.test(trace.data) ? trace.data : undefined
  return { code: parsed.data.code, recovery, correlationId }
}
