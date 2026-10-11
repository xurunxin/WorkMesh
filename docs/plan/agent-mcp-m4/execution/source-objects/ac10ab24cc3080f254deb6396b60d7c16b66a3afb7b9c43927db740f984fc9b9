import { AsyncLocalStorage } from 'node:async_hooks'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { WorkMeshClient, WorkMeshSdkError } from '@workmesh/agent-sdk'
import {
  agentDiscoveryBindings, projectAdapterDiscovery,
  executionStateSchema, recoveryConditionSchema,
  type AdapterDiscovery, type QualifiedAgentCapabilityManifest,
} from '@workmesh/contracts'

export type PreparedDiscovery = { manifest: QualifiedAgentCapabilityManifest; projection: AdapterDiscovery }
type Request = { method: string; params?: { name?: string; uri?: string; arguments?: Record<string, unknown> } }
type Handler = (request: Request, extra: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>

/** 使用公开request handler接线，保留SDK输入校验和兼容callback。 */
export function installDiscovery(server: McpServer, options: {
  client: WorkMeshClient; mode?: 'read-only' | 'read-write'; coordination?: boolean
  transport?: 'http' | 'stdio' | 'embedded'
}, errorResult: (error: unknown) => Promise<Record<string, unknown>>) {
  const registered = new Set<string>()
  const resources: Array<{ bindingId: string; match: (uri: string) => Record<string, unknown> | null }> = []
  const scope = new AsyncLocalStorage<PreparedDiscovery>()
  const mode = options.mode ?? 'read-write'
  const registerTool = server.registerTool.bind(server)
  server.registerTool = ((...args: unknown[]) => {
    registered.add(`tool:${String(args[0])}`)
    const callback = args[2]
    if (typeof callback === 'function') args[2] = async (...callbackArgs: unknown[]) => {
      try { return await Reflect.apply(callback, undefined, callbackArgs) }
      catch (error) { return errorResult(error) }
    }
    return Reflect.apply(registerTool, server, args)
  }) as typeof server.registerTool
  const registerResource = server.registerResource.bind(server)
  server.registerResource = ((...args: unknown[]) => {
    const bindingId = `resource:${String(args[0])}`
    registered.add(bindingId)
    const uri = args[1]
    resources.push({ bindingId, match: uri instanceof ResourceTemplate
      ? value => uri.uriTemplate.match(value)
      : value => value === uri ? {} : null })
    return Reflect.apply(registerResource, server, args)
  }) as typeof server.registerResource
  const prepare = async (): Promise<PreparedDiscovery> => {
    const manifest = await options.client.getQualifiedAgentCapabilities()
    const configuration = options.client.discoveryCredentialConfiguration
    const projection = projectAdapterDiscovery({ kind: 'exact_session', qualification: manifest.discovery }, {
      registeredBindings: [...registered], mode, coordination: options.coordination === true,
      installationBridge: configuration.installationBridge, transport: options.transport ?? 'embedded',
    })
    return { manifest, projection }
  }
  const current = (): PreparedDiscovery => {
    const prepared = scope.getStore()
    if (!prepared) throw new WorkMeshSdkError('Discovery request scope is missing', { code: 'MCP_DISCOVERY_UNAVAILABLE' })
    return prepared
  }
  const guard = (bindingId: string, input: Record<string, unknown>, prepared: PreparedDiscovery): void => {
    if (bindingId === 'tool:get_agent_discovery') return
    const binding = prepared.projection.bindings.find(item => item.bindingId === bindingId)
    if (!binding || binding.eligibility.status === 'blocked') throw new WorkMeshSdkError('The configured identity cannot call this binding', {
      code: 'FORBIDDEN', details: { bindingId, reasons: binding?.eligibility.reasons ?? ['ADAPTER_NOT_IMPLEMENTED'] },
    })
    const rule = agentDiscoveryBindings.find(item => item.bindingId === bindingId)
    const credential = prepared.manifest.discovery.identity.credentialMode
    const variants = rule?.identityVariants.filter(item => item.credentialMode.includes(credential)) ?? []
    const targetProvided = rule?.targetParameter ? input[rule.targetParameter] !== undefined : false
    const variant = !targetProvided
      ? variants.find(item => item.variant === 'current_session_without_target') ?? variants[0]
      : variants.find(item => item.variant === 'target_execution') ?? variants[0]
    if (variant?.installationBridgeRequired && !options.client.discoveryCredentialConfiguration.installationBridge)
      throw new WorkMeshSdkError('The target bridge is not configured', { code: 'FORBIDDEN', details: { reasons: ['ADAPTER_NOT_IMPLEMENTED'] } })
    if (variant?.variant === 'self_execution' && variant.targetParameter
      && input[variant.targetParameter] !== undefined
      && input[variant.targetParameter] !== prepared.manifest.agent.sessionId)
      throw new WorkMeshSdkError('An execution credential can only bind its own Session', { code: 'SESSION_BINDING_MISMATCH' })
  }
  const setRequestHandler = server.server.setRequestHandler.bind(server.server)
  server.server.setRequestHandler = ((schema: { shape: { method: { value: string } } }, handler: Handler) => {
    const method = schema.shape.method.value
    const intercepted = ['tools/list', 'tools/call', 'resources/list', 'resources/templates/list', 'resources/read'].includes(method)
    const wrapped: Handler = !intercepted ? handler : async (request, extra) => {
      try {
        const bindingId = method === 'tools/call' ? `tool:${request.params?.name}` : undefined
        // 已知Human-only与只读拒绝在任何资格读取/命令前返回。
        const rule = agentDiscoveryBindings.find(item => item.bindingId === bindingId)
        if (rule && !rule.mode.includes(mode)) throw new WorkMeshSdkError('This deployment is read-only', { code: 'FORBIDDEN', details: { reasons: ['READ_ONLY'] } })
        if (rule && rule.operationIds.some(id => ['publishProjectUpdate', 'decideCompletionSuggestion', 'createComment', 'updateComment', 'cancelHandoff', 'completeHandoff'].includes(id)))
          throw new WorkMeshSdkError('This action is reserved for Humans', { code: 'FORBIDDEN', details: { reasons: ['ROLE_REQUIRED'] } })
        if (rule?.execution === 'adapter_internal') return await handler(request, extra)
        const configuration = options.client.discoveryCredentialConfiguration
        if (bindingId === 'tool:stop_ack') {
          // Stop 不准刷新已停止的 E；仅使用该 client 已持有的原凭据。
          if (!configuration.session) throw new WorkMeshSdkError('Stop acknowledgement requires the original execution token', { code: 'AGENT_SESSION_TOKEN_REQUIRED' })
          return await handler(request, extra)
        }
        if (rule?.identityBinding === 'installation_target') {
          // 安装身份没有 Session/Delegation/manifest；准确 handoff 目标仍由 REST 核验。
          const installation = projectAdapterDiscovery({ kind: 'installation_target', session: null, delegation: null, manifest: null, qualification: null }, {
            registeredBindings: [...registered], mode, coordination: options.coordination === true,
            installationBridge: configuration.installationBridge, transport: options.transport ?? 'embedded',
          }).bindings.find(item => item.bindingId === bindingId)
          if (!installation || installation.eligibility.status === 'blocked') throw new WorkMeshSdkError('An installation credential is required', { code: 'INSTALLATION_TOKEN_REQUIRED' })
          return await handler(request, extra)
        }
        if (bindingId && ['tool:ack_agent_session', 'tool:heartbeat'].includes(bindingId)
          && (configuration.session && !configuration.coordination || configuration.coordination && configuration.installationBridge)) {
          // 仅既有 ACK/诊断入口绕过普通发现读取；REST 用原 Token 校验 live 授权、准确 Session 和回执。
          return await handler(request, extra)
        }
        // Native clients cache their initial tool list. Keep the existing original-E
        // recovery command discoverable before Stop; its REST gate still checks the
        // exact Session, live authority and stopping state on every invocation.
        const recoveryAvailable = method === 'tools/list' && mode === 'read-write' && !!configuration.session
        const recoveryEntry = (entry: Record<string, unknown>) => ({ ...entry,
          description: `${entry.description ?? ''} 恢复入口：仅原执行 E；服务端逐次核 stopping 状态与实时授权，发现不授予权限。`,
          _meta: { ...(entry._meta as Record<string, unknown> | undefined), workmesh: {
            operationIds: ['acknowledgeAgentSessionStop'], eligibility: { status: 'requires_target_check', pendingChecks: ['original_execution_token', 'live_authority', 'session_stopping'], reasons: [] },
            returnContracts: ['OPENAPI.yaml#acknowledgeAgentSessionStop'], recoveryOnly: true,
          } },
        })
        let prepared: PreparedDiscovery
        try { prepared = await prepare() }
        catch (error) {
          if (!recoveryAvailable || !(error instanceof WorkMeshSdkError) || error.code !== 'SESSION_NOT_ACTIVE') throw error
          const result = await handler(request, extra)
          return { ...result, tools: Array.isArray(result.tools) ? result.tools.filter(entry => entry.name === 'stop_ack').map(recoveryEntry) : [] }
        }
        return await scope.run(prepared, async () => {
          if (bindingId && registered.has(bindingId)) guard(bindingId, request.params?.arguments ?? {}, prepared)
          if (method === 'resources/read' && request.params?.uri) {
            const match = resources.map(resource => ({ resource, variables: resource.match(request.params!.uri!) })).find(item => item.variables !== null)
            if (match) guard(match.resource.bindingId, match.variables!, prepared)
          }
          const result = await handler(request, extra)
          const key = method === 'tools/list' ? 'tools' : method === 'resources/list' ? 'resources' : method === 'resources/templates/list' ? 'resourceTemplates' : undefined
          if (!key || !Array.isArray(result[key])) return result
          return { ...result, [key]: (result[key] as Array<Record<string, unknown>>).filter(entry =>
            entry.name === 'get_agent_discovery' || recoveryAvailable && entry.name === 'stop_ack' || prepared.projection.bindings.some(binding =>
              binding.bindingId === `${key === 'tools' ? 'tool' : 'resource'}:${entry.name}` && binding.discoverable))
            .map(entry => {
              if (recoveryAvailable && entry.name === 'stop_ack') return recoveryEntry(entry)
              const binding = prepared.projection.bindings.find(item => item.bindingId === `${key === 'tools' ? 'tool' : 'resource'}:${entry.name}`)
              return { ...entry, _meta: { ...(entry._meta as Record<string, unknown> | undefined),
                workmesh: { operationIds: binding?.operationIds ?? [], eligibility: binding?.eligibility,
                  returnContracts: binding?.operationIds.map(operation => `OPENAPI.yaml#${operation}`) ?? [],
                } }, ...(binding?.eligibility.status === 'requires_target_check' ? {
                  description: `${entry.description ?? ''} 已知前提允许；调用仍需核目标资格：${binding.eligibility.pendingChecks.join(', ')}。`,
                } : {}) }
            }) }
        })
      } catch (error) {
        if (method === 'tools/call') return errorResult(error)
        if (error instanceof WorkMeshSdkError) throw new McpError(ErrorCode.InternalError, error.message, {
          error: { code: error.code, message: error.message, details: error.details, correlationId: error.correlationId },
        })
        throw error
      }
    }
    Reflect.apply(setRequestHandler, server.server, [schema, wrapped])
  }) as typeof server.server.setRequestHandler
  server.registerTool('get_agent_discovery', {
    description: '读取本次精确身份、adapter配置、工具/资源发现及尚需核验的前提；资格不授予权限。', inputSchema: {},
  }, async () => ({ content: [{ type: 'text', text: JSON.stringify(current()) }], structuredContent: { data: current() } }))
  return { current, prepare }
}

export function registerResourceReadTools(server: McpServer, client: WorkMeshClient): void {
  const id = z.string().uuid()
  const page = { cursor: z.string().min(1).max(8192).optional(), limit: z.number().int().min(1).max(200).optional() }
  server.registerTool('list_agent_sessions', { description: '按当前准确身份读取 Session；过滤条件不扩展授权范围。', inputSchema: { ...page, teamId: id.optional(), workItemId: id.optional(), agentId: id.optional(), principalHumanActorId: id.optional(), state: executionStateSchema.optional() } }, async ({ cursor, limit, ...filters }) => result(await client.listSessions(filters, { cursor, limit })))
  server.registerTool('list_session_plan_versions', { description: '分页读取准确 Session 的不可变 Plan 版本。', inputSchema: { ...page, sessionId: id } }, async ({ sessionId, ...options }) => result(await client.listPlanVersions(sessionId, options)))
  server.registerTool('list_approvals', { description: '分页读取当前身份授权的批准，不代替 Human 批准决定。', inputSchema: { ...page, sessionId: id.optional(), status: z.string().optional() } }, async ({ cursor, limit, ...filters }) => result(await client.listApprovals(filters, { cursor, limit })))
  server.registerTool('get_approval', { description: '读取准确批准及原 action_payload_hash。', inputSchema: { approvalId: id } }, async input => result(await client.getApproval(input.approvalId)))
  server.registerTool('list_leases', { description: '分页读取授权 Lease 和准确 version；Lease 不授予权限。', inputSchema: page }, async input => result(await client.listLeases(input)))
  server.registerTool('list_recovery_items', { description: '读取授权恢复投影；不执行恢复命令。', inputSchema: { ...page, limit: z.number().int().min(1).max(100).optional(), lifecycle: z.enum(['active', 'resolved']).optional(), condition: recoveryConditionSchema.optional(), severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional(), projectId: id.optional(), workItemId: id.optional(), sessionId: id.optional() } }, async ({ cursor, limit, ...filters }) => result(await client.listRecoveryItems(filters, { cursor, limit })))
  server.registerTool('get_recovery_item', { description: '读取不透明复合 ID 指定的恢复投影。', inputSchema: { recoveryId: z.string().regex(/^v1:[a-z_]+:[0-9a-f-]{36}$/) } }, async input => result(await client.getRecoveryItem(input.recoveryId)))
  server.registerTool('get_session_execution_result', { description: '以显式安装用途凭据只读确认原 complete/stopAck；不刷新 Token，不恢复终态写入。', inputSchema: { sessionId: id, action: z.enum(['complete', 'stop_ack']), operationKey: z.string().min(1).max(200) } }, async ({ sessionId, ...input }) => result(await client.getSessionExecutionResult(sessionId, input)))
  server.registerTool('get_server_info', { description: '读取安全发布元数据。返回：OPENAPI getServerInfo。', inputSchema: {} }, async () => result(await client.getServerInfo()))
  server.registerTool('get_server_features', { description: '读取认证部署feature。返回：OPENAPI getDeploymentFeatures。', inputSchema: {} }, async () => result(await client.getFeatures()))
  server.registerTool('get_agent_capabilities', { description: '读取原始manifest，资格和adapter名单请用get_agent_discovery。', inputSchema: {} }, async () => result(await client.getAgentCapabilities()))
  server.registerTool('get_agent_session', { description: '读取准确Session和revision；直接E只能读取自身。', inputSchema: { id } }, async input => result(await client.getSession(input.id)))
  server.registerTool('get_session_context', { description: '读取准确Session的有界上下文。', inputSchema: { id } }, async input => result(await client.getSessionContext(input.id)))
  server.registerTool('get_session_plan', { description: '读取准确Session的版本化Plan。', inputSchema: { id } }, async input => result(await client.getPlan(input.id)))
  for (const scope of ['workspace', 'team', 'project'] as const)
    server.registerTool(`get_${scope}_guidance`, { description: '读取授权范围的guidance。返回：OPENAPI guidance response。', inputSchema: { id } }, async input => result(await client.getGuidance(scope, input.id)))
  server.registerTool('get_repository_context', { description: '读取授权Repository的完整固定context和AGENTS来源；C须显式目标Session。', inputSchema: { repositoryId: id, sessionId:id.optional() } }, async input => result(await client.getRepositoryContext(input.repositoryId,{sessionId:input.sessionId})))
}
function result(data: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], structuredContent: { data } } }
