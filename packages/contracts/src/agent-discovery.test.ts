import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import {
  agentDiscoveryRules, agentDiscoveryBindings, deriveOperationEligibility,
  projectAdapterDiscovery, type DiscoveryFacts, type QualifiedDiscovery,
  capabilitySchema,
} from './index.js'

const id = '11111111-1111-4111-8111-111111111111'
const facts = (overrides: Partial<DiscoveryFacts> = {}): DiscoveryFacts => ({
  identity: { actorId: id, sessionId: id, credentialMode: 'coordination_connection', sessionKind: 'coordination',
    delegationRole: 'coordinator', delegationScopeType: 'team' }, state: 'executing',
  capabilities: capabilitySchema.options, features: { WORKMESH_BETA_COORDINATION_MCP: true },
  workItemId: null, projectId: null, ...overrides,
})
const operation = (qualification: QualifiedDiscovery, id: string, variant: string | null = null) =>
  qualification.operations.find(operation => operation.operationId === id && operation.variant === variant)!
const projection = (qualification: QualifiedDiscovery, installationBridge = false) => projectAdapterDiscovery(
  { kind: 'exact_session', qualification }, { registeredBindings: agentDiscoveryBindings.map(binding => binding.bindingId),
    mode: 'read-write', coordination: true, installationBridge, transport: 'embedded' })

describe('已审发现规则的已知门禁和身份投影', () => {
  it('acknowledged 的 ACK 只广告回执重放条件，新命令须 REST 判断', () => {
    const check = operation(deriveOperationEligibility(facts({ state: 'acknowledged' })), 'acknowledgeAgentSession').eligibility
    expect(check).toMatchObject({ status: 'requires_target_check', pendingChecks: expect.arrayContaining(['ackReceiptReplayOnly']) })
    expect(operation(deriveOperationEligibility(facts({ state: 'executing' })), 'acknowledgeAgentSession').eligibility.status).toBe('blocked')
  })
  it('安装交接投影使用独立 null 身份，不复用 C/E 状态角色', () => {
    const qualification = deriveOperationEligibility(facts({ state: 'completed' }))
    for (const id of ['tool:inspect_pending_handoff', 'tool:reject_handoff']) {
      expect(projection(qualification, true).bindings.find(binding => binding.bindingId === id)).toMatchObject({ discoverable: true, identityVariant: 'installation_target', eligibility: { status: 'requires_target_check', pendingChecks: ['exact_installation_target'] } })
      expect(projection(qualification, false).bindings.find(binding => binding.bindingId === id)).toMatchObject({ discoverable: false, deploymentSupported: false, eligibility: { status: 'blocked', reasons: ['INSTALLATION_TOKEN_REQUIRED'] } })
    }
  })
  it('与当前OpenAPI operation全集一致，不将计数作为验收', () => {
    const text = readFileSync(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const api = parse(text) as { paths: Record<string, Record<string, { operationId?: string }>> }
    const ids = Object.values(api.paths).flatMap(path => Object.values(path).flatMap(operation => operation.operationId ? [operation.operationId] : [])).sort()
    expect(agentDiscoveryRules.map(rule => rule.operationId).sort()).toEqual(ids)
  })
  it.each(['createProject', 'updateProject', 'createWorkItem', 'updateWorkItem', 'createProjectMilestone',
    'updateMilestone', 'deleteMilestone', 'createWorkItemRelation', 'deleteWorkItemRelation'])(
    '%s已知team scope限制在发现层执行', operationId => {
      const correct = facts()
      expect(operation(deriveOperationEligibility(correct), operationId).eligibility.status).not.toBe('blocked')
      const wrong = facts({ identity: { ...correct.identity, delegationScopeType: 'project' } })
      expect(operation(deriveOperationEligibility(wrong), operationId).eligibility).toMatchObject({ status: 'blocked', reasons: expect.arrayContaining(['RESOURCE_SCOPE_DENIED']) })
      const execution = facts({ identity: { ...correct.identity, credentialMode: 'agent_session', sessionKind: 'execution', delegationRole: 'executor' }, workItemId: id })
      expect(operation(deriveOperationEligibility(execution), operationId).eligibility.status).toBe('blocked')
    })
  it('reviewer完成/失败缺artifact能力、reviewer计划发布均已知拒绝', () => {
    const base = facts()
    const reviewer = facts({ identity: { ...base.identity, credentialMode: 'agent_session', sessionKind: 'execution', delegationRole: 'reviewer' }, workItemId: id, capabilities: ['work:read', 'work:write', 'plan:write'] })
    for (const id of ['completeAgentSession', 'failAgentSession', 'publishAgentPlan'])
      expect(operation(deriveOperationEligibility(reviewer), id).eligibility.status).toBe('blocked')
    expect(operation(deriveOperationEligibility({ ...reviewer, capabilities: [...reviewer.capabilities, 'artifact:write'] }), 'completeAgentSession').eligibility.status).not.toBe('blocked')
  })
  it('provider具名kind按联合能力判定', () => {
    const base = facts()
    const execution = facts({ identity: { ...base.identity, credentialMode: 'agent_session', sessionKind: 'execution', delegationRole: 'executor' }, workItemId: id,
      capabilities: ['work:read', 'repo:read', 'repo:write_branch'] })
    const projected = projection(deriveOperationEligibility(execution))
    expect(projected.bindings.find(binding => binding.bindingId === 'tool:open_pull_request')?.eligibility.status).toBe('blocked')
    expect(operation(deriveOperationEligibility({ ...execution, capabilities: [...execution.capabilities, 'repo:open_pr'] }), 'requestProviderAction', 'open_pull_request').eligibility.status).not.toBe('blocked')
  })
  it('verify/claim不凭返回sessionId要求目标bridge；optional room保留current路径', () => {
    const projected = projection(deriveOperationEligibility(facts()))
    for (const id of ['tool:verify_connection', 'tool:claim_work_item', 'tool:get_work_room'])
      expect(projected.bindings.find(binding => binding.bindingId === id)?.discoverable, id).toBe(true)
    const room = projected.bindings.find(binding => binding.bindingId === 'tool:get_work_room')!
    expect(room.identityVariant).toBe('current_session_without_target')
    expect(room.deploymentSupported).toBe(true)
    expect(room.identityVariants.find(variant => variant.variant === 'target_execution')).toMatchObject({ deploymentSupported: false, eligibility: { status: 'blocked' } })
    expect(projected.bindings.find(binding => binding.bindingId === 'resource:agent-session')).toMatchObject({ registered: true, deploymentSupported: false, discoverable: false })
    expect(projection(deriveOperationEligibility(facts()), true).bindings.find(binding => binding.bindingId === 'resource:agent-session')).toMatchObject({ deploymentSupported: true, eligibility: { status: 'requires_target_check' } })
  })
  it('相同API资格按mode分别投影；Context只能使用本次eligible集合', () => {
    const qualification = deriveOperationEligibility(facts())
    const readWrite = projection(qualification)
    const readOnly = projectAdapterDiscovery({ kind: 'exact_session', qualification }, { registeredBindings: agentDiscoveryBindings.map(binding => binding.bindingId), mode: 'read-only', coordination: true, installationBridge: false, transport: 'embedded' })
    expect(readWrite.bindings.find(binding => binding.bindingId === 'tool:create_project')?.discoverable).toBe(true)
    expect(readOnly.bindings.find(binding => binding.bindingId === 'tool:create_project')).toMatchObject({ registered: true, discoverable: false, eligibility: { status: 'blocked' } })
    expect(readOnly.allowedOperations).not.toContain('createProject')
  })
})
